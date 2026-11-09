import { AUTH_CAMBIAR_PASSWORD, AUTH_LOGIN, AUTH_LOGOUT, AUTH_YO } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function login(correo, password) {
  if (USAR_MOCKS) return mock.login({ correo, password })
  return pedir(AUTH_LOGIN, { metodo: 'POST', cuerpo: { correo, password } })
}
export async function logout() {
  if (USAR_MOCKS) return mock.logout()
  return pedir(AUTH_LOGOUT, { metodo: 'POST', cuerpo: {} })
}
export async function yo() {
  if (USAR_MOCKS) return (await mock.login({ correo: '' })).usuario
  return pedir(AUTH_YO)
}
export async function cambiarPassword(password_actual, password_nueva) {
  if (USAR_MOCKS) return mock.cambiarPassword({ password_actual, password_nueva })
  return pedir(AUTH_CAMBIAR_PASSWORD, { metodo: 'POST', cuerpo: { password_actual, password_nueva } })
}
// Cuentas de prueba de la pantalla de acceso. En modo simulado entra cualquier contraseña; con la
// API real son las de `manage.py sembrar_demo` y solo se muestran si VITE_DEMO_PASSWORD tiene la
// contraseña con la que se sembraron.
export const PASSWORD_DEMO = USAR_MOCKS ? 'demo' : import.meta.env.VITE_DEMO_PASSWORD?.trim() || ''

const C = (num, rol, nombre, primer_apellido, estado_usuario = 'ACT') => ({
  num, rol, nombre, primer_apellido, estado_usuario,
  correo: `${nombre}.${primer_apellido}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + '@grupoaltamira.mx',
})
const SEMILLA = [
  C(1, 'ADMIN', 'Andrés', 'Villalobos'),
  C(2, 'SUPER', 'Yadira', 'Salazar'),
  C(3, 'SUPER', 'Mariana', 'Cruz'),
  C(4, 'SUPER', 'Rubén', 'Castillo'),
  C(5, 'ANALISTA', 'Karla', 'Méndez'),
  C(6, 'OPER', 'Luis', 'Ortega'),
  C(7, 'OPER', 'Diana', 'Ríos'),
  C(8, 'OPER', 'Jorge', 'Ramírez', 'INA'),
]
export function cuentasDemo() {
  if (USAR_MOCKS) return mock.cuentasDemo()
  return PASSWORD_DEMO ? SEMILLA.map((c) => ({ ...c })) : []
}
