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
