import { createContext, createElement, useContext, useState } from 'react'
import * as alertasApi from '../services/alertas'
import * as dispositivosApi from '../services/dispositivos'
import * as organizacionesApi from '../services/organizaciones'
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

// Una sola consulta para todas las pestañas; se vuelve a pedir cada 30 s para el «en vivo».
// `elegir(num)` cambia el dispositivo a la vista (Inicio y Mediciones lo comparten).
const OperadorContext = createContext(null)
export function OperadorProvider({ usuario, children }) {
  const [elegido, elegir] = useState(null)
  const valor = useDatos(() => cargarOperador(usuario, elegido), [usuario?.num, elegido], { cadaMs: 30000 })
  return createElement(OperadorContext.Provider, { value: { ...valor, elegir } }, children)
}
export const useOperador = () => useContext(OperadorContext)

export const lecturaDe = (datos, variable) => datos?.lecturas.find((l) => l.variable === variable)
export const umbralDe = (datos, variable) => datos?.umbrales.find((u) => u.variable === variable)
export const pendientesDe = (datos) => (datos?.alertas ?? []).filter((a) => a.estado === 'PENDIENTE')
