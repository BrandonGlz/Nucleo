import { ALERTA, ALERTA_ATENDER, ALERTA_DESCARTAR, ALERTAS, NOTIFICACIONES } from '../api'
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

// Atender o descartar (ADMIN y SUPER). accion: 'atender' | 'descartar'. La API exige
// `observaciones` (5–500 caracteres sin los espacios de los lados); si falta responde 400.
export async function resolver(num, accion, observaciones) {
  if (USAR_MOCKS) return mock.resolverAlerta(num, accion, observaciones)
  return pedir(accion === 'atender' ? ALERTA_ATENDER(num) : ALERTA_DESCARTAR(num), { metodo: 'POST', cuerpo: { observaciones } })
}
