import { AVISOS, AVISOS_CONTEO, AVISOS_MARCAR_LEIDOS } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Avisos de la campana que no son alertas de medición (dispositivos, usuarios, reportes, Nico AI),
// como en la web. La campana pide los 50 más recientes.
export async function lista(params) {
  if (USAR_MOCKS) return mock.avisos(params)
  return pedir(AVISOS, { params: { page_size: 50, ...params } })
}
export async function conteo() {
  if (USAR_MOCKS) return mock.conteoAvisos()
  return pedir(AVISOS_CONTEO)
}
// Sin `nums` (o vacío) marca todos los del usuario.
export async function marcarLeidos(nums) {
  if (USAR_MOCKS) return mock.marcarAvisosLeidos({ nums })
  return pedir(AVISOS_MARCAR_LEIDOS, { metodo: 'POST', cuerpo: nums?.length ? { nums } : {} })
}
