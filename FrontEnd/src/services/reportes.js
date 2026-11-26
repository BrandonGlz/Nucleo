import {
  AREAS,
  DISPOSITIVOS,
  PROGRAMACIONES_REPORTE,
  PROGRAMACION_PROBAR,
  PROGRAMACION_REPORTE,
  REPORTE,
  REPORTE_ARCHIVAR,
  REPORTE_CSV,
  REPORTE_DESARCHIVAR,
  REPORTE_FORMATO,
  REPORTE_PDF,
  REPORTE_REPETIR,
  REPORTE_VISTA_PREVIA,
  REPORTES,
} from '../api'
import { API_BASE_URL, OPCIONES_SESION } from './api/client'
import { pagina } from '../utils/convertir'
import { USAR_MOCKS, pedir } from './config'
import * as mock from './mock/handlers'
import { cifrasHoja } from './cifrasReporte'

export { cifrasHoja } from './cifrasReporte'

// La API guarda las cifras tal como las calcula (variables y series por código, dispositivos
// por código MQTT). La hoja del reporte usa una forma resumida: título, total de lecturas,
// nombres de los dispositivos, una fila por variable y la serie de la variable principal.
function adaptar(r, areas, nombres) {
  if (Array.isArray(r.cifras?.variables)) return r
  const area =
    r.cifras?.alcance ??
    (areas.find((a) => a.num === r.area)?.nombre ?? 'todas las áreas')
  return { ...r, cifras: cifrasHoja(r.cifras ?? {}, { area, nombres }) }
}

async function contexto() {
  const [areas, dispositivos] = await Promise.all([pedir(AREAS), pedir(DISPOSITIVOS)])
  return [pagina(areas), Object.fromEntries(pagina(dispositivos).map((d) => [d.codigo_mqtt, d.nombre]))]
}

export async function lista(params = {}) {
  if (USAR_MOCKS) return mock.reportes(params)
  const [respuesta, [areas, nombres]] = await Promise.all([pedir(REPORTES, { params }), contexto()])
  return pagina(respuesta).map((r) => adaptar(r, areas, nombres))
}
export async function archivar(num) {
  if (USAR_MOCKS) return mock.archivarReporte(num)
  return pedir(REPORTE_ARCHIVAR(num), { metodo: 'POST', cuerpo: {} })
}
export async function desarchivar(num) {
  if (USAR_MOCKS) return mock.desarchivarReporte(num)
  return pedir(REPORTE_DESARCHIVAR(num), { metodo: 'POST', cuerpo: {} })
}
export async function repetir(num, datos) {
  if (USAR_MOCKS) return mock.repetirReporte(num, datos)
  return pedir(REPORTE_REPETIR(num), { metodo: 'POST', cuerpo: datos })
}
export async function programaciones() {
  if (USAR_MOCKS) return mock.programaciones()
  return pedir(PROGRAMACIONES_REPORTE)
}
export async function crearProgramacion(datos) {
  if (USAR_MOCKS) return mock.crearProgramacion(datos)
  return pedir(PROGRAMACIONES_REPORTE, { metodo: 'POST', cuerpo: datos })
}
export async function actualizarProgramacion(num, datos) {
  if (USAR_MOCKS) return mock.actualizarProgramacion(num, datos)
  return pedir(PROGRAMACION_REPORTE(num), { metodo: 'PATCH', cuerpo: datos })
}
export async function probarProgramacion(num) {
  if (USAR_MOCKS) return mock.probarProgramacion(num)
  return pedir(PROGRAMACION_PROBAR(num), { metodo: 'POST' })
}
export async function crear(datos) {
  if (USAR_MOCKS) return mock.crearReporte(datos)
  const [r, [areas, nombres]] = await Promise.all([pedir(REPORTES, { metodo: 'POST', cuerpo: datos }), contexto()])
  return adaptar(r, areas, nombres)
}

// Cifras del paso «¿Cómo?» del asistente: sin IA y sin guardar nada.
export async function vistaPrevia({ areas = [], desde, hasta }) {
  const nombres = (lista) => Object.fromEntries(pagina(lista).map((d) => [d.codigo_mqtt, d.nombre]))
  if (USAR_MOCKS) {
    const [datos, dispositivos] = await Promise.all([
      mock.vistaPreviaReporte({ areas, desde, hasta }),
      mock.dispositivos(),
    ])
    return {
      ...datos,
      cifras: cifrasHoja(datos.cifras ?? {}, { area: datos.cifras?.alcance ?? 'todas las áreas', nombres: nombres(dispositivos) }),
    }
  }
  const [datos, [, porCodigo]] = await Promise.all([
    pedir(REPORTE_VISTA_PREVIA, { params: { areas: areas.join(','), desde, hasta } }),
    contexto(),
  ])
  return {
    ...datos,
    cifras: cifrasHoja(datos.cifras ?? {}, { area: datos.cifras?.alcance ?? 'todas las áreas', nombres: porCodigo }),
  }
}

// Cambia el formato del reporte: la API usa su versión actual y regenera el PDF sin IA.
export async function cambiarFormato(num, formato) {
  if (USAR_MOCKS) return mock.cambiarFormatoReporte(num, formato)
  const [r, [areas, nombres]] = await Promise.all([
    pedir(REPORTE_FORMATO(num), { metodo: 'POST', cuerpo: { formato } }),
    contexto(),
  ])
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
  const blob = USAR_MOCKS
    ? await mock.descargarReporte(num)
    : await fetch(`${API_BASE_URL}${REPORTE_PDF(num)}`, OPCIONES_SESION).then((r) => {
        if (!r.ok) throw new Error(`La API respondió con el estado ${r.status}.`)
        return r.blob()
      })
  descargarBlob(blob, `${nombre}.pdf`)
}

// Anexo CSV de lecturas; el servidor lo entrega en streaming.
export async function descargarCsv(num, nombre) {
  const blob = USAR_MOCKS
    ? await mock.descargarReporteCsv(num)
    : await fetch(`${API_BASE_URL}${REPORTE_CSV(num)}`, OPCIONES_SESION).then((r) => {
        if (!r.ok) throw new Error(`La API respondió con el estado ${r.status}.`)
        return r.blob()
      })
  descargarBlob(blob, `${nombre}.csv`)
}

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
