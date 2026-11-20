import { useCallback, useEffect, useRef, useState } from 'react'
import { NICO_VOZ } from '../../api'
import { API_BASE_URL, OPCIONES_SESION } from '../../services/api/client'
import { USAR_MOCKS } from '../../services/config'

// Nico lee su respuesta en voz alta con su propia voz: masculina, amigable y igual en todos los
// navegadores, generada en el servidor (Supertonic). El texto se divide en fragmentos y se reproduce uno
// mientras se pide el siguiente, así la lectura sale continua. Si el servidor no responde, se usa la
// voz del navegador (de preferencia masculina y en español de México).
const sintesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined
const SINTESIS_NAVEGADOR = Boolean(sintesis && typeof window.SpeechSynthesisUtterance === 'function')
export const VOZ_SOPORTADA = typeof window !== 'undefined' && (typeof window.Audio === 'function' || SINTESIS_NAVEGADOR)

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

// Fragmentos para leer. El primero es corto (la primera frase, o hasta su primera coma si es larga;
// de 20 a 80 caracteres) para que Nico empiece a hablar casi al instante. Cada fragmento se genera
// mientras suena el anterior, así que puede crecer hasta ~3 veces el anterior sin que se note la
// espera, hasta ~300 caracteres: menos cortes = lectura más fluida.
const PRIMERO_MIN = 20
const PRIMERO_MAX = 80

// Frases; las largas se parten en sus comas (después se vuelven a juntar hasta el tope de cada
// fragmento, así que solo cambia dónde puede haber un corte).
function piezas(texto) {
  return texto
    .split(/(?<=[.!?;:])\s+/)
    .flatMap((f) => (f.length > PRIMERO_MAX ? f.split(/(?<=,)\s+/) : [f]))
    .map((f) => f.trim())
    .filter(Boolean)
}

function topeDeFragmento(salida) {
  if (salida.length === 1) return PRIMERO_MAX
  return Math.min(300, Math.max(80, 3 * salida.at(-2).length))
}

function fragmentos(texto) {
  const salida = []
  for (const f of piezas(texto)) {
    const ultimo = salida.at(-1)
    const cabe = ultimo !== undefined && ultimo.length + f.length <= topeDeFragmento(salida)
    if (cabe && (salida.length > 1 || ultimo.length < PRIMERO_MIN)) salida[salida.length - 1] = `${ultimo} ${f}`
    else salida.push(f.length > 580 ? f.slice(0, 580) : f)
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
  fetch(`${API_BASE_URL}${NICO_VOZ}`, { credentials: OPCIONES_SESION.credentials, headers: OPCIONES_SESION.headers }).catch(() => {
    ultimoUso = 0
  })
}

async function pedirAudio(texto, senal) {
  ultimoUso = Date.now()
  const r = await fetch(`${API_BASE_URL}${NICO_VOZ}`, {
    method: 'POST',
    credentials: OPCIONES_SESION.credentials,
    headers: { ...OPCIONES_SESION.headers, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ texto }),
    signal: senal,
  })
  if (!r.ok) throw new Error(`voz ${r.status}`)
  return URL.createObjectURL(await r.blob())
}

// --- Respaldo: voz del navegador -----------------------------------------------------------------
const MASCULINAS = /jorge|juan|diego|carlos|pablo|raul|raúl|gerardo|alvaro|álvaro|tomas|tomás|enrique|andres|andrés|male|hombre|esd/i
const FEMENINAS = /paulina|sabina|dalia|monica|mónica|paloma|marisol|helena|laura|elena|lucia|lucía|female|mujer|esc|esf/i
function vozNavegador() {
  const voces = sintesis?.getVoices() ?? []
  const puntos = (v) => {
    const lang = v.lang.replace('_', '-').toLowerCase()
    return (lang === 'es-mx' ? 30 : lang === 'es-us' || lang === 'es-419' ? 25 : 10) + (MASCULINAS.test(v.name) ? 20 : 0) - (FEMENINAS.test(v.name) ? 15 : 0) + (/natural|neural|online/i.test(v.name) ? 5 : 0)
  }
  const voz = voces.filter((v) => v.lang?.toLowerCase().startsWith('es')).sort((a, b) => puntos(b) - puntos(a))[0] ?? null
  return { voz, masculina: Boolean(voz && MASCULINAS.test(voz.name)) }
}

export function useVozNico() {
  const [hablando, setHablando] = useState(false)
  // Cada lectura tiene su turno: los avisos de una lectura cancelada no tocan a la nueva.
  const turno = useRef(0)
  const actual = useRef({ audio: null, control: null, urls: [] })

  const limpiar = useCallback(() => {
    const a = actual.current
    a.control?.abort()
    if (a.audio) {
      a.audio.onended = a.audio.onerror = null
      a.audio.pause()
    }
    a.urls.forEach((u) => URL.revokeObjectURL(u))
    actual.current = { audio: null, control: null, urls: [] }
    sintesis?.cancel()
  }, [])

  useEffect(() => {
    if (SINTESIS_NAVEGADOR) {
      // Las voces del navegador cargan después de abrir la página.
      sintesis.getVoices()
      sintesis.addEventListener?.('voiceschanged', () => sintesis.getVoices())
    }
    return limpiar
  }, [limpiar])

  const callar = useCallback(() => {
    turno.current += 1
    limpiar()
    setHablando(false)
  }, [limpiar])

  const conNavegador = useCallback((partes, mio) => {
    if (!SINTESIS_NAVEGADOR) return setHablando(false)
    const { voz, masculina } = vozNavegador()
    partes.forEach((f, i) => {
      const u = new window.SpeechSynthesisUtterance(f)
      u.lang = voz?.lang ?? 'es-MX'
      try {
        if (voz) u.voice = voz
      } catch {
        // Si la voz no se puede asignar, se usa la del idioma.
      }
      u.rate = 1.05
      // Sin voz masculina disponible, se baja un poco el tono para acercarse a la de Nico.
      u.pitch = masculina ? 1 : 0.8
      if (i === partes.length - 1) u.onend = u.onerror = () => turno.current === mio && setHablando(false)
      sintesis.speak(u)
    })
  }, [])

  const hablar = useCallback(
    async (texto) => {
      const limpio = limpiarParaVoz(texto)
      const mio = ++turno.current
      limpiar()
      if (!limpio || !VOZ_SOPORTADA) return setHablando(false)
      const partes = fragmentos(limpio)
      setHablando(true)
      if (USAR_MOCKS) return conNavegador(partes, mio)
      const control = new AbortController()
      actual.current.control = control
      // Pide todos los fragmentos en orden; cada uno empieza a pedirse mientras suena el anterior.
      const pedidos = []
      const pedir = (i) => {
        if (i < partes.length && !pedidos[i]) {
          pedidos[i] = pedirAudio(partes[i], control.signal).then((u) => {
            actual.current.urls.push(u)
            return u
          })
          pedidos[i].catch(() => {})
        }
        return pedidos[i]
      }
      for (let i = 0; i < partes.length; i++) {
        let url
        try {
          url = await pedir(i)
        } catch {
          if (turno.current !== mio) return
          // El servidor no respondió: lo que falta lo lee el navegador.
          return conNavegador(partes.slice(i), mio)
        }
        if (turno.current !== mio) return
        pedir(i + 1)
        const audio = new Audio(url)
        actual.current.audio = audio
        const termino = await new Promise((resolver) => {
          audio.onended = () => resolver(true)
          audio.onerror = () => resolver(false)
          audio.play().catch(() => resolver(false))
        })
        if (turno.current !== mio) return
        if (!termino) return conNavegador(partes.slice(i), mio)
      }
      if (turno.current === mio) setHablando(false)
    },
    [limpiar, conNavegador],
  )

  return { soportada: VOZ_SOPORTADA, hablando, hablar, callar, preparar: precalentarVoz }
}

// Preferencia de esta persona: que Nico lea en voz alta también las respuestas a lo escrito.
const CLAVE_LEER = 'nucleo:nico-leer-respuestas'
export function useLeerRespuestas() {
  const [leer, setLeer] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_LEER) === '1'
    } catch {
      return false
    }
  })
  const cambiar = useCallback((valor) => {
    setLeer(valor)
    try {
      localStorage.setItem(CLAVE_LEER, valor ? '1' : '0')
    } catch {
      // Sin almacenamiento la preferencia dura hasta recargar.
    }
  }, [])
  return [leer, cambiar]
}
