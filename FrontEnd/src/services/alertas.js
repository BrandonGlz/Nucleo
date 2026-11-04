import { ALERTAS, ALERTA_ATENDER, ALERTA_DESCARTAR, NOTIFICACIONES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista(params) {
  if (USAR_MOCKS) return mock.alertas(params)
  return pedir(ALERTAS, { params })
}
export async function atender(num, observaciones) {
  if (USAR_MOCKS) return mock.atenderAlerta(num, { observaciones })
  return pedir(ALERTA_ATENDER(num), { metodo: 'POST', cuerpo: { observaciones } })
}
export async function descartar(num, observaciones) {
  if (USAR_MOCKS) return mock.descartarAlerta(num, { observaciones })
  return pedir(ALERTA_DESCARTAR(num), { metodo: 'POST', cuerpo: { observaciones } })
}
export async function notificaciones() {
  if (USAR_MOCKS) return mock.notificaciones()
  return pedir(NOTIFICACIONES)
}
