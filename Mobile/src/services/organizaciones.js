import { AREA, AREAS, ORGANIZACION } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function propia(num) {
  if (USAR_MOCKS) return mock.organizacion(num)
  return pedir(ORGANIZACION(num))
}
export async function areas() {
  if (USAR_MOCKS) return mock.areas()
  return pedir(AREAS)
}
export async function area(num) {
  if (USAR_MOCKS) return mock.area(num)
  return pedir(AREA(num))
}
