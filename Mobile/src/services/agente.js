import { AGENTE, AGENTE_CALIFICAR, AGENTE_ESTADO, AGENTE_SUGERENCIAS } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Hay un agente por dispositivo: la pregunta va al del dispositivo elegido.
// `anterior`: la pregunta previa, para seguimientos como «¿y la gráfica?».
// `alcance`: DISPOSITIVO, AREA u ORGANIZACION; en AREA se manda el número del área.
export async function preguntar(pregunta, dispositivo, anterior = '', { alcance = 'DISPOSITIVO', area = null } = {}) {
  if (USAR_MOCKS) return mock.preguntarAgente(anterior ? `${anterior} ${pregunta}` : pregunta, dispositivo, { alcance, area })
  return pedir(AGENTE, { metodo: 'POST', cuerpo: { pregunta, dispositivo, anterior, alcance, area } })
}

// Reacción a una respuesta registrada en el servidor (la mejora de Nico AI se basa en ellas).
export async function calificar(registro, voto) {
  if (USAR_MOCKS) return { aprendida: false }
  return pedir(AGENTE_CALIFICAR, { metodo: 'POST', cuerpo: { registro, voto } })
}

// Agentes activos (su ESP32 puente está conectado) y los que este usuario puede usar ahora.
export async function estado({ alcance = 'DISPOSITIVO', area = null } = {}) {
  if (USAR_MOCKS) return mock.estadoAgente({ alcance, area })
  const params = alcance === 'AREA' ? { area } : alcance === 'ORGANIZACION' ? { organizacion: 1 } : undefined
  return pedir(AGENTE_ESTADO, { params })
}

// Sugerencias del inicio de Nico (las mismas que usa la web).
export async function sugerencias(dispositivo) {
  if (USAR_MOCKS) return mock.sugerenciasAgente(dispositivo)
  return pedir(AGENTE_SUGERENCIAS, { params: { dispositivo } })
}
