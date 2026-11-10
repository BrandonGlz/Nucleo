import { LECTURAS, LECTURAS_SERIE } from '../api'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Rango de cada periodo de las gráficas: «hoy» son las últimas 24 horas.
const PERIODOS = { hoy: [1, 'hora'], 7: [7, 'hora'], 30: [30, 'dia'] }
export function rangoPeriodo(periodo = 'hoy') {
  const [dias, intervalo] = PERIODOS[periodo] ?? PERIODOS.hoy
  return { intervalo, desde: new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString() }
}

// Rango del periodo que siempre cae donde hay datos: si el dispositivo dejó de enviar lecturas antes del
// inicio del periodo, el mismo lapso se recorre hasta su última lectura guardada (ultima la indica).
export async function rangoConDatos(dispositivo, variable, periodo = 'hoy') {
  const rango = rangoPeriodo(periodo)
  if (USAR_MOCKS) return rango
  const [ultima] = pagina(await pedir(LECTURAS, { params: { dispositivo, variable, page_size: 1 } }))
  if (!ultima || new Date(ultima.fecha_hora) >= new Date(rango.desde)) return rango
  const fin = new Date(ultima.fecha_hora).getTime()
  const lapso = Date.now() - new Date(rango.desde).getTime()
  return {
    intervalo: rango.intervalo,
    desde: new Date(fin - lapso).toISOString(),
    hasta: new Date(fin + 1000).toISOString(),
    ultima: ultima.fecha_hora,
  }
}

// Serie de un periodo; con un rango ya calculado (rangoConDatos) se usa tal cual.
export async function serie(dispositivo, variable, periodo = 'hoy') {
  if (USAR_MOCKS) return mock.serie({ dispositivo, variable })
  const rango = typeof periodo === 'object' ? periodo : rangoPeriodo(periodo)
  const { intervalo, desde, hasta } = rango
  return pedir(LECTURAS_SERIE, { params: { dispositivo, variable, intervalo, desde, hasta } })
}

// Serie con sus datos más recientes: { puntos, ultima } (ultima solo si se recorrió el rango).
export async function serieConDatos(dispositivo, variable, periodo = 'hoy') {
  const rango = await rangoConDatos(dispositivo, variable, periodo)
  return { puntos: await serie(dispositivo, variable, rango), ultima: rango.ultima }
}
export async function lista(params) {
  if (USAR_MOCKS) return mock.lecturas(params)
  return pedir(LECTURAS, { params })
}
