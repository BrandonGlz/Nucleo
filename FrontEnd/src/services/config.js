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

// apiRequest con el token de la sesión y el cuerpo en JSON.
export function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const query = params
    ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString()
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
