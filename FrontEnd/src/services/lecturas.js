import { LECTURAS, LECTURAS_SERIE } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Rango de cada periodo de las gráficas: «hoy» son las últimas 24 horas.
const PERIODOS = { hoy: [1, 'hora'], 7: [7, 'hora'], 30: [30, 'dia'] }
export function rangoPeriodo(periodo = 'hoy') {
  const [dias, intervalo] = PERIODOS[periodo] ?? PERIODOS.hoy
  return { intervalo, desde: new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString() }
}

export async function serie(dispositivo, variable, periodo = 'hoy') {
  if (USAR_MOCKS) return mock.serie({ dispositivo, variable })
  return pedir(LECTURAS_SERIE, { params: { dispositivo, variable, ...rangoPeriodo(periodo) } })
}
export async function lista(params) {
  if (USAR_MOCKS) return mock.lecturas(params)
  return pedir(LECTURAS, { params })
}
