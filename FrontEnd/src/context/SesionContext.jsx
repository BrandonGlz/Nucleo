import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as auth from '../services/auth'
import * as organizacionesApi from '../services/organizaciones'
import { pagina } from '../utils/convertir'
import { guardarToken, leerToken } from '../services/config'
import { EVENTO_SEGUNDO_FACTOR } from '../services/api/client'

const SesionContext = createContext(null)
const CLAVE_USUARIO = 'nucleo.usuario'
const CLAVE_TEMA = 'nucleo.tema'
// El rol exige la verificación en dos pasos y la cuenta aún no la tiene: solo se puede ir al perfil.
const CLAVE_2FA = 'nucleo.segundo_factor_pendiente'

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
  const [segundoFactorPendiente, setPendiente] = useState(() => Boolean(leerToken() && leer(CLAVE_2FA)))
  const marcarSegundoFactor = useCallback((pendiente) => {
    setPendiente(pendiente)
    escribir(CLAVE_2FA, pendiente || null)
  }, [])
  useEffect(() => {
    const alAviso = () => marcarSegundoFactor(true)
    window.addEventListener(EVENTO_SEGUNDO_FACTOR, alAviso)
    return () => window.removeEventListener(EVENTO_SEGUNDO_FACTOR, alAviso)
  }, [marcarSegundoFactor])
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

  // `codigo`: segundo paso. Si falta, la API responde 401 con datos.requiere_codigo.
  const login = useCallback(
    async (correo, password, codigo) => {
      const { token, usuario: u, configurar_segundo_factor } = await auth.login(correo, password, codigo)
      guardarToken(token)
      escribir(CLAVE_USUARIO, u)
      marcarSegundoFactor(Boolean(configurar_segundo_factor))
      setUsuario(u)
      return u
    },
    [marcarSegundoFactor],
  )

  const logout = useCallback(async () => {
    try {
      await auth.logout()
    } catch {
      // Aunque la API falle, la sesión local se cierra.
    }
    guardarToken(null)
    escribir(CLAVE_USUARIO, null)
    marcarSegundoFactor(false)
    setUsuario(null)
  }, [marcarSegundoFactor])

  const valor = useMemo(
    () => ({
      usuario,
      rol: usuario?.rol,
      organizacion,
      login,
      logout,
      tema,
      temaAplicado,
      setTema,
      segundoFactorPendiente,
      marcarSegundoFactor,
    }),
    [usuario, organizacion, login, logout, tema, temaAplicado, setTema, segundoFactorPendiente, marcarSegundoFactor],
  )
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSesion = () => useContext(SesionContext)
