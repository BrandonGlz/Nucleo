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

  // `codigo`: segundo paso de la verificación en dos pasos.
  const login = useCallback(
    async (correo, password, codigo) => {
      const telefono = prefs.push ? await tokenExpo() : null
      const { token, usuario: u, configurar_segundo_factor } = await auth.login(correo, password, telefono, codigo)
      guardarToken(token)
      if (configurar_segundo_factor) {
        // El rol exige la verificación en dos pasos y se configura en la web: no se entra a medias.
        await auth.logout(telefono).catch(() => {})
        guardarToken(null)
        const error = new Error('Configura la verificación en dos pasos en la web.')
        error.segundoFactorPendiente = true
        throw error
      }
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
