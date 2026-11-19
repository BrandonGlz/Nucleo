import { useCallback, useEffect, useRef, useState } from 'react'

// Dictado por voz con la Web Speech API del navegador (Chrome, Edge, Safari y Opera la tienen;
// Firefox no). Transcribe en español de México y va entregando el texto provisional mientras se
// habla; al terminar de hablar (o al tocar otra vez el micrófono) deja de escuchar.
const Reconocedor = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined

export const DICTADO_SOPORTADO = Boolean(Reconocedor)

// Mensajes entendibles para cada error del reconocedor.
const ERRORES = {
  'not-allowed': 'No hay permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentarlo.',
  'service-not-allowed': 'El navegador no permite el dictado por voz en esta página. Revisa el permiso del micrófono.',
  'audio-capture': 'No se encontró un micrófono. Conecta uno o revisa que no lo esté usando otra aplicación.',
  'no-speech': 'No se escuchó nada. Toca el micrófono y habla cerca del equipo.',
  network: 'El dictado necesita conexión a internet. Revisa tu conexión y vuelve a intentarlo.',
  'language-not-supported': 'Tu navegador no tiene dictado en español.',
}

// Une el texto que ya estaba escrito con lo dictado (con un espacio entre ambos).
const unir = (base, dictado) => {
  const d = dictado.trim()
  if (!d) return base
  if (!base.trim()) return d.replace(/^([¿¡"'(]*)(\p{L})/u, (_, signo, letra) => signo + letra.toUpperCase())
  return `${base}${/\s$/.test(base) ? '' : ' '}${d}`
}

// `alTexto(texto, final)` recibe el contenido completo del campo (lo escrito antes + lo dictado).
export function useDictado({ alTexto, idioma = 'es-MX' }) {
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState(null)
  const rec = useRef(null)
  const alTextoRef = useRef(alTexto)
  useEffect(() => {
    alTextoRef.current = alTexto
  })

  const soltar = useCallback((cancelar) => {
    const r = rec.current
    if (!r) return
    if (cancelar) {
      // Al cancelar ya no llegan más resultados ni eventos de este reconocedor.
      r.onresult = r.onerror = r.onend = null
      rec.current = null
      setEscuchando(false)
      r.abort()
    } else r.stop()
  }, [])

  const iniciar = useCallback(
    (base = '') => {
      if (!Reconocedor || rec.current) return
      setError(null)
      const r = new Reconocedor()
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
        alTextoRef.current?.(unir(base, `${finales} ${provisional}`), !provisional)
      }
      r.onerror = (e) => {
        if (e.error !== 'aborted') setError(ERRORES[e.error] ?? 'No se pudo usar el dictado por voz. Vuelve a intentarlo.')
      }
      r.onend = () => {
        rec.current = null
        setEscuchando(false)
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
    [idioma],
  )

  // Al salir de la pantalla se deja de escuchar.
  useEffect(() => () => soltar(true), [soltar])

  return {
    soportado: DICTADO_SOPORTADO,
    escuchando,
    error,
    iniciar,
    detener: useCallback(() => soltar(false), [soltar]),
    cancelar: useCallback(() => soltar(true), [soltar]),
    limpiarError: useCallback(() => setError(null), []),
  }
}
