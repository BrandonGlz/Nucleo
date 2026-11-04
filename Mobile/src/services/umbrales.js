import { UMBRALES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista(dispositivo) {
  if (USAR_MOCKS) return mock.umbrales({ dispositivo })
  return pedir(UMBRALES, { params: { dispositivo } })
}
