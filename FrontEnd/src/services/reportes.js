import { AREAS, DISPOSITIVOS, PROGRAMACIONES_REPORTE, REPORTE, REPORTE_PDF, REPORTES } from '../api'
import { API_BASE_URL } from './api/client'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, leerToken, pedir } from './config'
import * as mock from './mock/handlers'

const ORDEN = ['TEMP', 'HUM', 'AIRE']
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// La API guarda las cifras tal como las calcula (variables y series por código, dispositivos
// por código MQTT). La hoja del reporte usa una forma resumida: título, total de lecturas,
// nombres de los dispositivos, una fila por variable y la serie de la variable principal.
function adaptar(r, areas, nombres) {
  if (Array.isArray(r.cifras?.variables)) return r
  const area = areas.find((a) => a.num === r.area)?.nombre ?? 'todas las áreas'
  return { ...r, cifras: cifrasHoja(r.cifras ?? {}, { area, nombres }) }
}

// Cifras de la API en la forma de la hoja. `variable` elige la de la gráfica del periodo; sin
// ella se usa la variable con más alertas. Nico AI la usa para mostrar una sola gráfica.
export function cifrasHoja(c, { area = 'todas las áreas', nombres = {}, variable } = {}) {
  const porVariable = c.alertas?.por_variable ?? {}
  const codigos = ORDEN.filter((v) => c.variables?.[v])
  const principal =
    (variable && c.variables?.[variable] ? variable : null) ??
    [...codigos].sort((a, b) => (porVariable[b] ?? 0) - (porVariable[a] ?? 0))[0] ??
    'TEMP'
  const info = c.variables?.[principal]
  const porDia = c.intervalo_serie !== 'hora'
  const puntos = (c.series?.[principal] ?? []).map((p) => {
    const f = new Date(p.t)
    const etiqueta = porDia
      ? (c.series[principal].length <= 7 ? DIAS[f.getDay()] : `${f.getDate()}/${f.getMonth() + 1}`)
      : `${String(f.getHours()).padStart(2, '0')}:00`
    return [etiqueta, p.promedio]
  })
  return {
    titulo: info ? `${info.nombre.replace(/ \(.*\)$/, '')} en ${area}` : `Monitoreo en ${area}`,
    lecturas: codigos.reduce((s, v) => s + (c.variables[v].muestras ?? 0), 0),
    dispositivos: Object.keys(c.dispositivos ?? {}).map((codigo) => nombres[codigo] ?? codigo),
    variables: codigos.map((v) => ({
      variable: v,
      minimo: c.variables[v].minimo,
      promedio: c.variables[v].promedio,
      maximo: c.variables[v].maximo,
      alertas: porVariable[v] ?? 0,
    })),
    serie: puntos.length
      ? {
          variable: principal,
          etiqueta: `${info.nombre.replace(/ \(.*\)$/, '')} promedio por ${porDia ? 'día' : 'hora'}`,
          puntos,
        }
      : null,
  }
}

async function contexto() {
  const [areas, dispositivos] = await Promise.all([pedir(AREAS), pedir(DISPOSITIVOS)])
  return [pagina(areas), Object.fromEntries(pagina(dispositivos).map((d) => [d.codigo_mqtt, d.nombre]))]
}

export async function lista() {
  if (USAR_MOCKS) return mock.reportes()
  const [respuesta, [areas, nombres]] = await Promise.all([pedir(REPORTES), contexto()])
  return pagina(respuesta).map((r) => adaptar(r, areas, nombres))
}
export async function programaciones() {
  if (USAR_MOCKS) return mock.programaciones()
  return pedir(PROGRAMACIONES_REPORTE)
}
export async function crear(datos) {
  if (USAR_MOCKS) return mock.crearReporte(datos)
  const [r, [areas, nombres]] = await Promise.all([pedir(REPORTES, { metodo: 'POST', cuerpo: datos }), contexto()])
  return adaptar(r, areas, nombres)
}

// Un reporte con la misma forma que la lista (lo usa Nico AI para mostrar la hoja en el chat).
export async function obtener(num) {
  if (USAR_MOCKS) return pagina(await mock.reportes()).find((r) => r.num === num) ?? null
  const [r, [areas, nombres]] = await Promise.all([pedir(REPORTE(num)), contexto()])
  return adaptar(r, areas, nombres)
}

// Descarga directa del PDF que genera el servidor (formato estándar, el mismo de los correos).
export async function descargarArchivo(num, nombre) {
  if (USAR_MOCKS) throw new Error('Sin PDF en modo simulado.')
  const r = await fetch(`${API_BASE_URL}${REPORTE_PDF(num)}`, { headers: { Authorization: `Token ${leerToken()}` } })
  if (!r.ok) throw new Error(`La API respondió con el estado ${r.status}.`)
  const url = URL.createObjectURL(await r.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.pdf` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
