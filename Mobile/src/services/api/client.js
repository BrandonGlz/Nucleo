const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()

export const API_BASE_URL = (
  configuredBaseUrl || 'http://localhost:8000/api/v1'
).replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const config = {
    ...options,
    headers: {
      Accept: 'application/json',
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
    throw new ApiError(
      `La API respondió con el estado ${response.status}.`,
      response.status,
    )
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
