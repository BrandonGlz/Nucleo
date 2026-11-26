// Ediciones de formatos desde el chat de Nico AI, sin IA: se reconocen con reglas sobre los
// elementos de cada formato (WIDGETS y tarjetas añadidas) y sus opciones (esquema). Las
// operaciones se guardan por la API como una versión nueva.
import {
  cargarFormatos,
  esquema,
  opcionesDe,
  tarjeta,
  tarjetas,
} from '../reportes/personalizacion'
import * as formatosApi from '../../services/formatos'
import * as reportesApi from '../../services/reportes'

export const normalizar = (t) =>
  ` ${t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

// Nombres con que la gente se refiere a cada elemento de la plantilla.
const ALIAS = {
  cifras: ['cifras clave', 'cifras', 'indicadores', 'kpi', 'totales'],
  'var:TEMP': ['temperatura'],
  'var:HUM': ['humedad'],
  'var:AIRE': ['calidad del aire', 'aire', 'co2'],
  serie: ['grafica del periodo', 'grafica principal', 'evolucion', 'tendencia', 'por dia', 'serie'],
  alertas: ['alertas por variable', 'alertas'],
  analisis: ['analisis', 'conclusion', 'texto del reporte'],
}
// Sinónimos de los tipos de gráfica (el valor es el que guarda la plantilla).
const GRAFICAS = [
  ['solo cifra', 'cifra'],
  ['solo el numero', 'cifra'],
  ['cifras', 'cifra'],
  ['pastel', 'dona'],
  ['circular', 'dona'],
  ['dona', 'dona'],
  ['linea', 'linea'],
  ['columnas', 'columnas'],
  ['barras', 'barras'],
  ['tabla', 'tabla'],
  ['lista', 'lista'],
  ['rango', 'rango'],
]
const ANCHOS = [
  ['dos tercios', '8'],
  ['todo el ancho', '12'],
  ['ancho completo', '12'],
  ['completa', '12'],
  ['completo', '12'],
  ['mitad', '6'],
  ['medio', '6'],
  ['tercio', '4'],
]
const OCULTAR = /\s(quita|quitale|quitar|oculta|ocultale|ocultar|elimina|eliminar|borra|esconde|sin)\s/
const MOSTRAR = /\s(muestra|mostrar|agrega|agregar|anade|anadir|incluye|incluir|vuelve a poner|pon de nuevo|regresa)\s/
const VERBO_CAMBIO = /\s(pon|ponle|cambia|cambiala|cambialo|haz|hazla|hazlo|muestra|usa|deja|dejala|convierte)\s/
const PUEDEN_EDITAR = ['ADMIN', 'SUPER']

const nombreDe = (conf, id) => tarjeta(conf, id)?.nombre ?? id
const folio = (num) => `R-${String(num).padStart(4, '0')}`
const formatoDelReporte = (formatos, reporte) =>
  formatos.find((f) => f.num === Number(reporte?.formato)) ??
  formatos.find((f) => f.predeterminado) ??
  formatos[0]

// Elementos que nombra el texto, del alias más largo al más corto.
function elementosEn(t, conf) {
  const encontrados = []
  for (const w of tarjetas(conf)) {
    const alias = [...(ALIAS[w.id] ?? []), ...(w.fuente ? [normalizar(w.nombre).trim()] : [])]
    const largo = Math.max(0, ...alias.filter((a) => t.includes(` ${a} `) || t.includes(` ${a}`)).map((a) => a.length))
    if (largo) encontrados.push([w.id, largo])
  }
  return encontrados.sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

// Valor de una opción «uno» (gráfica o ancho) o datos «varios» que nombra el texto para el elemento.
function graficaEn(t, conf, id) {
  const op = esquema(conf, id).find((o) => o.clave === 'grafica')
  if (!op) return null
  const validos = op.valores.map(([v]) => v)
  for (const [palabra, valor] of GRAFICAS) {
    // La serie llama «barras» a sus barras horizontales.
    const v = valor === 'barras' && !validos.includes('barras') && validos.includes('horizontal') ? 'horizontal' : valor
    if (t.includes(` ${palabra} `) && validos.includes(v)) return v
  }
  return null
}
function datosEn(t, conf, id) {
  const op = esquema(conf, id).find((o) => o.clave === 'datos')
  if (!op) return []
  return op.valores.filter(([, etiqueta]) => {
    const e = normalizar(etiqueta).trim()
    return t.includes(` ${e} `) || e.split(' y ').some((p) => t.includes(` ${p} `))
  })
}

// Interpreta una orden de edición. Devuelve null si el texto no es una edición.
// `reporte` es el reporte de la conversación sobre el que se trabaja.
export async function interpretar(texto, reporte) {
  if (!reporte?.num) return null
  const t = normalizar(texto)
  const formatos = await cargarFormatos()
  const formato = formatoDelReporte(formatos, reporte)
  if (!formato) return null
  const conf = formato.conf

  if (/\s(deshaz|deshacer|revierte|como estaba)\s/.test(t)) return { accion: 'deshacer' }
  if (/\s(que|cuales) (elementos|secciones|tarjetas|partes)|elementos de la plantilla|que tiene (el reporte|la plantilla)/.test(t))
    return { accion: 'elementos' }
  if (/\s(plantilla|formato)\s/.test(t) && /\s(usa|usar|cambia|cambiar|aplica|aplicar|con|pasa)\s/.test(t)) {
    const destino = formatos
      .filter((f) => f.id !== formato.id)
      .find((f) => t.includes(normalizar(f.nombre)) || t.includes(` ${normalizar(f.nombre).trim()} `))
    if (destino) return { accion: 'plantilla', id: destino.id }
  }

  const ids = elementosEn(t, conf)
  if (!ids.length) return null
  // «quita las alertas de la humedad»: el elemento es la humedad y «alertas» es un dato suyo.
  let id = ids[0]
  if (ids.length > 1 && ids.includes('alertas') && ids.some((x) => x.startsWith('var:'))) id = ids.find((x) => x.startsWith('var:'))

  const ancho = ANCHOS.find(([p]) => t.includes(` ${p} `) || t.includes(` ${p}`))?.[1]
  if (ancho && /\s(ancho|ocupe|ocupa|mitad|tercio|tercios|completa|completo)\s/.test(t)) return { accion: 'ancho', id, valor: ancho }

  if (/\s(arriba|al inicio|primero|hasta arriba|al principio)\s/.test(t) && /\s(mueve|muevelo|muevela|sube|subelo|subela|pon|ponlo|ponla)\s/.test(t))
    return { accion: 'mover', id, valor: 'inicio' }
  if (/\s(abajo|al final|hasta abajo|ultimo|ultima)\s/.test(t) && /\s(mueve|muevelo|muevela|baja|bajalo|bajala|pon|ponlo|ponla)\s/.test(t))
    return { accion: 'mover', id, valor: 'final' }

  const grafica = graficaEn(t, conf, id)
  if (grafica && (VERBO_CAMBIO.test(t) || / en (barras|columnas|linea|dona|pastel|circular|tabla|lista|rango|solo cifra|cifras?) /.test(t)))
    return { accion: 'grafica', id, valor: grafica }

  const oculto = conf.ocultos.includes(id) || !conf.orden.includes(id)
  // En las tarjetas de variable, «alertas» es un dato suyo; se trata aparte.
  const alertasDeVariable = id.startsWith('var:') && ids.includes('alertas')
  const datos = datosEn(t, conf, id).filter(([v]) => !(id.startsWith('var:') && v === 'alertas'))
  const valores = [...datos.map(([v]) => v), ...(alertasDeVariable ? ['alertas'] : [])]
  if (OCULTAR.test(t)) return valores.length ? { accion: 'datos', id, quitar: valores } : { accion: 'ocultar', id }
  if (MOSTRAR.test(t)) {
    if (oculto) return { accion: 'mostrar', id }
    if (valores.length) return { accion: 'datos', id, poner: valores }
  }
  return null
}

const listar = (conf) =>
  conf.orden.map((id) => {
    const op = opcionesDe(conf, id)
    const grafica = esquema(conf, id)
      .find((o) => o.clave === 'grafica')
      ?.valores.find(([v]) => v === op.grafica)?.[1]
    return {
      id,
      nombre: nombreDe(conf, id),
      visible: !conf.ocultos.includes(id),
      detalle: [grafica, { 4: 'un tercio', 6: 'mitad', 8: 'dos tercios', 12: 'ancho completo' }[op.ancho]].filter(Boolean).join(' · '),
    }
  })

// Aplica la orden por la API y devuelve la respuesta para el chat.
// `edicion.previo` guarda el formato y la configuración anteriores para «Deshacer».
export async function aplicar(orden, reporte, ultimaEdicion, rol) {
  if (!PUEDEN_EDITAR.includes(rol) && !['plantilla', 'elementos'].includes(orden.accion)) {
    return { texto: 'Solo ADMIN y SUPER pueden modificar formatos. Cambiar el formato de un reporte sí puedes hacerlo.' }
  }
  const formatos = await cargarFormatos()
  const actual = formatoDelReporte(formatos, reporte)
  if (!actual) return { texto: 'No encontré el formato de este reporte.' }

  if (orden.accion === 'deshacer') {
    if (!ultimaEdicion?.previo) return { texto: 'No hay cambios recientes que deshacer en este reporte.' }
    const previo = ultimaEdicion.previo
    if (Number(previo.formato) !== Number(actual.num)) {
      await reportesApi.cambiarFormato(reporte.num, previo.formato)
      await cargarFormatos()
      return { texto: `Listo, regresé el reporte ${folio(reporte.num)} al formato anterior.`, edicion: { num: reporte.num, deshecha: true } }
    }
    if (actual.esPlantilla) return { texto: 'No puedo volver a una versión de una plantilla; duplícala para editarla.' }
    await formatosApi.actualizar(actual.num, { conf: previo.conf })
    await reportesApi.cambiarFormato(reporte.num, actual.num)
    await cargarFormatos()
    return { texto: `Listo, regresé el reporte ${folio(reporte.num)} a la versión anterior.`, edicion: { num: reporte.num, deshecha: true } }
  }

  if (orden.accion === 'elementos') {
    return {
      texto: `El reporte ${folio(reporte.num)} usa el formato «${actual.nombre}». Estos son sus elementos; puedo ocultarlos, mostrarlos, cambiar su gráfica, su ancho o su orden.`,
      edicion: { num: reporte.num, elementos: listar(actual.conf), plantilla: actual.nombre },
    }
  }

  if (orden.accion === 'plantilla') {
    const destino = formatos.find((f) => f.id === orden.id)
    if (!destino) return { texto: 'Ese formato ya no está disponible.' }
    await reportesApi.cambiarFormato(reporte.num, destino.num)
    await cargarFormatos()
    return {
      texto: `Cambié el reporte ${folio(reporte.num)} al formato «${destino.nombre}».`,
      edicion: { num: reporte.num, previo: { formato: actual.num, conf: actual.conf } },
    }
  }

  let formato = actual
  let copia = null
  if (actual.esPlantilla) {
    copia = await formatosApi.duplicar(actual.num)
    const lista = await cargarFormatos()
    formato = lista.find((f) => f.num === copia.num) ?? copia
  }
  const conf = formato.conf
  const nombre = nombreDe(conf, orden.id)
  let nueva = conf
  let hecho = ''
  if (orden.accion === 'ocultar') {
    nueva = { ...conf, ocultos: [...new Set([...conf.ocultos, orden.id])] }
    hecho = `Oculté «${nombre}»`
  } else if (orden.accion === 'mostrar') {
    nueva = {
      ...conf,
      ocultos: conf.ocultos.filter((x) => x !== orden.id),
      orden: conf.orden.includes(orden.id) ? conf.orden : [...conf.orden, orden.id],
    }
    hecho = `Volví a mostrar «${nombre}»`
  } else if (orden.accion === 'mover') {
    const sin = conf.orden.filter((x) => x !== orden.id)
    nueva = { ...conf, orden: orden.valor === 'inicio' ? [orden.id, ...sin] : [...sin, orden.id] }
    hecho = `Moví «${nombre}» ${orden.valor === 'inicio' ? 'al inicio' : 'al final'}`
  } else {
    const op = opcionesDe(conf, orden.id)
    let cambio = {}
    if (orden.accion === 'grafica') {
      cambio = { grafica: orden.valor }
      const etiqueta = esquema(conf, orden.id)
        .find((o) => o.clave === 'grafica')
        .valores.find(([v]) => v === orden.valor)[1]
      hecho = `Cambié «${nombre}» a gráfica de ${etiqueta.toLowerCase()}`
    } else if (orden.accion === 'ancho') {
      cambio = { ancho: orden.valor }
      hecho = `«${nombre}» ahora ocupa ${{ 4: 'un tercio', 6: 'la mitad', 8: 'dos tercios', 12: 'todo el ancho' }[orden.valor]}`
    } else if (orden.accion === 'datos') {
      const datos = orden.quitar ? op.datos.filter((d) => !orden.quitar.includes(d)) : [...new Set([...op.datos, ...orden.poner])]
      cambio = { datos }
      const etiquetas = esquema(conf, orden.id)
        .find((o) => o.clave === 'datos')
        .valores.filter(([v]) => (orden.quitar ?? orden.poner).includes(v))
        .map(([, e]) => e.toLowerCase())
        .join(' y ')
      hecho = orden.quitar ? `Quité ${etiquetas} de «${nombre}»` : `Agregué ${etiquetas} a «${nombre}»`
    }
    nueva = { ...conf, opciones: { ...conf.opciones, [orden.id]: { ...op, ...cambio } } }
  }

  await formatosApi.actualizar(formato.num, { conf: nueva })
  await reportesApi.cambiarFormato(reporte.num, formato.num)
  await cargarFormatos()
  const nota = copia
    ? ` Dupliqué la plantilla «${actual.nombre}» como «${formato.nombre}» para no cambiarla.`
    : ''
  return {
    texto: `${hecho} en el reporte ${folio(reporte.num)}.${nota}`,
    edicion: { num: reporte.num, previo: { formato: actual.num, conf: actual.conf } },
  }
}

// Formatos disponibles con los elementos visibles de cada uno (para elegir antes de generar).
export async function plantillas() {
  const formatos = await cargarFormatos()
  return formatos.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    estandar: false,
    elementos: f.conf.orden.filter((id) => !f.conf.ocultos.includes(id)).map((id) => nombreDe(f.conf, id)),
  }))
}
