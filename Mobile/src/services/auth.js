import { Platform } from 'react-native'
import { AUTH_LOGIN, AUTH_LOGOUT, AUTH_YO } from '../api'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'

export async function login(correo, password) {
  if (USAR_MOCKS) return mock.login({ correo, password })
  const plataforma = Platform.OS === 'ios' ? 'IOS' : 'ANDROID'
  return pedir(AUTH_LOGIN, { metodo: 'POST', cuerpo: { correo, password, plataforma } })
}
export async function logout() {
  if (USAR_MOCKS) return mock.logout()
  return pedir(AUTH_LOGOUT, { metodo: 'POST', cuerpo: {} })
}
export async function yo() {
  if (USAR_MOCKS) return (await mock.login({ correo: '' })).usuario
  return pedir(AUTH_YO)
}
