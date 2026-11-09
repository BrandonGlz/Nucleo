import { AGENTE } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Hay un agente por dispositivo: la pregunta va al del dispositivo elegido.
export async function preguntar(pregunta, dispositivo) {
  if (USAR_MOCKS) return mock.preguntarAgente(pregunta, dispositivo)
  return pedir(AGENTE, { metodo: 'POST', cuerpo: { pregunta, dispositivo } })
}
