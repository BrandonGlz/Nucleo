import { useCallback, useEffect, useRef, useState } from 'react'
import * as agenteApi from '../../services/agente'

// Dictado por voz en dos modos:
// - «navegador»: la Web Speech API (Chrome, Edge, Safari). Transcribe en español de México y va
//   entregando el texto provisional mientras se habla.
// - «servidor»: respaldo para los navegadores sin ese servicio (Brave, Firefox, Chromium). Graba el
//   audio con el micrófono y Whisper lo convierte a texto en el servidor de Núcleo.
// Si el modo navegador falla por falta de servicio («network»), cambia solo al de servidor.
// En los dos, al terminar de hablar (o al tocar otra vez el micrófono) deja de escuchar.
const Reconocedor = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined
const PUEDE_GRABAR =
  typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined'
// Brave tiene la API pero sin servicio de voz: va directo al respaldo.
const ES_BRAVE = typeof navigator !== 'undefined' && Boolean(navigator.brave)

export const DICTADO_SOPORTADO = Boolean(Reconocedor) || PUEDE_GRABAR
// El modo elegido se recuerda mientras dure la página.
let modoGlobal = Reconocedor && !ES_BRAVE ? 'navegador' : 'servidor'

// Tras hablar, este silencio termina la grabación. Las pausas entre palabras y al respirar suelen
// durar 200–700 ms; con 1 s no se corta a quien hace pausas cortas y se envía 0.6 s antes que con 1.6 s.
const SILENCIO_MS = 1000
const ESPERA_VOZ_MS = 8000 // sin voz en este tiempo, se deja de grabar
const MAXIMO_MS = 45000
const UMBRAL_VOZ = 0.02
// Mono a 32 kbps: la voz se entiende igual (Whisper la pasa a 16 kHz mono) y el audio pesa ~4 veces
// menos que el estéreo por defecto (unos 4 KB por segundo), así sube antes con conexiones lentas.
const BITS_POR_SEGUNDO = 32000

// Mensajes entendibles para cada error.
const ERRORES = {
  'not-allowed': 'No hay permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo.',
  'service-not-allowed': 'El navegador no permite el dictado por voz en esta página. Revisa el permiso del micrófono.',
  'audio-capture': 'No se encontró un micrófono. Conecta uno o revisa que no lo esté usando otra aplicación.',
  'no-speech': 'No se escuchó nada. Toca el micrófono y habla cerca del equipo.',
  'language-not-supported': 'Tu navegador no tiene dictado en español.',
  servidor: 'No se pudo convertir tu voz a texto. Intenta de nuevo o escribe tu pregunta.',
}

// Une el texto que ya estaba escrito con lo dictado (con un espacio entre ambos).
const unir = (base, dictado) => {
  const d = dictado.trim()
  if (!d) return base
  if (!base.trim()) return d.replace(/^([¿¡"'(]*)(\p{L})/u, (_, signo, letra) => signo + letra.toUpperCase())
  return `${base}${/\s$/.test(base) ? '' : ' '}${d}`
}

// Formato que el navegador sabe grabar (Chrome/Brave: webm, Firefox: ogg, Safari: mp4).
const formato = () =>
  ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => window.MediaRecorder.isTypeSupported?.(t)) ?? ''

// `alTexto(texto, final)` recibe el contenido completo del campo (lo escrito antes + lo dictado).
// `alTerminar(texto)` se llama cuando la persona termina de hablar, con el texto completo: el chat
// lo envía solo.
export function useDictado({ alTexto, alTerminar, idioma = 'es-MX' }) {
  const [escuchando, setEscuchando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)
  const rec = useRef(null) // reconocedor del navegador
  const grab = useRef(null) // {grabadora, flujo, contexto, reloj, cancelado}
  const alTextoRef = useRef(alTexto)
  const alTerminarRef = useRef(alTerminar)
  useEffect(() => {
    alTextoRef.current = alTexto
    alTerminarRef.current = alTerminar
  })

  // --- Modo servidor: grabar y transcribir ------------------------------------------------------

  const cerrarGrabacion = useCallback((cancelar) => {
    const g = grab.current
    if (!g) return
    if (cancelar) g.cancelado = true
    clearInterval(g.reloj)
    if (g.grabadora.state !== 'inactive') g.grabadora.stop()
  }, [])

  const grabar = useCallback(async (base) => {
    if (grab.current) return
    setError(null)
    let flujo
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: { ideal: 1 } } })
    } catch (e) {
      setError(ERRORES[e?.name === 'NotFoundError' ? 'audio-capture' : 'not-allowed'])
      return
    }
    // Mientras la persona habla, el servidor ya va cargando Whisper (si no lo tenía listo).
    agenteApi.precalentarDictado().catch(() => {})
    const tipo = formato()
    const opciones = { audioBitsPerSecond: BITS_POR_SEGUNDO, ...(tipo ? { mimeType: tipo } : {}) }
    let grabadora
    try {
      grabadora = new MediaRecorder(flujo, opciones)
    } catch {
      grabadora = new MediaRecorder(flujo)
    }
    const trozos = []
    const g = { grabadora, flujo, cancelado: false, reloj: null, contexto: null }
    grab.current = g

    // Detecta cuándo se deja de hablar midiendo el volumen del micrófono.
    try {
      const contexto = new (window.AudioContext || window.webkitAudioContext)()
      const analizador = contexto.createAnalyser()
      analizador.fftSize = 1024
      contexto.createMediaStreamSource(flujo).connect(analizador)
      const muestras = new Float32Array(analizador.fftSize)
      const inicio = Date.now()
      let hablo = false
      let ultimaVoz = inicio
      g.contexto = contexto
      g.reloj = setInterval(() => {
        analizador.getFloatTimeDomainData(muestras)
        const rms = Math.sqrt(muestras.reduce((a, v) => a + v * v, 0) / muestras.length)
        const ahora = Date.now()
        if (rms > UMBRAL_VOZ) {
          hablo = true
          ultimaVoz = ahora
        }
        if ((hablo && ahora - ultimaVoz > SILENCIO_MS) || (!hablo && ahora - inicio > ESPERA_VOZ_MS) || ahora - inicio > MAXIMO_MS) {
          g.sinVoz = !hablo
          cerrarGrabacion(false)
        }
      }, 100)
    } catch {
      // Sin AudioContext se graba hasta que se toque otra vez el micrófono (o el máximo).
      g.reloj = setInterval(() => cerrarGrabacion(false), MAXIMO_MS)
    }

    grabadora.ondataavailable = (e) => e.data.size && trozos.push(e.data)
    grabadora.onstop = async () => {
      flujo.getTracks().forEach((t) => t.stop())
      g.contexto?.close().catch(() => {})
      grab.current = null
      setEscuchando(false)
      if (g.cancelado) return
      if (g.sinVoz) {
        setError(ERRORES['no-speech'])
        return
      }
      const audio = new Blob(trozos, { type: grabadora.mimeType || tipo || 'audio/webm' })
      if (!audio.size) return
      setProcesando(true)
      try {
        const { texto } = await agenteApi.transcribir(audio)
        if (texto?.trim()) {
          const completo = unir(base, texto)
          alTextoRef.current?.(completo, true)
          alTerminarRef.current?.(completo)
        } else setError(ERRORES['no-speech'])
      } catch {
        setError(ERRORES.servidor)
      }
      setProcesando(false)
    }
    grabadora.start()
    setEscuchando(true)
  }, [cerrarGrabacion])

  // --- Modo navegador: Web Speech API ----------------------------------------------------------

  const soltar = useCallback(
    (cancelar) => {
      cerrarGrabacion(cancelar)
      const r = rec.current
      if (!r) return
      if (cancelar) {
        // Al cancelar ya no llegan más resultados ni eventos de este reconocedor.
        r.onresult = r.onerror = r.onend = null
        rec.current = null
        setEscuchando(false)
        r.abort()
      } else r.stop()
    },
    [cerrarGrabacion],
  )

  const iniciar = useCallback(
    (base = '') => {
      if (rec.current || grab.current || procesando) return
      if (modoGlobal === 'servidor') {
        if (PUEDE_GRABAR) grabar(base)
        return
      }
      setError(null)
      const r = new Reconocedor()
      let sinServicio = false
      let dicho = 
      r.lang = idioma
      r.interimResults = true
      r.continuous = false
      r.maxAlternatives = 1
      r.onresult = (e) => {
        let finales = ''
        let provisional = ''
        for (const res of e.results) {
          if (res.isFinal) finales += res[0].transcript
          else provisional += res[0].transcript
        }
        if (finales.trim()) dicho = unir(base, finales)
        alTextoRef.current?.(unir(base, `${finales} ${provisional}`), !provisional)
      }
      r.onerror = (e) => {
        if (e.error === 'aborted') return
        // Sin servicio de voz (Brave, Chromium) o sin conexión a él: se pasa al respaldo.
        if (e.error === 'network' && PUEDE_GRABAR) {
          sinServicio = true
          return
        }
        setError(ERRORES[e.error] ?? 'No se pudo usar el dictado por voz. Vuelve a intentarlo.')
      }
      r.onend = () => {
        rec.current = null
        setEscuchando(false)
        if (sinServicio) {
          modoGlobal = 'servidor'
          grabar(base)
        } else if (dicho.trim()) alTerminarRef.current?.(dicho)
      }
      rec.current = r
      try {
        r.start()
        setEscuchando(true)
      } catch {
        rec.current = null
        setError('No se pudo iniciar el dictado por voz. Vuelve a intentarlo.')
      }
    },
    [idioma, grabar, procesando],
  )

  // Al salir de la pantalla se deja de escuchar.
  useEffect(() => () => soltar(true), [soltar])

  return {
    soportado: DICTADO_SOPORTADO,
    escuchando,
    procesando,
    error,
    iniciar,
    detener: useCallback(() => soltar(false), [soltar]),
    cancelar: useCallback(() => soltar(true), [soltar]),
    limpiarError: useCallback(() => setError(null), []),
  }
}
