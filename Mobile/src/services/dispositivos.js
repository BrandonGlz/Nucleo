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
export async function ultimasLecturas(num) {
  if (USAR_MOCKS) return mock.ultimasLecturas(num)
  return pedir(DISPOSITIVO_ULTIMAS_LECTURAS(num))
}
