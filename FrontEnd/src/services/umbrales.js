import { UMBRAL, UMBRALES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista(dispositivo) {
  if (USAR_MOCKS) return mock.umbrales({ dispositivo })
  return pedir(UMBRALES, { params: { dispositivo } })
}
export async function guardar(num, limites) {
  if (USAR_MOCKS) return mock.guardarUmbral(num, limites)
  return pedir(UMBRAL(num), { metodo: 'PATCH', cuerpo: limites })
}
