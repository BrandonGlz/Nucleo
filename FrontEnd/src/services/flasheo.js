import {
  CONSOLA_FLASHEO,
  CONSOLA_FLASHEO_ARCHIVOS,
  CONSOLA_FLASHEO_CONFIGURACION,
  CONSOLA_FLASHEO_MICROPYTHON,
} from '../api'
import { API_BASE_URL, OPCIONES_SESION } from './api/client'
import { USAR_MOCKS, pedir } from './config'

// Carga de firmware por USB desde la consola de administración. Con VITE_USE_MOCKS=true solo
// responde el inventario (sin backend no hay imágenes que grabar).
const MOCK = {
  version: '1.0.0',
  micropython: [
    { chip: 'ESP32', archivo: 'ESP32_GENERIC-20260824-v1.29.0.bin', direccion: 0x1000, tamano: 1790544 },
    { chip: 'ESP32-S3', archivo: 'ESP32_GENERIC_S3-SPIRAM_OCT-20260824-v1.29.0.bin', direccion: 0, tamano: 1786704 },
  ],
  archivos: 22,
  puente_ia: true,
}

export const inventario = () => (USAR_MOCKS ? Promise.resolve(MOCK) : pedir(CONSOLA_FLASHEO, { params: {} }))
export const archivos = () => pedir(CONSOLA_FLASHEO_ARCHIVOS, { params: {} })
export const configuracion = (datos) => pedir(CONSOLA_FLASHEO_CONFIGURACION, { metodo: 'POST', cuerpo: datos })

export async function micropython(chip) {
  const r = await fetch(`${API_BASE_URL}${CONSOLA_FLASHEO_MICROPYTHON(chip)}`, {
    credentials: OPCIONES_SESION.credentials,
    headers: OPCIONES_SESION.headers,
  })
  if (!r.ok) throw new Error(`No se pudo descargar MicroPython para ${chip} (${r.status}).`)
  return new Uint8Array(await r.arrayBuffer())
}
