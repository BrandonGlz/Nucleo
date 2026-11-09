import { createContext, createElement, useContext } from 'react'
import * as alertasApi from '../services/alertas'
import * as dispositivosApi from '../services/dispositivos'
import * as organizacionesApi from '../services/organizaciones'
import * as umbralesApi from '../services/umbrales'
import { pagina } from '../utils/convertir'
import { useDatos } from './useDatos'

// Datos del operador: su dispositivo asignado con área, últimas lecturas y umbrales, y sus alertas.
// Las demás cuentas ven el primer dispositivo de su área (o el primero, si ven todas las áreas).
export async function cargarOperador(usuario) {
  const dispositivos = pagina(await dispositivosApi.lista())
  const dispositivo =
    dispositivos.find((d) => d.operador === usuario?.num) ??
    dispositivos.find((d) => usuario?.rol !== 'OPER' && d.area === usuario?.area) ??
    dispositivos[0] ??
    null
  if (!dispositivo) return { dispositivo: null, area: null, lecturas: [], umbrales: [], alertas: [] }
  const [area, lecturas, umbrales, alertas] = await Promise.all([
    organizacionesApi.area(dispositivo.area).catch(() => null),
    dispositivosApi.ultimasLecturas(dispositivo.num),
    umbralesApi.lista(dispositivo.num).then(pagina),
    alertasApi.lista({ dispositivo: dispositivo.num }).then(pagina),
  ])
  return { dispositivo, area, lecturas, umbrales, alertas: alertas.filter((a) => a.dispositivo === dispositivo.num) }
}

// Una sola consulta para todas las pestañas; se vuelve a pedir cada 30 s para el «en vivo».
const OperadorContext = createContext(null)
export function OperadorProvider({ usuario, children }) {
  const valor = useDatos(() => cargarOperador(usuario), [usuario?.num], { cadaMs: 30000 })
  return createElement(OperadorContext.Provider, { value: valor }, children)
}
export const useOperador = () => useContext(OperadorContext)

export const lecturaDe = (datos, variable) => datos?.lecturas.find((l) => l.variable === variable)
export const umbralDe = (datos, variable) => datos?.umbrales.find((u) => u.variable === variable)
export const pendientesDe = (datos) => (datos?.alertas ?? []).filter((a) => a.estado === 'PENDIENTE')
