import { USUARIO, USUARIOS } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function lista() {
  if (USAR_MOCKS) return mock.usuarios()
  return pedir(USUARIOS)
}
export async function crear(datos) {
  if (USAR_MOCKS) return mock.crearUsuario(datos)
  return pedir(USUARIOS, { metodo: 'POST', cuerpo: datos })
}
export async function actualizar(num, cambios) {
  if (USAR_MOCKS) return mock.actualizarUsuario(num, cambios)
  return pedir(USUARIO(num), { metodo: 'PATCH', cuerpo: cambios })
}
