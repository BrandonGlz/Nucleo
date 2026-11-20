import { AGENTE, AGENTE_CALIFICAR, AGENTE_ESTADO, AGENTE_SUGERENCIAS, NICO_CALIFICAR, NICO_CHAT, NICO_CHAT_SUGERENCIAS, NICO_ESTADO, NICO_TRANSCRIBIR, NICO_TRANSCRIBIR_PRECALENTAR } from '../api'
import { USAR_MOCKS, pedir } from './config'
import { apiRequest } from './api/client'
import * as mock from './mock/handlers'

// La web usa el agente de su organización; la consola de Nico AI (nicoai.bynucleo.com) el de
// cualquier dispositivo. `usarConsola()` cambia las rutas para toda la página.
let rutas = { preguntar: AGENTE, calificar: AGENTE_CALIFICAR, estado: AGENTE_ESTADO, sugerencias: AGENTE_SUGERENCIAS }
export function usarConsola() {
  rutas = { preguntar: NICO_CHAT, calificar: NICO_CALIFICAR, estado: NICO_ESTADO, sugerencias: NICO_CHAT_SUGERENCIAS }
}

// Hay un agente por dispositivo: la pregunta va al del dispositivo elegido.
// `anterior`: la pregunta previa de la conversación, para seguimientos («¿y la gráfica?»).
export async function preguntar(pregunta, dispositivo, anterior = '', precarga = false) {
  if (USAR_MOCKS) return mock.preguntarAgente(anterior ? `${anterior} ${pregunta}` : pregunta, dispositivo)
  return pedir(rutas.preguntar, { metodo: 'POST', cuerpo: { pregunta, dispositivo, anterior, precarga } })
}

// Reacción a una respuesta registrada en el servidor (la mejora de Nico AI se basa en ellas).
export async function calificar(registro, voto) {
  if (USAR_MOCKS) return { aprendida: false }
  return pedir(rutas.calificar, { metodo: 'POST', cuerpo: { registro, voto } })
}

// Agentes activos: su ESP32 puente está conectado.
export async function estado() {
  if (USAR_MOCKS) return { puente: false, activos: [] }
  return pedir(rutas.estado)
}

// Sugerencias para filtrar mientras se escribe (se piden una vez por dispositivo).
export async function sugerenciasEscritura(dispositivo) {
  if (USAR_MOCKS) return { activas: false, maximo: 6, sugerencias: [] }
  return pedir(rutas.sugerencias, { params: { dispositivo } })
}

// Convierte a texto el audio del dictado de respaldo (Whisper en el servidor).
export async function transcribir(audio) {
  if (USAR_MOCKS) return { texto: '¿Cómo estuvo la temperatura hoy?' }
  const datos = new FormData()
  datos.append('audio', audio, audio.type.includes('ogg') ? 'dictado.ogg' : audio.type.includes('mp4') ? 'dictado.mp4' : 'dictado.webm')
  return apiRequest(NICO_TRANSCRIBIR, { method: 'POST', body: datos })
}

// Pide al servidor que cargue Whisper en cuanto empieza el dictado (sin esperar respuesta útil).
export async function precalentarDictado() {
  if (USAR_MOCKS) return { listo: true }
  return pedir(NICO_TRANSCRIBIR_PRECALENTAR, { metodo: 'POST' })
}
