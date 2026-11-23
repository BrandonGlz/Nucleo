import { ApiError, apiRequest } from './api/client'

// Con EXPO_PUBLIC_USE_MOCKS=true los servicios responden con services/mock y no llaman a la API.
export const USAR_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === 'true'

// Token de la sesión en memoria; SesionContext lo fija al entrar, al restaurar la sesión guardada
// y al salir.
let token = null
export const guardarToken = (t) => {
  token = t || null
}
export const leerToken = () => token

// Si la API rechaza el token (401: sesión caducada por inactividad o cerrada desde otro equipo),
// SesionContext borra la sesión guardada y vuelve al acceso. El login no manda token, así que una
// contraseña incorrecta no llega aquí.
let alSinSesion = null
export const alCaducarSesion = (fn) => {
  alSinSesion = fn
}

// Las listas de la API van paginadas; la app pide hasta 1000 registros por consulta.
const POR_PAGINA = 1000

// apiRequest con el token de la sesión y el cuerpo en JSON.
export function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const todos = metodo === 'GET' ? { page_size: POR_PAGINA, ...params } : params
  const query = todos
    ? '?' + Object.entries(todos)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : ''
  const enviado = token
  return apiRequest(ruta + query, {
    method: metodo,
    headers: {
      ...(enviado ? { Authorization: `Token ${enviado}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch((error) => {
    if (error instanceof ApiError && enviado && enviado === token) {
      if (error.status === 401) alSinSesion?.('caducada')
      // Sesión restaurada de una cuenta cuyo rol ahora exige la verificación en dos pasos: fuera
      // de /auth/ todo responde 403 {segundo_factor_pendiente}.
      else if (error.status === 403 && error.datos?.segundo_factor_pendiente) alSinSesion?.('segundo_factor')
    }
    throw error
  })
}
