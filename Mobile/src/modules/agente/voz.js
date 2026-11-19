import { useCallback, useEffect, useRef, useState } from 'react'
import * as Speech from 'expo-speech'

// Nico lee su respuesta en voz alta (solo cuando la pregunta se dictó por voz) con la voz del
// teléfono (expo-speech). Se elige una voz en español, de preferencia de México o de EE. UU.

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

const PREFERIDAS = ['es-mx', 'es-us', 'es-419']

// La mejor voz en español instalada en el teléfono (o null para usar la del idioma).
async function elegirVoz() {
  try {
    const voces = await Speech.getAvailableVoicesAsync()
    const puntos = (v) => {
      const lang = v.language.replace('_', '-').toLowerCase()
      const i = PREFERIDAS.indexOf(lang)
      return (i >= 0 ? 30 - i * 5 : 0) + (v.quality === 'Enhanced' ? 6 : 0) + (/network|red/i.test(v.identifier) ? 0 : 1)
    }
    return voces.filter((v) => v.language?.toLowerCase().startsWith('es')).sort((a, b) => puntos(b) - puntos(a))[0] ?? null
  } catch {
    return null
  }
}

export function useVozNico() {
  const [hablando, setHablando] = useState(false)
  const voz = useRef(undefined)
  // Cada lectura tiene su turno: los avisos de una lectura cancelada no tocan a la nueva.
  const turno = useRef(0)

  useEffect(() => {
    elegirVoz().then((v) => (voz.current = v))
    return () => {
      Speech.stop().catch(() => {})
    }
  }, [])

  const callar = useCallback(() => {
    turno.current += 1
    setHablando(false)
    Speech.stop().catch(() => {})
  }, [])

  const hablar = useCallback(async (texto) => {
    const limpio = limpiarParaVoz(texto).slice(0, Speech.maxSpeechInputLength ?? 4000)
    const mio = ++turno.current
    await Speech.stop().catch(() => {})
    if (!limpio || mio !== turno.current) return
    if (voz.current === undefined) voz.current = await elegirVoz()
    if (mio !== turno.current) return
    const fin = () => mio === turno.current && setHablando(false)
    setHablando(true)
    Speech.speak(limpio, {
      language: voz.current?.language ?? 'es-MX',
      voice: voz.current?.identifier,
      pitch: 1.05,
      rate: 1,
      onDone: fin,
      onStopped: fin,
      onError: fin,
    })
  }, [])

  return { hablando, hablar, callar }
}
