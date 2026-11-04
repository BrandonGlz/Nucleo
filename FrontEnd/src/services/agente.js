import { ApiError } from './api/client'
import { USAR_MOCKS } from './config'
import * as mock from './mock/handlers'

// El contrato todavía no tiene una ruta para el agente: fuera de los mocks se muestra como no disponible.
export async function preguntar(pregunta) {
  if (USAR_MOCKS) return mock.preguntarAgente(pregunta)
  throw new ApiError('El agente todavía no está disponible en la API.', 503)
}
