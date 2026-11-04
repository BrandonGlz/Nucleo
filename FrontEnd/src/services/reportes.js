import { PROGRAMACIONES_REPORTE, REPORTES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista() {
  if (USAR_MOCKS) return mock.reportes()
  return pedir(REPORTES)
}
export async function programaciones() {
  if (USAR_MOCKS) return mock.programaciones()
  return pedir(PROGRAMACIONES_REPORTE)
}
export async function crear(datos) {
  if (USAR_MOCKS) return mock.crearReporte(datos)
  return pedir(REPORTES, { metodo: 'POST', cuerpo: datos })
}
