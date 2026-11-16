import { AUDITORIA, TOKEN_API, TOKENS_API, WEBHOOK, WEBHOOK_PROBAR, WEBHOOKS } from '../api'
import { API_BASE_URL, ApiError } from './api/client'
import { USAR_MOCKS, leerToken, pedir } from './config'

const vacia = { count: 0, results: [] }

// Bitácora de auditoría (ADMIN de su organización; ADMINPLAT, toda)
export async function auditoria(params) {
  if (USAR_MOCKS) return vacia
  return pedir(AUDITORIA, { params: { page_size: 200, ...params } })
}

// Tokens de API de solo lectura
export async function tokens() {
  if (USAR_MOCKS) return vacia
  return pedir(TOKENS_API)
}
export async function crearToken(datos) {
  return pedir(TOKENS_API, { metodo: 'POST', cuerpo: datos })
}
export async function revocarToken(num) {
  return pedir(TOKEN_API(num), { metodo: 'DELETE' })
}

// Webhooks de alertas
export async function webhooks() {
  if (USAR_MOCKS) return vacia
  return pedir(WEBHOOKS)
}
export async function crearWebhook(datos) {
  return pedir(WEBHOOKS, { metodo: 'POST', cuerpo: datos })
}
export async function actualizarWebhook(num, cambios) {
  return pedir(WEBHOOK(num), { metodo: 'PATCH', cuerpo: cambios })
}
export async function borrarWebhook(num) {
  return pedir(WEBHOOK(num), { metodo: 'DELETE' })
}
export async function probarWebhook(num) {
  return pedir(WEBHOOK_PROBAR(num), { metodo: 'POST', cuerpo: {} })
}

// Descarga un CSV de la API (lecturas o alertas) con el token de la sesión.
export async function descargarCsv(ruta, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
  const token = leerToken()
  const respuesta = await fetch(`${API_BASE_URL}${ruta}${query ? `?${query}` : ''}`, {
    headers: token ? { Authorization: `Token ${token}` } : {},
  })
  if (!respuesta.ok) throw new ApiError(`La API respondió con el estado ${respuesta.status}.`, respuesta.status)
  const nombre =
    /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') || '')?.[1] || 'nucleo.csv'
  const url = URL.createObjectURL(await respuesta.blob())
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
