import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as auth from '../services/auth'
import { guardarToken } from '../services/config'

const SesionContext = createContext(null)

// Sesión de la app: el token y el usuario viven mientras la app está abierta.
export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null)

  const login = useCallback(async (correo, password) => {
    const { token, usuario: u } = await auth.login(correo, password)
    guardarToken(token)
    setUsuario(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await auth.logout()
    } finally {
      guardarToken(null)
      setUsuario(null)
    }
  }, [])

  const valor = useMemo(() => ({ usuario, login, logout }), [usuario, login, logout])
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

export const useSesion = () => useContext(SesionContext)
