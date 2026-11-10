import { AREA, AREAS, ORGANIZACION, ORGANIZACION_PRIMER_ADMINISTRADOR, ORGANIZACIONES } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function propia() {
  if (USAR_MOCKS) return mock.organizaciones()
  return pedir(ORGANIZACIONES)
}
// Administrador de plataforma: alta de organizaciones y de su primer administrador.
export async function lista() {
  if (USAR_MOCKS) return mock.organizaciones()
  return pedir(ORGANIZACIONES)
}
export async function crear(datos) {
  if (USAR_MOCKS) return mock.crearOrganizacion(datos)
  return pedir(ORGANIZACIONES, { metodo: 'POST', cuerpo: datos })
}
export async function primerAdministrador(num, datos) {
  if (USAR_MOCKS) return mock.primerAdministrador(num, datos)
  return pedir(ORGANIZACION_PRIMER_ADMINISTRADOR(num), { metodo: 'POST', cuerpo: datos })
}
export async function actualizar(num, cambios) {
  if (USAR_MOCKS) return mock.actualizarOrganizacion(num, cambios)
  return pedir(ORGANIZACION(num), { metodo: 'PATCH', cuerpo: cambios })
}
export async function areas() {
  if (USAR_MOCKS) return mock.areas()
  return pedir(AREAS)
}
export async function crearArea(datos) {
  if (USAR_MOCKS) return mock.crearArea(datos)
  return pedir(AREAS, { metodo: 'POST', cuerpo: datos })
}
export async function actualizarArea(num, cambios) {
  if (USAR_MOCKS) return mock.actualizarArea(num, cambios)
  return pedir(AREA(num), { metodo: 'PATCH', cuerpo: cambios })
}
export async function eliminarArea(num) {
  if (USAR_MOCKS) return mock.eliminarArea(num)
  return pedir(AREA(num), { metodo: 'DELETE' })
}
