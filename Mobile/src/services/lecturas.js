import { LECTURAS_SERIE } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Serie agregada de una variable. intervalo: 'hora' (últimas 24 h) o 'minuto' (alrededor de una alerta).
export async function serie(dispositivo, variable, { intervalo = 'hora', desde, hasta } = {}) {
  const params = { dispositivo, variable, intervalo, desde, hasta }
  if (USAR_MOCKS) return mock.serie(params)
  return pedir(LECTURAS_SERIE, { params })
}
