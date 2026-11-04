import { USUARIOS } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista(params) {
  if (USAR_MOCKS) return mock.usuarios(params)
  return pedir(USUARIOS, { params })
}
