import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as auth from '../services/auth'
import { guardarToken } from '../services/config'
import { olvidarToken, tokenDeSesion, tokenExpo } from '../services/notificaciones'
import { usePreferencias } from './PreferenciasContext'

const SesionContext = createContext(null)

// Sesión de la app: el token y el usuario viven mientras la app está abierta. Con los push activos
// en el perfil, el teléfono se registra al entrar y se quita al salir.
export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const { prefs } = usePreferencias()

  const login = useCallback(
    async (correo, password) => {
      const telefono = prefs.push ? await tokenExpo() : null
      const { token, usuario: u } = await auth.login(correo, password, telefono)
      guardarToken(token)
      setUsuario(u)
      return u
    },
    [prefs.push],
  )

  const logout = useCallback(async () => {
    try {
      await auth.logout(tokenDeSesion())
    } finally {
      olvidarToken()
      guardarToken(null)
      setUsuario(null)
    }
  }, [])

  const valor = useMemo(() => ({ usuario, login, logout }), [usuario, login, logout])
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

export const useSesion = () => useContext(SesionContext)
