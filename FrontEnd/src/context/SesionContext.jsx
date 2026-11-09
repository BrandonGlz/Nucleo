import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as auth from '../services/auth'
import * as organizacionesApi from '../services/organizaciones'
import { pagina } from '../utils/convertir'
import { guardarToken, leerToken } from '../services/config'

const SesionContext = createContext(null)
const CLAVE_USUARIO = 'nucleo.usuario'
const CLAVE_TEMA = 'nucleo.tema'

const leer = (clave) => {
  try {
    return JSON.parse(localStorage.getItem(clave))
  } catch {
    return null
  }
}
const escribir = (clave, valor) => {
  try {
    if (valor == null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento se pierde al recargar.
  }
}

// Sesión (token y usuario) y tema: light, dark o system (sigue al sistema).
export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(() => (leerToken() ? leer(CLAVE_USUARIO) : null))
  const [tema, setTemaEstado] = useState(() => leer(CLAVE_TEMA) || 'system')
  const [oscuroSistema, setOscuroSistema] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const cambio = (e) => setOscuroSistema(e.matches)
    mq.addEventListener('change', cambio)
    return () => mq.removeEventListener('change', cambio)
  }, [])

  // Nombre de la organización del usuario, para los encabezados.
  const [organizacion, setOrganizacion] = useState('')
  useEffect(() => {
    if (!usuario?.organizacion) return undefined
    let vivo = true
    organizacionesApi
      .propia()
      .then((r) => vivo && setOrganizacion(pagina(r).find((o) => o.num === usuario.organizacion)?.nombre ?? ''))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [usuario?.organizacion])

  const temaAplicado = tema === 'system' ? (oscuroSistema ? 'dark' : 'light') : tema
  useEffect(() => {
    document.documentElement.dataset.theme = temaAplicado
  }, [temaAplicado])

  const setTema = useCallback((t) => {
    setTemaEstado(t)
    escribir(CLAVE_TEMA, t)
  }, [])

  const login = useCallback(async (correo, password) => {
    const { token, usuario: u } = await auth.login(correo, password)
    guardarToken(token)
    escribir(CLAVE_USUARIO, u)
    setUsuario(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await auth.logout()
    } catch {
      // Aunque la API falle, la sesión local se cierra.
    }
    guardarToken(null)
    escribir(CLAVE_USUARIO, null)
    setUsuario(null)
  }, [])

  const valor = useMemo(
    () => ({ usuario, rol: usuario?.rol, organizacion, login, logout, tema, temaAplicado, setTema }),
    [usuario, organizacion, login, logout, tema, temaAplicado, setTema],
  )
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSesion = () => useContext(SesionContext)
