import { AREAS, ORGANIZACIONES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function propia() {
  if (USAR_MOCKS) return mock.organizaciones()
  return pedir(ORGANIZACIONES)
}
export async function areas() {
  if (USAR_MOCKS) return mock.areas()
  return pedir(AREAS)
}
