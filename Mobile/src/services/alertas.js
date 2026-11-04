import { ALERTA, ALERTAS, NOTIFICACIONES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista(params) {
  if (USAR_MOCKS) return mock.alertas(params)
  return pedir(ALERTAS, { params })
}
export async function detalle(num) {
  if (USAR_MOCKS) return mock.alerta(num)
  return pedir(ALERTA(num))
}
export async function notificaciones() {
  if (USAR_MOCKS) return mock.notificaciones()
  return pedir(NOTIFICACIONES)
}
