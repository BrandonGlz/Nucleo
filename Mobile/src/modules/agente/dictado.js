import { useCallback, useEffect, useRef, useState } from 'react'
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition'

// Dictado por voz con el reconocedor del teléfono (expo-speech-recognition): transcribe en
// español de México y entrega el texto provisional mientras se habla. Al terminar de hablar (o al
// tocar otra vez el micrófono) deja de escuchar y entrega el texto completo para enviarlo solo.

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
// `alTerminar(texto)` se llama una vez cuando la persona termina de hablar, con el texto completo:
// el chat lo envía solo.
// `error` es { texto, ajustes } — `ajustes` indica que el permiso solo se da desde los ajustes.
export function useDictado({ alTexto, alTerminar, idioma = 'es-MX' }) {
  const [soportado] = useState(disponible)
  const [escuchando, setEscuchando] = useState(false)
  const [error, setError] = useState(null)
  const base = useRef('')
  const activo = useRef(false)
  // Lo dictado en esta escucha (con lo escrito antes); se vacía al entregarlo.
  const dicho = useRef('')
  const alTerminarRef = useRef(alTerminar)
  useEffect(() => {
    alTerminarRef.current = alTerminar
  })
  const entregar = () => {
    const t = dicho.current
    dicho.current = ''
    if (t.trim()) alTerminarRef.current?.(t)
  }

  useSpeechRecognitionEvent('result', (e) => {
    if (!activo.current) return
    const t = e.results?.[0]?.transcript ?? ''
    const completo = unir(base.current, t)
    if (t.trim()) dicho.current = completo
    alTexto(completo)
    // Resultado final: la persona terminó de hablar y el mensaje se envía solo.
    if (e.isFinal) entregar()
  })
  useSpeechRecognitionEvent('error', (e) => {
    if (!activo.current || e.error === 'aborted') return
    // Con error no se envía lo que alcanzó a dictarse: queda en el campo para revisarlo.
    dicho.current = ''
    setError({ texto: ERRORES[e.error] ?? 'No se pudo usar el dictado por voz. Vuelve a intentarlo.', ajustes: e.error === 'not-allowed' })
  })
  useSpeechRecognitionEvent('end', () => {
    const estaba = activo.current
    activo.current = false
    setEscuchando(false)
    // Terminó la escucha sin resultado final pero con texto dictado: también se envía.
    if (estaba) entregar()
    dicho.current = ''
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
        dicho.current = ''
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
    dicho.current = ''
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
