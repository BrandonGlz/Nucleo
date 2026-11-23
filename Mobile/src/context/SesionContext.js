import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { LogoMark } from '../components/ui/Logo'
import * as auth from '../services/auth'
import { alCaducarSesion, guardarToken, leerToken } from '../services/config'
import { activarPush, olvidarToken, tokenDeSesion, tokenExpo } from '../services/notificaciones'
import { borrarSesion, guardarSesion, guardarTelefono, guardarUsuario, leerSesion } from '../services/sesionGuardada'
import { marca } from '../theme'
import { usePreferencias } from './PreferenciasContext'

const SesionContext = createContext(null)

// Si la API no contesta al abrir la app (sin red o el servidor en su descanso), no se espera más.
const ESPERA_VALIDACION_MS = 8000
const conTiempo = (promesa, ms) =>
  Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('Sin respuesta de la API.')), ms))])

// Pantalla breve mientras se valida la sesión guardada: mismo fondo que el arranque, y el logo solo
// si tarda (así no parpadea nada cuando no hay sesión o la API contesta rápido).
function Cargando() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(t)
  }, [])
  return (
    <View style={{ flex: 1, backgroundColor: marca.tinta, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      {visible && (
        <>
          <LogoMark tone="verde" size={72} />
          <ActivityIndicator color={marca.verde} accessibilityLabel="Abriendo tu sesión" />
        </>
      )}
    </View>
  )
}

// Sesión de la app: el token, el usuario y la fecha de inicio se guardan cifrados en el teléfono
// (services/sesionGuardada) y al abrir la app se validan con /auth/yo/ antes de entrar. Vale 30
// días desde el último inicio de sesión; un 401 de la API (caducó por inactividad o se cerró
// desde otro equipo) la borra y vuelve al acceso. Con los push activos en el perfil, el teléfono
// se registra al entrar (y al restaurar la sesión) y se quita al salir.
export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [restaurando, setRestaurando] = useState(true)
  const { prefs } = usePreferencias()
  // Token de push con el que se registró este teléfono, para quitarlo al salir aunque la app se
  // haya reiniciado (tokenDeSesion() solo vive en memoria).
  const telefonoGuardado = useRef(null)

  // Borra la sesión en el teléfono (sin llamar a la API).
  const olvidar = useCallback(() => {
    olvidarToken()
    guardarToken(null)
    telefonoGuardado.current = null
    setUsuario(null)
    return borrarSesion()
  }, [])

  // 401: la sesión ya no existe en la API. 403 por la verificación en dos pasos pendiente (el rol
  // la exige y se configura en la web): la sesión sigue viva en la API, así que se cierra ahí
  // también (/auth/ sí acepta el token) y la pantalla de acceso lo explica al volver a entrar.
  const saliendo = useRef(false)
  useEffect(() => {
    alCaducarSesion((motivo) => {
      if (motivo !== 'segundo_factor') {
        olvidar()
        return
      }
      if (saliendo.current) return
      saliendo.current = true
      auth
        .logout(tokenDeSesion() ?? telefonoGuardado.current)
        .catch(() => {})
        .finally(() => {
          saliendo.current = false
          olvidar()
        })
    })
    return () => alCaducarSesion(null)
  }, [olvidar])

  // Al abrir la app: sesión guardada → se valida con la API antes de entrar.
  useEffect(() => {
    let vivo = true
    const restaurar = async () => {
      const g = await leerSesion()
      if (!g) return
      telefonoGuardado.current = g.telefono
      guardarToken(g.token)
      if (g.vencida) {
        // Pasaron los 30 días: se cierra también en la API (y se quita el teléfono de los push).
        await conTiempo(auth.logout(g.telefono), ESPERA_VALIDACION_MS).catch(() => {})
        await olvidar()
        return
      }
      try {
        const u = await conTiempo(auth.yo(), ESPERA_VALIDACION_MS)
        if (vivo) setUsuario(u)
      } catch (e) {
        if (e?.status === 401 || !g.usuario) {
          await olvidar()
          return
        }
        // Sin red o sin respuesta: se entra con el usuario guardado; las pantallas reintentan y un
        // 401 posterior cierra la sesión.
        if (vivo) setUsuario(g.usuario)
      }
    }
    restaurar()
      .catch(() => {})
      .finally(() => vivo && setRestaurando(false))
    return () => {
      vivo = false
    }
  }, [olvidar])

  // Los cambios del usuario (revalidación, foto de perfil…) también quedan guardados.
  useEffect(() => {
    if (usuario && leerToken()) guardarUsuario(usuario)
  }, [usuario])

  // Sesión restaurada con los push activos: vuelve a registrar el teléfono (el token de Expo puede
  // haber cambiado) y lo deja en memoria para quitarlo al salir. No frena la entrada.
  const restaurada = useRef(false)
  useEffect(() => {
    if (restaurando || restaurada.current) return
    restaurada.current = true
    if (!usuario || !prefs.push) return
    activarPush(true)
      .then(() => {
        const t = tokenDeSesion()
        if (t && leerToken()) {
          telefonoGuardado.current = t
          guardarTelefono(t)
        }
      })
      .catch(() => {})
  }, [restaurando, usuario, prefs.push])

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
      telefonoGuardado.current = telefono
      await guardarSesion({ token, usuario: u, telefono })
      setUsuario(u)
      return u
    },
    [prefs.push],
  )

  const logout = useCallback(async () => {
    try {
      await auth.logout(tokenDeSesion() ?? telefonoGuardado.current)
    } finally {
      await olvidar()
    }
  }, [olvidar])

  // Cambios del propio usuario que devuelve la API (p. ej. la foto de perfil), al instante.
  const actualizarUsuario = useCallback((cambios) => setUsuario((u) => (u ? { ...u, ...cambios } : u)), [])

  const valor = useMemo(() => ({ usuario, login, logout, actualizarUsuario }), [usuario, login, logout, actualizarUsuario])
  return <SesionContext.Provider value={valor}>{restaurando ? <Cargando /> : children}</SesionContext.Provider>
}

export const useSesion = () => useContext(SesionContext)
