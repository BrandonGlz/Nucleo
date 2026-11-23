import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from './SesionContext'
import * as alertasApi from '../services/alertas'
import * as avisosApi from '../services/avisos'
import { EVENTO, escucharPanel } from '../services/tiempoReal'
import { limiteAlerta, NIVEL_ALERTA, pagina, TIPOS_NOTIFICACION, TONO_NIVEL, tituloAlerta, valorAlerta } from '../utils/convertir'

const AvisosContext = createContext(null)
const CLAVE_LEIDAS = 'nucleo.notificaciones.leidas'
// Avisos por página: la campana y /notificaciones cargan la primera y piden más con «Cargar más».
const AVISOS_POR_PAGINA = 50

// Los avisos llevan su propia clave para no chocar con los números de las notificaciones de alertas.
const claveAviso = (num) => `v${num}`

// El contrato no guarda si una notificación de alerta se leyó: se recuerda en este navegador.
// Los avisos sí traen `leido` de la API.
const leerLeidas = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_LEIDAS)) || [])
  } catch {
    return new Set()
  }
}

// Alertas pendientes (contador del menú) y notificaciones del usuario (campana y su pantalla):
// las de alertas de medición más los avisos de dispositivos, usuarios, reportes y Nico AI, en una
// sola lista de la más reciente a la más vieja.
// El administrador ve como notificación cada alerta de su organización, aunque el aviso por correo
// le llegue al supervisor del área.
export function AvisosProvider({ children }) {
  const { usuario } = useSesion()
  const todas = usuario?.rol === 'ADMIN'
  const conOrganizacion = Boolean(usuario?.organizacion)
  const [alertas, setAlertas] = useState([])
  const [notifs, setNotifs] = useState([])
  const [avisos, setAvisos] = useState([])
  // Paginación de GET /avisos/: última página cargada, total y si hay más; el contador sin leer
  // viene de GET /avisos/conteo/ (cuenta también los que aún no se cargan).
  const [paginaAvisos, setPaginaAvisos] = useState({ num: 1, total: 0, hayMas: false, cargando: false })
  const [avisosSinLeer, setAvisosSinLeer] = useState(0)
  // Números de los avisos ya cargados, para no contar dos veces uno que llega en vivo repetido.
  const numsAvisos = useRef(new Set())
  useEffect(() => {
    numsAvisos.current = new Set(avisos.map((v) => v.num))
  }, [avisos])
  const [leidas, setLeidas] = useState(leerLeidas)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!conOrganizacion) return undefined
    let vivo = true
    // Por separado: si una de las dos fuentes falla, la otra sigue mostrándose.
    Promise.all([alertasApi.lista(), alertasApi.notificaciones()])
      .then(([a, n]) => {
        if (!vivo) return
        setAlertas(pagina(a))
        setNotifs(pagina(n))
      })
      .catch(() => {})
    avisosApi
      .lista({ page_size: AVISOS_POR_PAGINA })
      .then((v) => {
        if (!vivo) return
        const filas = pagina(v)
        setAvisos(filas)
        setPaginaAvisos({ num: 1, total: v?.count ?? filas.length, hayMas: Boolean(v?.next), cargando: false })
      })
      .catch(() => {})
    avisosApi
      .conteo()
      .then((c) => vivo && setAvisosSinLeer(c?.no_leidos ?? 0))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [vuelta, conOrganizacion])

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])

  // Siguiente página de avisos. Los que llegaron en vivo desplazan las páginas, así que se
  // descartan los repetidos por número.
  const cargarMas = useCallback(() => {
    if (!paginaAvisos.hayMas || paginaAvisos.cargando) return
    const num = paginaAvisos.num + 1
    setPaginaAvisos((p) => ({ ...p, cargando: true }))
    avisosApi
      .lista({ page_size: AVISOS_POR_PAGINA, page: num })
      .then((v) => {
        const filas = pagina(v)
        setAvisos((lista) => {
          const vistos = new Set(lista.map((a) => a.num))
          return [...lista, ...filas.filter((a) => !vistos.has(a.num))]
        })
        setPaginaAvisos({ num, total: v?.count ?? 0, hayMas: Boolean(v?.next), cargando: false })
      })
      .catch(() => setPaginaAvisos((p) => ({ ...p, cargando: false })))
  }, [paginaAvisos])

  // Canal en vivo: una alerta nueva o resuelta vuelve a pedir todo; un aviso nuevo se agrega
  // tal cual llega (sin sonido: solo las alertas críticas suenan).
  useEffect(() => {
    if (!conOrganizacion) return undefined
    const cerrar = escucharPanel()
    const alEvento = (e) => {
      const tipo = e.detail?.tipo
      if (tipo?.startsWith('alerta.')) recargar()
      else if (tipo === 'aviso.nuevo' && e.detail.aviso) {
        const nuevo = e.detail.aviso
        if (!numsAvisos.current.has(nuevo.num)) {
          setPaginaAvisos((p) => ({ ...p, total: p.total + 1 }))
          if (!nuevo.leido) setAvisosSinLeer((n) => n + 1)
        }
        setAvisos((lista) => [nuevo, ...lista.filter((v) => v.num !== nuevo.num)])
      }
    }
    window.addEventListener(EVENTO, alEvento)
    return () => {
      window.removeEventListener(EVENTO, alEvento)
      cerrar()
    }
  }, [recargar, conOrganizacion])

  const notificaciones = useMemo(() => {
    const porNum = new Map(alertas.map((a) => [a.num, a]))
    const origen = todas ? alertas.map((a) => ({ num: `a${a.num}`, alerta: a.num, fecha_envio: a.fecha_hora })) : notifs
    const deAlertas = origen
      .map((n) => {
        const a = porNum.get(n.alerta)
        if (!a) return null
        return {
          num: n.num,
          tipo: 'ALERTA',
          alerta: a,
          titulo: tituloAlerta(a),
          meta: `${a.dispositivo_nombre} · ${valorAlerta(a)} (${limiteAlerta(a)})`,
          fecha: n.fecha_envio,
          nivel: a.nivel,
          ...NIVEL_ALERTA[a.nivel],
          ruta: '/alertas',
          leida: leidas.has(n.num),
        }
      })
      .filter(Boolean)
    const deAvisos = avisos.map((v) => {
      const tipo = TIPOS_NOTIFICACION[v.tipo] ?? { icon: 'info', ruta: '/panel' }
      return {
        num: claveAviso(v.num),
        tipo: v.tipo,
        aviso: v.num,
        titulo: v.titulo,
        meta: v.detalle,
        fecha: v.fecha_hora,
        nivel: v.nivel,
        icon: tipo.icon,
        tone: TONO_NIVEL[v.nivel] ?? 'neutral',
        ruta: v.ruta || tipo.ruta,
        leida: Boolean(v.leido),
      }
    })
    return [...deAlertas, ...deAvisos].sort((x, y) => (x.fecha < y.fecha ? 1 : -1))
  }, [alertas, notifs, avisos, leidas, todas])

  // Sin `nums` marca todas: las de alertas en este navegador y los avisos en la API.
  const marcarLeidas = useCallback(
    (nums) => {
      const lista = nums ?? notificaciones.map((x) => x.num)
      const deAvisos = new Set(notificaciones.filter((n) => n.aviso != null && lista.includes(n.num)).map((n) => n.aviso))
      const nuevo = new Set(leidas)
      for (const n of lista) if (!String(n).startsWith('v')) nuevo.add(n)
      setLeidas(nuevo)
      try {
        localStorage.setItem(CLAVE_LEIDAS, JSON.stringify([...nuevo]))
      } catch {
        // Sin almacenamiento se pierde al recargar.
      }
      if (nums && !deAvisos.size) return
      // Se marca de inmediato en pantalla; si la API falla, la siguiente recarga lo corrige.
      // Sin `nums` también se marcan los avisos que aún no se cargan (la API marca todos).
      const sinLeer = avisos.filter((v) => !v.leido && deAvisos.has(v.num)).length
      setAvisos((vs) => vs.map((v) => (!nums || deAvisos.has(v.num) ? { ...v, leido: true } : v)))
      setAvisosSinLeer((n) => (nums ? Math.max(0, n - sinLeer) : 0))
      avisosApi
        .marcarLeidos(nums ? [...deAvisos] : undefined)
        .then(() => avisosApi.conteo())
        .then((c) => setAvisosSinLeer(c?.no_leidos ?? 0))
        .catch(() => {})
    },
    [leidas, notificaciones, avisos],
  )

  const valor = useMemo(
    () => ({
      alertas,
      pendientes: alertas.filter((a) => a.estado === 'PENDIENTE'),
      notificaciones,
      // Las de alertas se cuentan aquí; las de avisos, con el conteo de la API.
      noLeidas: notificaciones.filter((n) => !n.leida && n.aviso == null).length + avisosSinLeer,
      // Total de notificaciones (incluye los avisos aún sin cargar) y paginación de los avisos.
      total: notificaciones.filter((n) => n.aviso == null).length + Math.max(paginaAvisos.total, avisos.length),
      hayMas: paginaAvisos.hayMas,
      cargandoMas: paginaAvisos.cargando,
      cargarMas,
      marcarLeidas,
      recargar,
    }),
    [alertas, notificaciones, avisos.length, avisosSinLeer, paginaAvisos, cargarMas, marcarLeidas, recargar],
  )
  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>
}

// Otro origen de avisos con la misma forma (la consola de administración da los de seguridad).
// `campana: true` muestra la campana aunque la sesión sea del administrador de plataforma.
export function ProveedorAvisos({ valor, children }) {
  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAvisos = () => useContext(AvisosContext)
