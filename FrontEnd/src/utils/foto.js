import { API_BASE_URL } from '../services/api/client'

// La API da `foto_url` relativa a su dominio (/api/v1/fotos/…); la web puede estar en otro
// origen (desarrollo), así que se resuelve contra la URL de la API. Sin foto: undefined.
export function fotoDe(usuario) {
  const ruta = usuario?.foto_url
  if (!ruta) return undefined
  try {
    return new URL(ruta, API_BASE_URL).href
  } catch {
    return ruta
  }
}

// Logo de la organización: misma resolución contra el dominio de la API que la foto.
export function logoDe(organizacion) {
  return fotoDe({ foto_url: organizacion?.logo_url })
}
