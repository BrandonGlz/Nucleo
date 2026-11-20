import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import * as Speech from 'expo-speech'
import { fetch as fetchExpo } from 'expo/fetch'
import { NICO_VOZ } from '../../api'
import { API_BASE_URL } from '../../services/api/client'
import { USAR_MOCKS, leerToken } from '../../services/config'

// Nico lee su respuesta en voz alta con su propia voz: masculina, amigable y la misma que en la web,
// generada en el servidor (Supertonic). El texto se divide en fragmentos y se reproduce uno mientras se
// descarga el siguiente, así la lectura sale continua. Cada fragmento se guarda en un archivo
// temporal (la petición es POST con el token de la sesión) y se borra al terminar. Si el servidor no
// responde, se usa la voz del teléfono (expo-speech), de preferencia masculina y en español.

// Quita markdown, enlaces y símbolos que no deben leerse, y deja pausas naturales.
export function limpiarParaVoz(texto = '') {
  return texto
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/^\s*\|(.*)\|\s*$/gm, '$1')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/(\*\*|__|~~)(.*?)\1/g, '$2')
    .replace(/[*_~#>]/g, '')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .replace(/°\s?C\b/g, ' grados')
    .replace(/%\s?HR\b/g, ' por ciento de humedad')
    .replace(/(\d)\s?%/g, '$1 por ciento')
    .replace(/\bppm\b/g, 'partes por millón')
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 a $2')
    .replace(/\s*[·—–]\s*/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/([.,;:!?])\s*[.,]/g, '$1')
    .trim()
}

const PRIMERO_MIN = 20
const PRIMERO_MAX = 160
const TOPE = 300

// Parte una frase demasiado larga en sus comas, en trozos de hasta `tope` caracteres.
function partirEnComas(frase, tope) {
  const salida = []
  for (const p of frase.split(/(?<=,)\s+/)) {
    const ultimo = salida.at(-1)
    if (ultimo !== undefined && ultimo.length + p.length < tope) salida[salida.length - 1] = `${ultimo} ${p}`
    else salida.push(p.length > 580 ? p.slice(0, 580) : p)
  }
  return salida
}

// Fragmentos para leer, siempre de frases completas: cada fragmento se genera aparte y, si se
// cortara a media frase, la voz lo leería como si terminara ahí (entonación de final). El primero
// es la primera frase, para que Nico empiece a hablar pronto (solo si pasa de 160 caracteres se
// corta en una coma). Los demás juntan frases enteras hasta ~3 veces el anterior y 300 caracteres:
// se generan mientras suena el anterior, así no hay esperas entre ellos.
function fragmentos(texto) {
  const frases = texto
    .split(/(?<=[.!?;:])\s+/)
    .map((f) => f.trim())
    .filter(Boolean)
  const salida = []
  for (const f of frases) {
    const ultimo = salida.at(-1)
    if (ultimo === undefined) {
      salida.push(...(f.length > PRIMERO_MAX ? partirEnComas(f, PRIMERO_MAX) : [f]))
      continue
    }
    const tope = salida.length === 1 ? PRIMERO_MAX : Math.min(TOPE, Math.max(120, 3 * (salida.at(-2)?.length ?? 0)))
    const juntar = salida.length > 1 || ultimo.length < PRIMERO_MIN
    if (juntar && ultimo.length + f.length < tope) salida[salida.length - 1] = `${ultimo} ${f}`
    else salida.push(...(f.length > TOPE ? partirEnComas(f, TOPE) : [f]))
  }
  return salida
}

// Precalienta la voz: el servidor carga el modelo en segundo plano (GET, sin audio) para que la
// primera lectura no espere esa carga. Se pide como mucho cada 4 minutos: el servidor libera el
// modelo tras 10 sin uso y cada lectura reinicia esa cuenta.
let ultimoUso = 0
export function precalentarVoz() {
  if (USAR_MOCKS || Date.now() - ultimoUso < 240000) return
  ultimoUso = Date.now()
  const token = leerToken()
  fetchExpo(`${API_BASE_URL}${NICO_VOZ}`, { headers: token ? { Authorization: `Token ${token}` } : {} }).catch(() => {
    ultimoUso = 0
  })
}

// Pide al servidor el audio de un fragmento y lo deja en un archivo temporal.
let consecutivo = 0
async function pedirAudio(texto, senal) {
  ultimoUso = Date.now()
  const token = leerToken()
  const r = await fetchExpo(`${API_BASE_URL}${NICO_VOZ}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ texto }),
    signal: senal,
  })
  if (!r.ok) throw new Error(`voz ${r.status}`)
  const datos = await r.arrayBuffer()
  if (!datos.byteLength) throw new Error('voz vacía')
  const archivo = new File(Paths.cache, `nico-voz-${Date.now()}-${++consecutivo}.mp3`)
  archivo.write(new Uint8Array(datos))
  return archivo
}

function borrar(archivo) {
  try {
    if (archivo?.exists) archivo.delete()
  } catch {
    // Es temporal: si no se puede borrar, el sistema limpia la caché.
  }
}

// --- Respaldo: voz del teléfono ------------------------------------------------------------------
const MASCULINAS = /jorge|juan|diego|carlos|pablo|raul|raúl|gerardo|alvaro|álvaro|tomas|tomás|enrique|andres|andrés|male|hombre|esd/i
const FEMENINAS = /paulina|sabina|dalia|monica|mónica|paloma|marisol|helena|laura|elena|lucia|lucía|female|mujer|esc|esf/i
const PREFERIDAS = ['es-mx', 'es-us', 'es-419']

// La mejor voz en español instalada en el teléfono, de preferencia masculina.
async function elegirVoz() {
  try {
    const voces = await Speech.getAvailableVoicesAsync()
    const nombre = (v) => `${v.identifier ?? ''} ${v.name ?? ''}`
    const puntos = (v) => {
      const lang = v.language.replace('_', '-').toLowerCase()
      const i = PREFERIDAS.indexOf(lang)
      return (
        (i >= 0 ? 30 - i * 5 : 10) +
        (MASCULINAS.test(nombre(v)) ? 20 : 0) -
        (FEMENINAS.test(nombre(v)) ? 15 : 0) +
        (v.quality === 'Enhanced' ? 6 : 0) +
        (/network|red/i.test(v.identifier) ? 0 : 1)
      )
    }
    const voz = voces.filter((v) => v.language?.toLowerCase().startsWith('es')).sort((a, b) => puntos(b) - puntos(a))[0] ?? null
    return { voz, masculina: Boolean(voz && MASCULINAS.test(nombre(voz)) && !FEMENINAS.test(nombre(voz))) }
  } catch {
    return { voz: null, masculina: false }
  }
}

export function useVozNico() {
  const [hablando, setHablando] = useState(false)
  const voz = useRef(undefined)
  // Cada lectura tiene su turno: los avisos de una lectura cancelada no tocan a la nueva.
  const turno = useRef(0)
  const actual = useRef({ reproductor: null, control: null, archivos: [], fin: null })

  const limpiar = useCallback(() => {
    const a = actual.current
    a.control?.abort()
    a.fin?.(false)
    if (a.reproductor) {
      try {
        a.reproductor.pause()
      } catch {
        // Ya estaba detenido.
      }
    }
    a.archivos.forEach(borrar)
    actual.current = { ...a, control: null, archivos: [], fin: null }
    Speech.stop().catch(() => {})
  }, [])

  useEffect(() => {
    elegirVoz().then((v) => (voz.current = v))
    // Que se escuche aunque el iPhone esté en silencio, y que baje el volumen de otras apps.
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }).catch(() => {})
    return () => {
      turno.current += 1
      limpiar()
      actual.current.reproductor?.remove()
      actual.current.reproductor = null
    }
  }, [limpiar])

  const callar = useCallback(() => {
    turno.current += 1
    limpiar()
    setHablando(false)
  }, [limpiar])

  // Respaldo: lee lo que falta con la voz del teléfono.
  const conTelefono = useCallback(async (partes, mio) => {
    if (voz.current === undefined) voz.current = await elegirVoz()
    if (mio !== turno.current) return
    const { voz: v, masculina } = voz.current
    const fin = () => mio === turno.current && setHablando(false)
    partes.forEach((f, i) => {
      const ultimo = i === partes.length - 1
      Speech.speak(f, {
        language: v?.language ?? 'es-MX',
        voice: v?.identifier,
        // Sin voz masculina disponible, se baja un poco el tono para acercarse a la de Nico.
        pitch: masculina ? 1 : 0.85,
        rate: 1.02,
        onDone: ultimo ? fin : undefined,
        onStopped: fin,
        onError: fin,
      })
    })
  }, [])

  // Reproduce un archivo y espera a que termine (true) o falle (false).
  const reproducir = useCallback((archivo) => {
    const a = actual.current
    if (!a.reproductor) a.reproductor = createAudioPlayer(null)
    const reproductor = a.reproductor
    return new Promise((resolver) => {
      let listo = false
      let cargo = false
      const terminar = (ok) => {
        if (listo) return
        listo = true
        clearTimeout(espera)
        sub.remove()
        if (actual.current.fin === terminar) actual.current.fin = null
        resolver(ok)
      }
      const sub = reproductor.addListener('playbackStatusUpdate', (st) => {
        if (st.isLoaded) cargo = true
        if (st.didJustFinish) terminar(true)
      })
      // Si el audio no carga en unos segundos, se da por fallido y sigue el respaldo.
      const espera = setTimeout(() => !cargo && terminar(false), 8000)
      a.fin = terminar
      try {
        reproductor.replace({ uri: archivo.uri })
        reproductor.play()
      } catch {
        terminar(false)
      }
    })
  }, [])

  const hablar = useCallback(
    async (texto) => {
      const limpio = limpiarParaVoz(texto)
      const mio = ++turno.current
      limpiar()
      if (!limpio) return setHablando(false)
      const partes = fragmentos(limpio)
      setHablando(true)
      if (USAR_MOCKS) return conTelefono(partes, mio)
      const control = new AbortController()
      actual.current.control = control
      // Pide los fragmentos en orden; cada uno empieza a pedirse mientras suena el anterior.
      const pedidos = []
      const pedir = (i) => {
        if (i < partes.length && !pedidos[i]) {
          pedidos[i] = pedirAudio(partes[i], control.signal).then((archivo) => {
            if (turno.current === mio) actual.current.archivos.push(archivo)
            else borrar(archivo)
            return archivo
          })
          pedidos[i].catch(() => {})
        }
        return pedidos[i]
      }
      for (let i = 0; i < partes.length; i++) {
        let archivo
        try {
          archivo = await pedir(i)
        } catch {
          if (turno.current !== mio) return
          // El servidor no respondió: lo que falta lo lee el teléfono.
          return conTelefono(partes.slice(i), mio)
        }
        if (turno.current !== mio) return
        pedir(i + 1)
        const termino = await reproducir(archivo)
        if (turno.current !== mio) return
        borrar(archivo)
        actual.current.archivos = actual.current.archivos.filter((x) => x !== archivo)
        if (!termino) return conTelefono(partes.slice(i), mio)
      }
      if (turno.current === mio) setHablando(false)
    },
    [limpiar, conTelefono, reproducir],
  )

  return { hablando, hablar, callar, preparar: precalentarVoz }
}
