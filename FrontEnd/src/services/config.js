import { apiRequest } from './api/client'

// Con VITE_USE_MOCKS=true los servicios responden con services/mock y no llaman a la API.
export const USAR_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

const CLAVE_TOKEN = 'nucleo.token'
export const leerToken = () => {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}
export const guardarToken = (token) => {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token)
    else localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // Sin almacenamiento la sesión dura lo que dure la pestaña.
  }
}

// Las listas de la API van paginadas; la interfaz pide hasta 1000 registros por consulta y filtra
// en el navegador.
const POR_PAGINA = 1000

// apiRequest con el token de la sesión y el cuerpo en JSON.
export function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const todos = metodo === 'GET' ? { page_size: POR_PAGINA, ...params } : params
  const query = todos
    ? '?' + new URLSearchParams(Object.entries(todos).filter(([, v]) => v != null && v !== '')).toString()
    : ''
  const token = leerToken()
  return apiRequest(ruta + query, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
}
