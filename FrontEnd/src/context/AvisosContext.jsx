import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as alertasApi from '../services/alertas'
import { EVENTO, escucharPanel } from '../services/tiempoReal'
import { limiteAlerta, NIVEL_ALERTA, pagina, tituloAlerta, valorAlerta } from '../utils/convertir'

const AvisosContext = createContext(null)
const CLAVE_LEIDAS = 'nucleo.notificaciones.leidas'

// El contrato no guarda si una notificación se leyó: se recuerda en este navegador.
const leerLeidas = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_LEIDAS)) || [])
  } catch {
    return new Set()
  }
}

// Alertas pendientes (contador del menú) y notificaciones del usuario (campana y su pantalla).
export function AvisosProvider({ children }) {
  const [alertas, setAlertas] = useState([])
  const [notifs, setNotifs] = useState([])
  const [leidas, setLeidas] = useState(leerLeidas)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    Promise.all([alertasApi.lista(), alertasApi.notificaciones()])
      .then(([a, n]) => {
        if (!vivo) return
        setAlertas(pagina(a))
        setNotifs(pagina(n))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [vuelta])

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])

  // Canal en vivo: una alerta nueva o resuelta vuelve a pedir alertas y notificaciones.
  useEffect(() => {
    const cerrar = escucharPanel()
    const alEvento = (e) => e.detail?.tipo?.startsWith('alerta.') && recargar()
    window.addEventListener(EVENTO, alEvento)
    return () => {
      window.removeEventListener(EVENTO, alEvento)
      cerrar()
    }
  }, [recargar])

  const notificaciones = useMemo(() => {
    const porNum = new Map(alertas.map((a) => [a.num, a]))
    return notifs
      .map((n) => {
        const a = porNum.get(n.alerta)
        if (!a) return null
        return {
          num: n.num,
          alerta: a,
          titulo: tituloAlerta(a),
          meta: `${a.dispositivo_nombre} · ${valorAlerta(a)} (${limiteAlerta(a)})`,
          fecha: n.fecha_envio,
          nivel: a.nivel,
          ...NIVEL_ALERTA[a.nivel],
          leida: leidas.has(n.num),
        }
      })
      .filter(Boolean)
      .sort((x, y) => (x.fecha < y.fecha ? 1 : -1))
  }, [alertas, notifs, leidas])

  const marcarLeidas = useCallback(
    (nums) => {
      const nuevo = new Set(leidas)
      for (const n of nums ?? notificaciones.map((x) => x.num)) nuevo.add(n)
      setLeidas(nuevo)
      try {
        localStorage.setItem(CLAVE_LEIDAS, JSON.stringify([...nuevo]))
      } catch {
        // Sin almacenamiento se pierde al recargar.
      }
    },
    [leidas, notificaciones],
  )

  const valor = useMemo(
    () => ({
      alertas,
      pendientes: alertas.filter((a) => a.estado === 'PENDIENTE'),
      notificaciones,
      noLeidas: notificaciones.filter((n) => !n.leida).length,
      marcarLeidas,
      recargar,
    }),
    [alertas, notificaciones, marcarLeidas, recargar],
  )
  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAvisos = () => useContext(AvisosContext)
