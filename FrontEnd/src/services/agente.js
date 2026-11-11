import { AGENTE } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Hay un agente por dispositivo: la pregunta va al del dispositivo elegido.
// `anterior`: la pregunta previa de la conversación, para seguimientos («¿y la gráfica?»).
export async function preguntar(pregunta, dispositivo, anterior = '') {
  if (USAR_MOCKS) return mock.preguntarAgente(anterior ? `${anterior} ${pregunta}` : pregunta, dispositivo)
  return pedir(AGENTE, { metodo: 'POST', cuerpo: { pregunta, dispositivo, anterior } })
}
