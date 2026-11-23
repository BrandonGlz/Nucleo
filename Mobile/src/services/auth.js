import { Platform } from 'react-native'
import { AUTH_CAMBIAR_PASSWORD, AUTH_FOTO, AUTH_LOGIN, AUTH_LOGOUT, AUTH_RECUPERAR, AUTH_SESION, AUTH_SESIONES, AUTH_YO } from '../api'
import { API_BASE_URL, apiRequest } from './api/client'
import { USAR_MOCKS, leerToken, pedir } from './config'
import * as mock from './mock/handlers'
import { telefono } from './notificaciones'

// La API registra el teléfono para las notificaciones push solo si recibe el token de Expo y
// la plataforma juntos; sin token se entra sin registrar el teléfono.
// `codigo`: segundo paso si la cuenta tiene la verificación en dos pasos (si falta, 401 con
// datos.requiere_codigo).
export async function login(correo, password, tokenExpo, codigo) {
  if (USAR_MOCKS) return mock.login({ correo, password })
  return pedir(AUTH_LOGIN, {
    metodo: 'POST',
    cuerpo: { correo, password, ...(codigo ? { codigo } : {}), ...telefono(tokenExpo) },
  })
}
// Manda al correo el enlace para elegir una contraseña nueva (se abre en la web). Siempre 204.
export async function recuperar(correo) {
  if (USAR_MOCKS) return null
  return pedir(AUTH_RECUPERAR, { metodo: 'POST', cuerpo: { correo } })
}
// Con el token de Expo, la API quita el teléfono de los push al cerrar la sesión.
export async function logout(tokenExpo) {
  if (USAR_MOCKS) return mock.logout()
  return pedir(AUTH_LOGOUT, { metodo: 'POST', cuerpo: tokenExpo ? { token_expo: tokenExpo } : {} })
}
export async function yo() {
  if (USAR_MOCKS) return (await mock.login({ correo: '' })).usuario
  return pedir(AUTH_YO)
}
// Cuentas de prueba de la pantalla de acceso. En modo simulado entra cualquier contraseña; con la
// API real son las de `manage.py sembrar_demo` y solo se muestran si EXPO_PUBLIC_DEMO_PASSWORD
// tiene la contraseña con la que se sembraron.
export const PASSWORD_DEMO = USAR_MOCKS ? 'demo' : process.env.EXPO_PUBLIC_DEMO_PASSWORD?.trim() || ''

const C = (num, rol, nombre, primer_apellido, estado_usuario = 'ACT') => ({
  num, rol, nombre, primer_apellido, estado_usuario,
  correo: `${nombre}.${primer_apellido}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@grupoaltamira.mx',
})
const SEMILLA = [
  C(1, 'ADMIN', 'Andrés', 'Villalobos'),
  C(3, 'SUPER', 'Mariana', 'Cruz'),
  C(5, 'ANALISTA', 'Karla', 'Méndez'),
  C(6, 'OPER', 'Luis', 'Ortega'),
  C(7, 'OPER', 'Diana', 'Ríos'),
  C(9, 'OPER', 'Jorge', 'Ramírez', 'INA'),
]
export function cuentasDemo() {
  if (USAR_MOCKS) return mock.cuentasDemo()
  return PASSWORD_DEMO ? SEMILLA.map((c) => ({ ...c })) : []
}

// Sesiones abiertas de la propia cuenta (`actual` = este teléfono) y cierre de otra.
export async function sesiones() {
  if (USAR_MOCKS) return mock.sesiones()
  return pedir(AUTH_SESIONES)
}
export async function cerrarSesion(num) {
  if (USAR_MOCKS) return mock.cerrarSesion(num)
  return pedir(AUTH_SESION(num), { metodo: 'DELETE' })
}

// Cambia la contraseña. La API cierra entonces todas las sesiones, también esta.
export async function cambiarPassword(actual, nueva) {
  if (USAR_MOCKS) return mock.cambiarPassword(actual, nueva)
  return pedir(AUTH_CAMBIAR_PASSWORD, { metodo: 'POST', cuerpo: { password_actual: actual, password_nueva: nueva } })
}

// Foto de perfil propia. `imagen`: el resultado de expo-image-picker ({uri, mimeType, fileName}).
// La API la recorta a 256×256 WebP y devuelve el usuario con `foto_url`.
export async function subirFoto(imagen) {
  if (USAR_MOCKS) return mock.subirFoto(imagen.uri)
  const tipo = imagen.mimeType || 'image/jpeg'
  const extension = tipo.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const nombre = imagen.fileName || `foto.${extension}`
  const datos = new FormData()
  // En el teléfono FormData lleva {uri, name, type}; en la web el selector entrega un File.
  if (Platform.OS === 'web') datos.append('foto', imagen.file ?? (await (await fetch(imagen.uri)).blob()), nombre)
  else datos.append('foto', { uri: imagen.uri, name: nombre, type: tipo })
  const token = leerToken()
  // Sin Content-Type: fetch pone el multipart con su separador.
  return apiRequest(AUTH_FOTO, { method: 'POST', headers: token ? { Authorization: `Token ${token}` } : {}, body: datos })
}
export async function quitarFoto() {
  if (USAR_MOCKS) return mock.quitarFoto()
  return pedir(AUTH_FOTO, { metodo: 'DELETE' })
}

// `foto_url` viene relativa al dominio de la API (/api/v1/fotos/…) y se pide con el token, como
// el resto de la API. En modo simulado ya es la imagen local.
const DOMINIO_API = API_BASE_URL.replace(/\/api\/v\d+$/, '')
export function fuenteFoto(fotoUrl) {
  if (!fotoUrl) return null
  if (/^(https?|file|content|data):/.test(fotoUrl)) return { uri: fotoUrl }
  const token = leerToken()
  return { uri: `${DOMINIO_API}${fotoUrl}`, headers: token ? { Authorization: `Token ${token}` } : undefined }
}
