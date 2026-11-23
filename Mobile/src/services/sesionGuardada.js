import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

// Sesión guardada en el almacén cifrado del teléfono (Keystore en Android, Keychain en iOS) para
// no pedir el acceso cada vez que se abre la app. En la web no se guarda: la sesión dura lo que
// la pestaña. Cada valor va en su propia clave (el Keychain avisa con valores de más de 2 KB).
const TOKEN = 'nucleo.sesion.token'
const DESDE = 'nucleo.sesion.desde'
const USUARIO = 'nucleo.sesion.usuario'
const TELEFONO = 'nucleo.sesion.telefono'
const CLAVES = [TOKEN, DESDE, USUARIO, TELEFONO]

// La sesión guardada vale 30 días desde el último inicio de sesión (además de lo que dure en la API).
export const DIAS_SESION = 30
const VIGENCIA_MS = DIAS_SESION * 864e5

const disponible = Platform.OS !== 'web'
const leer = (k) => SecureStore.getItemAsync(k).catch(() => null)
const escribir = (k, v) => (v == null ? SecureStore.deleteItemAsync(k) : SecureStore.setItemAsync(k, String(v))).catch(() => {})

// { token, desde, usuario, telefono } o null si no hay sesión, está incompleta o ya venció
// (en ese caso también devuelve `vencida` con el token, para cerrarla en la API).
export async function leerSesion() {
  if (!disponible) return null
  const [token, desde, usuario, telefono] = await Promise.all(CLAVES.map(leer))
  if (!token) return null
  const inicio = Number(desde)
  let u = null
  try {
    u = usuario ? JSON.parse(usuario) : null
  } catch {
    u = null
  }
  const vencida = !Number.isFinite(inicio) || Date.now() - inicio > VIGENCIA_MS || Date.now() < inicio - 864e5
  return { token, desde: inicio, usuario: u, telefono: telefono || null, vencida }
}

// Al iniciar sesión: token, fecha de inicio y el teléfono de push con el que se registró.
export async function guardarSesion({ token, usuario, telefono }) {
  if (!disponible || !token) return
  await Promise.all([escribir(TOKEN, token), escribir(DESDE, Date.now()), escribir(TELEFONO, telefono || null)])
  await guardarUsuario(usuario)
}

// Datos del usuario (cambian con la foto de perfil o al revalidar la sesión).
export async function guardarUsuario(usuario) {
  if (!disponible || !usuario) return
  await escribir(USUARIO, JSON.stringify(usuario))
}

export async function guardarTelefono(telefono) {
  if (!disponible) return
  await escribir(TELEFONO, telefono || null)
}

export async function borrarSesion() {
  if (!disponible) return
  await Promise.all(CLAVES.map((k) => escribir(k, null)))
}
