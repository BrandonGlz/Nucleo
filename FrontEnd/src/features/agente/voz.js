import { useCallback, useEffect, useRef, useState } from 'react'

// Nico lee su respuesta en voz alta (solo cuando la pregunta se dictó por voz), con la síntesis
// de voz del navegador. Se elige una voz en español, de preferencia de México o de EE. UU.
const sintesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined
export const VOZ_SOPORTADA = Boolean(sintesis && typeof window.SpeechSynthesisUtterance === 'function')

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

const PREFERIDAS = ['es-MX', 'es-US', 'es-419']
// Voces conocidas por sonar más naturales y amables.
const NOMBRES = /natural|neural|google|paulina|sabina|dalia|monica|paloma|marisol|helena|online/i

function elegirVoz() {
  const voces = sintesis?.getVoices() ?? []
  const espanol = voces.filter((v) => v.lang?.toLowerCase().startsWith('es'))
  const puntos = (v) => {
    const lang = v.lang.replace('_', '-')
    const i = PREFERIDAS.findIndex((p) => p.toLowerCase() === lang.toLowerCase())
    return (i >= 0 ? 30 - i * 5 : 0) + (NOMBRES.test(v.name) ? 6 : 0) + (v.localService ? 0 : 1)
  }
  return espanol.sort((a, b) => puntos(b) - puntos(a))[0] ?? null
}

// Divide en frases cortas: Chrome corta las lecturas largas si van en una sola.
const frases = (texto) => texto.split(/(?<=[.!?;])\s+/).map((f) => f.trim()).filter(Boolean)

export function useVozNico() {
  const [hablando, setHablando] = useState(false)
  // Cada lectura tiene su turno: los avisos de una lectura cancelada no tocan a la nueva.
  const turno = useRef(0)
  useEffect(() => {
    if (!VOZ_SOPORTADA) return undefined
    // Las voces cargan después de abrir la página.
    const cargar = () => sintesis.getVoices()
    cargar()
    sintesis.addEventListener?.('voiceschanged', cargar)
    return () => {
      sintesis.removeEventListener?.('voiceschanged', cargar)
      sintesis.cancel()
    }
  }, [])

  const callar = useCallback(() => {
    if (!VOZ_SOPORTADA) return
    turno.current += 1
    sintesis.cancel()
    setHablando(false)
  }, [])

  const hablar = useCallback((texto) => {
    if (!VOZ_SOPORTADA) return
    const limpio = limpiarParaVoz(texto)
    const mio = ++turno.current
    sintesis.cancel()
    if (!limpio) return setHablando(false)
    const voz = elegirVoz()
    const partes = frases(limpio)
    partes.forEach((f, i) => {
      const u = new window.SpeechSynthesisUtterance(f)
      u.lang = voz?.lang ?? 'es-MX'
      try {
        if (voz) u.voice = voz
      } catch {
        // Si la voz no se puede asignar, se usa la del idioma.
      }
      u.rate = 1
      u.pitch = 1.08
      if (i === partes.length - 1) u.onend = u.onerror = () => turno.current === mio && setHablando(false)
      sintesis.speak(u)
    })
    setHablando(true)
  }, [])

  return { soportada: VOZ_SOPORTADA, hablando, hablar, callar }
}
