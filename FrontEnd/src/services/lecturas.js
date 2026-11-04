import { LECTURAS, LECTURAS_SERIE } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function serie(dispositivo, variable, intervalo = 'hora') {
  if (USAR_MOCKS) return mock.serie({ dispositivo, variable })
  return pedir(LECTURAS_SERIE, { params: { dispositivo, variable, intervalo } })
}
export async function lista(params) {
  if (USAR_MOCKS) return mock.lecturas(params)
  return pedir(LECTURAS, { params })
}
