import { WS_PANEL } from '../api'
import { API_BASE_URL } from './api/client'
import { USAR_MOCKS, leerToken } from './config'

export const EVENTO = 'nucleo:evento'

// Canal en vivo de la API (/ws/panel/): alertas nuevas o resueltas y cambios de estado de los
// dispositivos, ya filtrados por el alcance del usuario. Cada evento se reenvía como
// `nucleo:evento` en window para que cualquier pantalla se actualice. Se reconecta solo.
export function escucharPanel() {
  if (USAR_MOCKS || typeof WebSocket === 'undefined') return () => {}
  const base = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/v\d+$/, '')
  let socket = null
  let espera = 1000
  let reintento = null
  let ping = null
  let cerrado = false

  const abrir = () => {
    const token = leerToken()
    if (!token || cerrado) return
    socket = new WebSocket(`${base}${WS_PANEL}?token=${encodeURIComponent(token)}`)
    socket.onopen = () => {
      espera = 1000
      ping = setInterval(() => socket.readyState === 1 && socket.send(JSON.stringify({ tipo: 'ping' })), 25000)
    }
    socket.onmessage = (e) => {
      try {
        const evento = JSON.parse(e.data)
        if (evento.tipo !== 'conectado' && evento.tipo !== 'pong') {
          window.dispatchEvent(new CustomEvent(EVENTO, { detail: evento }))
        }
      } catch {
        // Un mensaje que no es JSON se ignora.
      }
    }
    socket.onclose = () => {
      clearInterval(ping)
      if (cerrado) return
      reintento = setTimeout(abrir, espera)
      espera = Math.min(espera * 2, 30000)
    }
  }
  abrir()
  return () => {
    cerrado = true
    clearTimeout(reintento)
    clearInterval(ping)
    socket?.close()
  }
}
