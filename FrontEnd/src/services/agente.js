import { AGENTE, AGENTE_CALIFICAR, AGENTE_ESTADO } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Hay un agente por dispositivo: la pregunta va al del dispositivo elegido.
// `anterior`: la pregunta previa de la conversación, para seguimientos («¿y la gráfica?»).
export async function preguntar(pregunta, dispositivo, anterior = '', precarga = false) {
  if (USAR_MOCKS) return mock.preguntarAgente(anterior ? `${anterior} ${pregunta}` : pregunta, dispositivo)
  return pedir(AGENTE, { metodo: 'POST', cuerpo: { pregunta, dispositivo, anterior, precarga } })
}

// Reacción a una respuesta registrada en el servidor (la mejora de Nico AI se basa en ellas).
export async function calificar(registro, voto) {
  if (USAR_MOCKS) return { aprendida: false }
  return pedir(AGENTE_CALIFICAR, { metodo: 'POST', cuerpo: { registro, voto } })
}

// Agentes activos: su ESP32 puente está conectado.
export async function estado() {
  if (USAR_MOCKS) return { puente: false, activos: [] }
  return pedir(AGENTE_ESTADO)
}
