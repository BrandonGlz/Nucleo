import { apiRequest } from './api/client'

// Con VITE_USE_MOCKS=true los servicios responden con services/mock y no llaman a la API.
export const USAR_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

// La sesión vive en una cookie HttpOnly que pone la API al iniciar sesión: el navegador la manda
// sola y JavaScript no puede leerla. La web ya no guarda el token; se borra el de versiones
// anteriores.
try {
  localStorage.removeItem('nucleo.token')
} catch {
  // Sin almacenamiento no hay nada que borrar.
}

// Las listas de la API van paginadas; la interfaz pide hasta 1000 registros por consulta y filtra
// en el navegador.
const POR_PAGINA = 1000

// apiRequest con la cookie de la sesión y el cuerpo en JSON.
export function pedir(ruta, { metodo = 'GET', cuerpo, params } = {}) {
  const todos = metodo === 'GET' ? { page_size: POR_PAGINA, ...params } : params
  const query = todos
    ? '?' + new URLSearchParams(Object.entries(todos).filter(([, v]) => v != null && v !== '')).toString()
    : ''
  return apiRequest(ruta + query, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  })
}
