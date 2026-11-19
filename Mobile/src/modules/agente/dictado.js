import { useCallback, useEffect, useRef, useState } from 'react'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'

// Dictado por voz con el reconocedor del teléfono (expo-speech-recognition): transcribe en
// español de México y entrega el texto provisional mientras se habla. Al terminar de hablar (o al
// tocar otra vez el micrófono) deja de escuchar.

// Mensajes entendibles para cada error del reconocedor.
const ERRORES = {
  'not-allowed': 'No hay permiso para usar el micrófono.',
  'service-not-allowed': 'El teléfono no tiene un servicio de dictado disponible. Instala o activa la app de Google.',
  'audio-capture': 'No se pudo usar el micrófono. Revisa que no lo esté usando otra app.',
  'no-speech': 'No se escuchó nada. Toca el micrófono y vuelve a intentarlo.',
  'speech-timeout': 'No se escuchó nada. Toca el micrófono y vuelve a intentarlo.',
  network: 'El dictado necesita conexión a internet.',
  'language-not-supported': 'El dictado en español no está disponible en este teléfono.',
  busy: 'El micrófono está ocupado. Espera un momento y vuelve a intentarlo.',
}

// true si el teléfono tiene un servicio de reconocimiento de voz.
function disponible() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable()
  } catch {
    return false
  }
}

// Une el texto que ya estaba escrito con lo dictado (con un espacio entre ambos).
const unir = (base, dictado) => {
  const d = dictado.trim()
  if (!d) return base
  if (!base.trim()) return d.replace(/^([¿¡"'(]*)(\p{L})/u, (_, signo, letra) => signo + letra.toUpperCase())
  return `${base}${/\s$/.test(base) ? '' : ' '}${d}`
}

// `alTexto(texto)` recibe el contenido completo del campo (lo escrito antes + lo dictado).
// `error` es { texto, ajustes } — `ajustes` indica que el permiso solo se da desde los ajustes.
export function useDictado({ alTexto, idioma = 'es-MX' }) {
  const [soportado] = useState(disponible)
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState(null)
  const base = useRef('')
  const activo = useRef(false)

  useSpeechRecognitionEvent('result', (e) => {
    if (!activo.current) return
    const t = e.results?.[0]?.transcript ?? ''
    alTexto(unir(base.current, t))
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!activo.current || e.error === 'aborted') return
    setError({ texto: ERRORES[e.error] ?? 'No se pudo usar el dictado por voz. Vuelve a intentarlo.', ajustes: e.error === 'not-allowed' })
  })
  useSpeechRecognitionEvent('end', () => {
    activo.current = false
    setEscuchando(false)
  })

  const iniciar = useCallback(
    async (texto = '') => {
      if (!soportado || activo.current) return
      setError(null)
      try {
        const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
        if (!permiso.granted) {
          setError({
            texto: permiso.canAskAgain
              ? 'Para dictar, permite que Núcleo use el micrófono.'
              : 'El permiso del micrófono está desactivado. Actívalo en los ajustes del teléfono.',
            ajustes: !permiso.canAskAgain,
          })
          return
        }
        base.current = texto
        activo.current = true
        setEscuchando(true)
        ExpoSpeechRecognitionModule.start({ lang: idioma, interimResults: true, continuous: false, maxAlternatives: 1 })
      } catch {
        activo.current = false
        setEscuchando(false)
        setError({ texto: 'No se pudo iniciar el dictado por voz. Vuelve a intentarlo.' })
      }
    },
    [soportado, idioma],
  )

  const detener = useCallback(() => {
    if (activo.current) ExpoSpeechRecognitionModule.stop()
  }, [])
  // Cancela sin escribir nada más (al enviar o salir de la pantalla).
  const cancelar = useCallback(() => {
    if (!activo.current) return
    activo.current = false
    setEscuchando(false)
    try {
      ExpoSpeechRecognitionModule.abort()
    } catch {
      // Ya se había detenido.
    }
  }, [])
  useEffect(() => cancelar, [cancelar])

  return { soportado, escuchando, error, iniciar, detener, cancelar, limpiarError: useCallback(() => setError(null), []) }
}
