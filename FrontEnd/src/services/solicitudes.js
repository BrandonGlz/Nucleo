import { AUTH_SOLICITAR_ACCESO, SOLICITUD_ACCESO, SOLICITUD_APROBAR, SOLICITUD_RECHAZAR } from '../api'
import { USAR_MOCKS, pedir } from './config'

// Organizaciones activas con sus áreas, para el formulario público.
export async function opciones() {
  if (USAR_MOCKS) return [{ num: 1, nombre: 'Grupo Altamira', areas: [{ num: 1, nombre: 'Laboratorio' }, { num: 2, nombre: 'Almacén' }] }]
  return pedir(AUTH_SOLICITAR_ACCESO)
}
export async function solicitar(datos) {
  if (USAR_MOCKS) return null
  return pedir(AUTH_SOLICITAR_ACCESO, { metodo: 'POST', cuerpo: datos })
}
export async function detalle(num) {
  return pedir(SOLICITUD_ACCESO(num))
}
export async function aprobar(num, datos) {
  return pedir(SOLICITUD_APROBAR(num), { metodo: 'POST', cuerpo: datos })
}
export async function rechazar(num) {
  return pedir(SOLICITUD_RECHAZAR(num), { metodo: 'POST', cuerpo: {} })
}
