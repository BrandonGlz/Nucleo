const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

const baseConfigurada = (configuredBaseUrl || 'http://localhost:8000/api/v1').replace(/\/+$/, '')

// La consola de Nico AI (nicoai.<dominio>) es la misma web compilada con la API de <dominio>: ahí
// se usa la API de su propio host (Caddy la sirve igual), así el navegador no la bloquea por CORS.
function baseDelHost(base) {
  if (typeof window === 'undefined') return base
  const { hostname, origin, port } = window.location
  if (!hostname.startsWith('nicoai.')) return base
  try {
    const url = new URL(base)
    // Mismo dominio y puerto (producción): la API de su propio host. En desarrollo la API va
    // en otro puerto y se deja como está.
    const mismo = url.hostname === hostname.slice('nicoai.'.length) && url.port === port
    return mismo ? origin + url.pathname.replace(/\/+$/, '') : base
  } catch {
    return base
  }
}

export const API_BASE_URL = baseDelHost(baseConfigurada)

export const EVENTO_SEGUNDO_FACTOR = 'nucleo:segundo-factor-pendiente'
// La API respondió 401 con sesión: la cookie caducó o se cerró en otro lado (SesionContext).
export const EVENTO_SESION_CADUCADA = 'nucleo:sesion-caducada'

// Opciones comunes de toda petición a la API: la cookie HttpOnly de la sesión viaja también
// cuando la API está en otro origen (desarrollo), y X-Nucleo-Cliente es la protección CSRF que
// la API exige para escribir con la cookie.
export const OPCIONES_SESION = { credentials: 'include', headers: { 'X-Nucleo-Cliente': 'web' } }

export class ApiError extends Error {
  // `datos`: cuerpo JSON del error, si lo hay (p. ej. {detail, inactivo} de Nico AI).
  constructor(message, status, datos = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.datos = datos
  }
}

export async function apiRequest(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const config = {
    credentials: OPCIONES_SESION.credentials,
    ...options,
    headers: {
      Accept: 'application/json',
      ...OPCIONES_SESION.headers,
      ...(options.headers ?? {}),
    },
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, config)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error
    }
    throw new Error('No se pudo conectar con la API de Núcleo.')
  }

  if (!response.ok) {
    let datos = null
    try {
      datos = await response.json()
    } catch {
      // Sin cuerpo JSON.
    }
    if (response.status === 401 && !normalizedPath.startsWith('/auth/login') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_CADUCADA))
    }
    if (response.status === 403 && datos?.segundo_factor_pendiente && typeof window !== 'undefined') {
      // El rol exige la verificación en dos pasos: la sesión lleva a configurarla (SesionContext).
      window.dispatchEvent(new CustomEvent(EVENTO_SEGUNDO_FACTOR))
    }
    throw new ApiError(`La API respondió con el estado ${response.status}.`, response.status, datos)
  }

  if (response.status === 204) {
    return null
  }

  try {
    return await response.json()
  } catch {
    throw new ApiError('La API devolvió una respuesta no válida.', response.status)
  }
}
