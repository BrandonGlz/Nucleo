import { AGENTE, AGENTE_CALIFICAR, AGENTE_ESTADO, NICO_CALIFICAR, NICO_CHAT, NICO_ESTADO } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// La web usa el agente de su organización; la consola de Nico AI (nicoai.bynucleo.com) el de
// cualquier dispositivo. `usarConsola()` cambia las rutas para toda la página.
let rutas = { preguntar: AGENTE, calificar: AGENTE_CALIFICAR, estado: AGENTE_ESTADO }
export function usarConsola() {
  rutas = { preguntar: NICO_CHAT, calificar: NICO_CALIFICAR, estado: NICO_ESTADO }
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
