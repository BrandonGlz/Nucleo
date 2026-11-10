import { createContext, createElement, useContext, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { usePreferencias } from '../context/PreferenciasContext'
import * as alertasApi from '../services/alertas'
import * as dispositivosApi from '../services/dispositivos'
import * as organizacionesApi from '../services/organizaciones'
import { avisarAlerta, marcarCanal, preparar } from '../services/notificaciones'
import { escucharPanel } from '../services/tiempoReal'
import * as umbralesApi from '../services/umbrales'
import { pagina } from '../utils/convertir'
import { useDatos } from './useDatos'

const SIN_DATOS = { dispositivo: null, dispositivos: [], area: null, lecturas: [], umbrales: [], alertas: [] }

// Datos de la app: el dispositivo a la vista con área, últimas lecturas y umbrales, y las alertas.
// El operador ve su dispositivo asignado y sus alertas. Las demás cuentas eligen entre los dispositivos
// que les tocan (por defecto, el primero de su área) y ven todas las alertas a su alcance, como en la web.
export async function cargarOperador(usuario, elegido) {
  if (!usuario?.organizacion) return SIN_DATOS
  const oper = usuario.rol === 'OPER'
  const todos = pagina(await dispositivosApi.lista())
  const propios = todos.filter((d) => d.operador === usuario.num)
  const dispositivos = oper && propios.length ? propios : todos
  const dispositivo =
    dispositivos.find((d) => d.num === elegido) ??
    propios[0] ??
    dispositivos.find((d) => !oper && d.area === usuario.area) ??
    dispositivos[0] ??
    null
  if (!dispositivo) return SIN_DATOS
  const [area, lecturas, umbrales, alertas] = await Promise.all([
    organizacionesApi.area(dispositivo.area).catch(() => null),
    dispositivosApi.ultimasLecturas(dispositivo.num),
    umbralesApi.lista(dispositivo.num).then(pagina),
    oper
      ? alertasApi.lista({ dispositivo: dispositivo.num }).then((r) => pagina(r).filter((a) => a.dispositivo === dispositivo.num))
      : alertasApi.lista({ page_size: 200 }).then(pagina),
  ])
  return { dispositivo, dispositivos, area, lecturas, umbrales, alertas }
}

// Con la app al frente: canal en vivo (alertas y estados al momento) y consulta de respaldo cada
// 30 s. En modo de bajo consumo, sin canal y cada 2 min. En segundo plano se cierra el canal y se
// deja de consultar; los avisos llegan entonces por push.
const CADA_MS = 30000
const CADA_MS_BAJO_CONSUMO = 120000

// Una sola consulta para todas las pestañas. `elegir(num)` cambia el dispositivo a la vista (Inicio
// y Mediciones lo comparten).
const OperadorContext = createContext(null)
export function OperadorProvider({ usuario, children }) {
  const [elegido, elegir] = useState(null)
  const [alFrente, setAlFrente] = useState(AppState.currentState !== 'background')
  const { prefs } = usePreferencias()
  const valor = useDatos(() => cargarOperador(usuario, elegido), [usuario?.num, elegido], {
    cadaMs: prefs.bajoConsumo ? CADA_MS_BAJO_CONSUMO : CADA_MS,
    activo: alFrente,
  })

  const { refrescar } = valor
  useEffect(() => {
    let antes = AppState.currentState === 'active'
    const sub = AppState.addEventListener('change', (estado) => {
      const frente = estado === 'active'
      if (frente && !antes) refrescar() // al volver, datos al día sin esperar al sondeo
      antes = frente
      setAlFrente(frente)
    })
    return () => sub.remove()
  }, [refrescar])

  // El último estado de las preferencias, para el canal sin reabrirlo en cada cambio.
  const avisos = useRef(prefs)
  useEffect(() => {
    avisos.current = prefs
  }, [prefs])
  useEffect(() => {
    preparar().catch(() => {})
  }, [])
  useEffect(() => {
    if (!alFrente || prefs.bajoConsumo || !usuario?.organizacion) return undefined
    marcarCanal(true)
    const cerrar = escucharPanel((evento) => {
      refrescar()
      // La API ya filtra los eventos por el alcance del usuario.
      if (evento.tipo === 'alerta.nueva' && avisos.current.push) {
        avisarAlerta(evento.datos, { sonido: avisos.current.sonido }).catch(() => {})
      }
    })
    return () => {
      marcarCanal(false)
      cerrar()
    }
  }, [alFrente, prefs.bajoConsumo, usuario?.organizacion, refrescar])

  return createElement(OperadorContext.Provider, { value: { ...valor, elegir } }, children)
}
export const useOperador = () => useContext(OperadorContext)

export const lecturaDe = (datos, variable) => datos?.lecturas.find((l) => l.variable === variable)
export const umbralDe = (datos, variable) => datos?.umbrales.find((u) => u.variable === variable)
export const pendientesDe = (datos) => (datos?.alertas ?? []).filter((a) => a.estado === 'PENDIENTE')
