import { apiRequest } from './api/client'

// Con EXPO_PUBLIC_USE_MOCKS=true los servicios responden con services/mock y no llaman a la API.
export const USAR_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === 'true'

// El token vive mientras la app está abierta; SesionContext lo fija al entrar y al salir.
let token = null
export const guardarToken = (t) => {
  token = t || null
}
export const leerToken = () => token

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
  return apiRequest(ruta + query, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
}
