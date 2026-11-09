import { DISPOSITIVO, DISPOSITIVO_ULTIMAS_LECTURAS, DISPOSITIVOS } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista() {
  if (USAR_MOCKS) return mock.dispositivos()
  return pedir(DISPOSITIVOS)
}
export async function detalle(num) {
  if (USAR_MOCKS) return mock.dispositivo(num)
  return pedir(DISPOSITIVO(num))
}
export async function cambiarIntervalo(num, intervalo_muestreo_seg) {
  if (USAR_MOCKS) return mock.actualizarDispositivo(num, { intervalo_muestreo_seg })
  return pedir(DISPOSITIVO(num), { metodo: 'PATCH', cuerpo: { intervalo_muestreo_seg } })
}
export async function ultimasLecturas(num) {
  if (USAR_MOCKS) return mock.ultimasLecturas(num)
  return pedir(DISPOSITIVO_ULTIMAS_LECTURAS(num))
}
export async function cambiarArea(num, area) {
  if (USAR_MOCKS) return mock.actualizarDispositivo(num, { area })
  return pedir(DISPOSITIVO(num), { metodo: 'PATCH', cuerpo: { area } })
}
