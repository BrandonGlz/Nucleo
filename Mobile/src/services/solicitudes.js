import { AUTH_SOLICITAR_ACCESO } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

// Solicitud de acceso sin sesión, igual que la web (FrontEnd/src/services/solicitudes.js).
// Organizaciones activas con sus áreas, para el formulario: [{num, nombre, areas: [{num, nombre}]}].
export async function opciones() {
  if (USAR_MOCKS) return mock.opcionesSolicitud()
  return pedir(AUTH_SOLICITAR_ACCESO)
}
// POST {organizacion, area, nombre, primer_apellido, segundo_apellido?, correo, sitio} → 204.
// 400 con los errores por campo; 429 si se mandaron demasiadas desde la misma IP.
export async function solicitar(datos) {
  if (USAR_MOCKS) return mock.solicitarAcceso(datos)
  return pedir(AUTH_SOLICITAR_ACCESO, { metodo: 'POST', cuerpo: datos })
}
