import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProveedorAvisos } from '../context/AvisosContext'
import * as nicoApi from '../services/nico'
import { NIVELES_AVISO, TIPOS_AVISO } from './catalogos'

// El canal en vivo (/ws/panel/) es por organización y el superusuario no tiene: se pregunta cada minuto.
const CADA_MS = 60000

// Avisos de la consola de Nico AI (campana del encabezado y /notificaciones) con la misma forma que
// los de la web, para reutilizar el encabezado. Cada uno lleva a su pantalla de la consola (`ruta`).
export function AvisosNicoProvider({ children }) {
  const [lista, setLista] = useState([])
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let vivo = true
    const traer = () =>
      nicoApi
        .notificaciones()
        .then((r) => vivo && setLista(r.results))
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
      lista.map((n) => ({
        num: n.num,
        tipo: n.tipo,
        titulo: n.titulo,
        meta: n.texto,
        fecha: n.fecha,
        nivel: n.nivel,
        icon: TIPOS_AVISO[n.tipo]?.icon ?? 'bell',
        tone: NIVELES_AVISO[n.nivel]?.tone ?? 'neutral',
        leida: n.leida,
        ruta: n.enlace || '/notificaciones',
      })),
    [lista],
  )

  const marcarLeidas = useCallback(async (nums) => {
    setLista((l) => l.map((n) => (!nums || nums.includes(n.num) ? { ...n, leida: true } : n)))
    try {
      await nicoApi.leerNotificaciones(nums)
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
      notificaciones,
      noLeidas: notificaciones.filter((n) => !n.leida).length,
      marcarLeidas,
      recargar,
    }),
    [notificaciones, marcarLeidas, recargar],
  )
  return <ProveedorAvisos valor={valor}>{children}</ProveedorAvisos>
}
