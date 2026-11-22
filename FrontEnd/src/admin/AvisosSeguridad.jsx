import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProveedorAvisos } from '../context/AvisosContext'
import * as adminApi from '../services/admin'
import { pagina } from '../utils/convertir'
import { NIVEL_ALERTA, TIPO_ALERTA } from './catalogos'

const CADA_MS = 60000

// Avisos de la consola de administración: notificaciones de las alertas de seguridad (campana del
// encabezado y página /notificaciones) y el número de alertas nuevas (contador del menú «Alertas»).
// Tienen la misma forma que los avisos de la web para reutilizar el encabezado.
export function AvisosSeguridadProvider({ children }) {
  const [notifs, setNotifs] = useState([])
  const [nuevas, setNuevas] = useState(0)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    const traer = () =>
      Promise.all([adminApi.notificaciones(), adminApi.resumenAlertas()])
        .then(([n, r]) => {
          if (!vivo) return
          setNotifs(pagina(n))
          setNuevas(r.nuevas)
        })
        .catch(() => {})
    traer()
    const timer = setInterval(traer, CADA_MS)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [vuelta])

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])

  const notificaciones = useMemo(
    () =>
      notifs.map((n) => {
        const a = n.alerta
        const nivel = NIVEL_ALERTA[n.nivel] ?? NIVEL_ALERTA.advertencia
        return {
          num: n.num,
          alerta: a,
          titulo: a.titulo,
          meta: [TIPO_ALERTA[a.tipo]?.label, a.usuario?.correo, a.ip].filter(Boolean).join(' · '),
          // Detalle de una línea para el desplegable de la campana (el completo va en el title).
          resumen: [TIPO_ALERTA[a.tipo]?.corto ?? TIPO_ALERTA[a.tipo]?.label, a.usuario?.correo ?? a.ip].filter(Boolean).join(' · '),
          fecha: n.fecha,
          nivel: n.nivel,
          icon: nivel.icon,
          tone: nivel.tone,
          leida: n.leida,
          correo: n.correo_enviado,
        }
      }),
    [notifs],
  )

  const marcarLeidas = useCallback(async (nums) => {
    setNotifs((lista) => lista.map((n) => (!nums || nums.includes(n.num) ? { ...n, leida: true } : n)))
    try {
      await adminApi.leerNotificaciones(nums)
    } catch {
      // Se vuelve a pedir la lista para no mostrar un estado que no se guardó.
      setVuelta((v) => v + 1)
    }
  }, [])

  const valor = useMemo(
    () => ({
      campana: true,
      alertas: [],
      pendientes: [],
      alertasNuevas: nuevas,
      notificaciones,
      noLeidas: notificaciones.filter((n) => !n.leida).length,
      marcarLeidas,
      recargar,
    }),
    [nuevas, notificaciones, marcarLeidas, recargar],
  )
  return <ProveedorAvisos valor={valor}>{children}</ProveedorAvisos>
}
