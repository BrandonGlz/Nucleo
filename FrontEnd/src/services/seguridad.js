import { AUDITORIA, TOKEN_API, TOKENS_API, WEBHOOK, WEBHOOK_PROBAR, WEBHOOKS } from '../api'
import { API_BASE_URL, ApiError, OPCIONES_SESION } from './api/client'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/consola'

// La bitácora y las integraciones viven en la consola de administración (admin.<dominio>): el
// superusuario las ve de todas las organizaciones y elige una con ?organizacion=.
const deOrg = (organizacion) => ({ organizacion })

// Bitácora de auditoría (params: accion, desde, organizacion…)
export async function auditoria(params) {
  if (USAR_MOCKS) return mock.auditoria(params)
  return pedir(AUDITORIA, { params: { page_size: 200, ...params } })
}

// Tokens de API de solo lectura (de la organización elegida)
export async function tokens(organizacion) {
  if (USAR_MOCKS) return mock.listaTokens(organizacion)
  return pedir(TOKENS_API, { params: deOrg(organizacion) })
}
export async function crearToken(datos, organizacion) {
  if (USAR_MOCKS) return mock.crearToken(datos, organizacion)
  return pedir(TOKENS_API, { metodo: 'POST', cuerpo: datos, params: deOrg(organizacion) })
}
export async function revocarToken(num, organizacion) {
  if (USAR_MOCKS) return mock.revocarToken(num)
  return pedir(TOKEN_API(num), { metodo: 'DELETE', params: deOrg(organizacion) })
}

// Webhooks de alertas (de la organización elegida)
export async function webhooks(organizacion) {
  if (USAR_MOCKS) return mock.listaWebhooks(organizacion)
  return pedir(WEBHOOKS, { params: deOrg(organizacion) })
}
export async function crearWebhook(datos, organizacion) {
  if (USAR_MOCKS) return mock.crearWebhook(datos, organizacion)
  return pedir(WEBHOOKS, { metodo: 'POST', cuerpo: datos, params: deOrg(organizacion) })
}
export async function actualizarWebhook(num, cambios, organizacion) {
  if (USAR_MOCKS) return mock.editarWebhook(num, cambios)
  return pedir(WEBHOOK(num), { metodo: 'PATCH', cuerpo: cambios, params: deOrg(organizacion) })
}
export async function borrarWebhook(num, organizacion) {
  if (USAR_MOCKS) return mock.borrarWebhook(num)
  return pedir(WEBHOOK(num), { metodo: 'DELETE', params: deOrg(organizacion) })
}
export async function probarWebhook(num, organizacion) {
  if (USAR_MOCKS) return mock.probarWebhook(num)
  return pedir(WEBHOOK_PROBAR(num), { metodo: 'POST', cuerpo: {}, params: deOrg(organizacion) })
}

// Descarga un CSV de la API (lecturas o alertas) con la cookie de la sesión.
export async function descargarCsv(ruta, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
  const respuesta = await fetch(`${API_BASE_URL}${ruta}${query ? `?${query}` : ''}`, OPCIONES_SESION)
  if (!respuesta.ok) throw new ApiError(`La API respondió con el estado ${respuesta.status}.`, respuesta.status)
  const nombre =
    /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') || '')?.[1] || 'nucleo.csv'
  guardarArchivo(await respuesta.blob(), nombre)
}

// Hace que el navegador guarde un archivo ya en memoria (también lo usan los mocks).
export function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
