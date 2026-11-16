import {
  CONSOLA_DISPOSITIVO,
  CONSOLA_DISPOSITIVOS,
  CONSOLA_FIRMWARE,
  CONSOLA_ORGANIZACIONES,
  CONSOLA_POLITICAS,
  CONSOLA_RESUMEN,
  CONSOLA_SESION,
  CONSOLA_SESIONES,
  CONSOLA_USUARIO,
  CONSOLA_USUARIO_CERRAR_SESIONES,
  CONSOLA_USUARIO_QUITAR_2FA,
  CONSOLA_USUARIO_RESTABLECER,
  CONSOLA_USUARIOS,
} from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/consola'

// Consola de administración (admin.<dominio>): solo con sesión de superusuario. Con
// VITE_USE_MOCKS=true responde services/mock/consola.js.
const limpio = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
const post = (ruta) => pedir(ruta, { metodo: 'POST', cuerpo: {} })

export const resumen = () => (USAR_MOCKS ? mock.resumen() : pedir(CONSOLA_RESUMEN))
export const organizaciones = () => (USAR_MOCKS ? mock.organizacionesConsola() : pedir(CONSOLA_ORGANIZACIONES))

// Usuarios y roles de todas las organizaciones
export const usuarios = (params) => (USAR_MOCKS ? mock.listaUsuarios(limpio(params)) : pedir(CONSOLA_USUARIOS, { params: limpio(params) }))
export const crearUsuario = (datos) => (USAR_MOCKS ? mock.crearUsuario(datos) : pedir(CONSOLA_USUARIOS, { metodo: 'POST', cuerpo: datos }))
export const editarUsuario = (num, cambios) =>
  USAR_MOCKS ? mock.editarUsuario(num, cambios) : pedir(CONSOLA_USUARIO(num), { metodo: 'PATCH', cuerpo: cambios })
export const restablecerPassword = (num) => (USAR_MOCKS ? mock.restablecer(num) : post(CONSOLA_USUARIO_RESTABLECER(num)))
export const quitarSegundoFactor = (num) => (USAR_MOCKS ? mock.quitar2fa(num) : post(CONSOLA_USUARIO_QUITAR_2FA(num)))
export const cerrarSesionesDe = (num) => (USAR_MOCKS ? mock.cerrarSesionesDe(num) : post(CONSOLA_USUARIO_CERRAR_SESIONES(num)))

// Sesiones abiertas (navegadores y celulares)
export const sesiones = (params) => (USAR_MOCKS ? mock.listaSesiones(limpio(params)) : pedir(CONSOLA_SESIONES, { params: limpio(params) }))
export const cerrarSesion = (id) => (USAR_MOCKS ? mock.cerrarSesion(id) : pedir(CONSOLA_SESION(id), { metodo: 'DELETE' }))

// Equipos ESP32 y firmware
export const dispositivos = (params) =>
  USAR_MOCKS ? mock.listaDispositivos(limpio(params)) : pedir(CONSOLA_DISPOSITIVOS, { params: limpio(params) })
export const editarDispositivo = (num, cambios) =>
  USAR_MOCKS ? mock.editarDispositivo(num, cambios) : pedir(CONSOLA_DISPOSITIVO(num), { metodo: 'PATCH', cuerpo: cambios })
export const firmware = () => (USAR_MOCKS ? mock.firmware() : pedir(CONSOLA_FIRMWARE))

// Políticas de seguridad
export const politicas = () => (USAR_MOCKS ? mock.leerPoliticas() : pedir(CONSOLA_POLITICAS))
export const guardarPoliticas = (cambios) =>
  USAR_MOCKS ? mock.guardarPoliticas(cambios) : pedir(CONSOLA_POLITICAS, { metodo: 'PATCH', cuerpo: cambios })
