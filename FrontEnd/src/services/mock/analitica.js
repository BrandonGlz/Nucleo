// Tableros y consultas simuladas de Analítica. La forma de las tarjetas sigue el contrato de
// Context/api/contrato-api.md para que la pantalla se pruebe sin backend.
import { ApiError } from '../api/client'
import * as db from './datos'

const esperar = (signal) =>
  new Promise((resolver, rechazar) => {
    if (signal?.aborted) {
      rechazar(new DOMException('Aborted', 'AbortError'))
      return undefined
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abortar)
      resolver()
    }, 260 + Math.random() * 240)
    const abortar = () => {
      clearTimeout(timer)
      rechazar(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abortar, { once: true })
    return abortar
  })
const pagina = (results) => ({ count: results.length, next: null, previous: null, results })
const copia = (x) => structuredClone(x)
const INFO = {
  TEMP: { nombre: 'Temperatura', unidad: '°C', decimales: 1 },
  HUM: { nombre: 'Humedad relativa', unidad: '%HR', decimales: 1 },
  AIRE: { nombre: 'Calidad del aire', unidad: 'ppm', decimales: 0 },
}
const VARIABLES = ['TEMP', 'HUM', 'AIRE']
const HORA = 3600000
const DIA = 86400000
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const META_CUMPLIMIENTO = { valor: 95, sentido: 'mayor', tolerancia: 5 }
const META_DISPONIBILIDAD = { valor: 98, sentido: 'mayor', tolerancia: 5 }
const META_TIEMPO = { valor: 30, sentido: 'menor', tolerancia: 5 }
const META_ALERTAS = { valor: 10, sentido: 'menor', tolerancia: 5 }

function tarjeta(id, tipo, x, y, w, h, titulo, opciones, meta) {
  return { id, tipo, x, y, w, h, titulo, opciones, ...(meta ? { meta } : {}) }
}
const kpi = (id, x, y, w, titulo, indicador, variable = 'filtro', meta) =>
  tarjeta(id, 'kpi', x, y, w, 1, titulo, { indicador, variable, nivel: '', comparar: true, sparkline: true }, meta)
const tendencia = (id, x, y, w, h, titulo, variable, agrupar = 'total', umbrales = true) =>
  tarjeta(id, 'tendencia', x, y, w, h, titulo, { variable, estadistico: 'promedio', agrupar, estilo: 'linea', comparar: true, umbrales })
const barras = (id, x, y, w, h, titulo, metrica, variable, por, meta) =>
  tarjeta(id, 'barras', x, y, w, h, titulo, { metrica, variable, por, orientacion: 'horizontal', orden: 'desc', limite: 10 }, meta)
const paginaConf = (id, nombre, tarjetas) => ({ id, nombre, tarjetas })
const conf = (periodo, paginas) => ({ esquema: 1, filtros: { periodo, variable: 'TEMP' }, paginas })

function plantillaEjecutivo() {
  return conf('30d', [
    paginaConf('p1', 'Resumen', [
      kpi('t1', 0, 0, 3, 'Cumplimiento', 'cumplimiento', 'filtro', META_CUMPLIMIENTO),
      kpi('t2', 3, 0, 2, 'Disponibilidad', 'disponibilidad', 'filtro', META_DISPONIBILIDAD),
      kpi('t3', 5, 0, 2, 'Alertas', 'alertas', 'filtro', META_ALERTAS),
      kpi('t4', 7, 0, 2, 'Tiempo de atención', 'tiempo_atencion', 'filtro', META_TIEMPO),
      kpi('t5', 9, 0, 3, 'Dispositivos en línea', 'dispositivos_en_linea'),
      tendencia('t6', 0, 1, 8, 3, 'Temperatura por área', 'TEMP', 'area'),
      tarjeta('t7', 'alertas_dona', 8, 1, 4, 3, 'Alertas por estado', { por: 'estado' }),
      barras('t8', 0, 4, 6, 2, 'Cumplimiento por área', 'cumplimiento', 'TEMP', 'area', META_CUMPLIMIENTO),
      tarjeta('t9', 'ranking', 6, 4, 6, 2, 'Dispositivos con menor cumplimiento', { metrica: 'cumplimiento', variable: 'TEMP', por: 'dispositivo', sentido: 'peores', n: 5 }),
    ]),
    paginaConf('p2', 'Tendencias', [
      tendencia('t10', 0, 0, 12, 2, 'Temperatura', 'TEMP'),
      tendencia('t11', 0, 2, 12, 2, 'Humedad', 'HUM'),
      tendencia('t12', 0, 4, 12, 2, 'Calidad del aire', 'AIRE'),
    ]),
  ])
}
function paginaVariable(id, nombre, prefijo, variable) {
  return paginaConf(id, nombre, [
    kpi(`${prefijo}1`, 0, 0, 3, 'Promedio', 'promedio', variable),
    kpi(`${prefijo}2`, 3, 0, 3, 'Mínimo', 'minimo', variable),
    kpi(`${prefijo}3`, 6, 0, 3, 'Máximo', 'maximo', variable),
    kpi(`${prefijo}4`, 9, 0, 3, 'Cumplimiento', 'cumplimiento', variable, META_CUMPLIMIENTO),
    tendencia(`${prefijo}5`, 0, 1, 8, 3, `${nombre} en el periodo`, variable),
    tarjeta(`${prefijo}6`, 'histograma', 8, 1, 4, 3, `Distribución de ${nombre.toLowerCase()}`, { variable }),
    tarjeta(`${prefijo}7`, 'mapa_calor', 0, 4, 6, 2, `${nombre} por hora y día`, { variable, estadistico: 'promedio', alertas: false }),
    tarjeta(`${prefijo}8`, 'matriz', 6, 4, 6, 2, 'Promedio por área y variable', { filas: 'area', valor: 'promedio' }),
  ])
}
function plantillaAmbiental() {
  return conf('7d', [
    paginaVariable('p1', 'Temperatura', 't', 'TEMP'),
    paginaVariable('p2', 'Humedad', 'h', 'HUM'),
    paginaVariable('p3', 'Calidad del aire', 'a', 'AIRE'),
    paginaConf('p4', 'Relación', [
      tarjeta('r1', 'dispersion', 0, 0, 8, 6, 'Temperatura y humedad', { x: 'TEMP', y: 'HUM' }),
      tarjeta('r2', 'texto', 8, 0, 4, 6, 'Cómo leer este tablero', { nota: 'Cada punto es el promedio de una hora de un dispositivo. Si la temperatura sube, la humedad suele bajar; los valores extremos ayudan a detectar fallas.' }),
    ]),
  ])
}
function plantillaAlertas() {
  return conf('30d', [
    paginaConf('p1', 'Alertas', [
      kpi('t1', 0, 0, 4, 'Alertas', 'alertas', 'filtro', META_ALERTAS),
      kpi('t2', 4, 0, 4, 'Alertas pendientes', 'alertas_pendientes'),
      kpi('t3', 8, 0, 4, 'Tiempo de atención', 'tiempo_atencion', 'filtro', META_TIEMPO),
      tarjeta('t4', 'barras_apiladas', 0, 1, 8, 3, 'Alertas por estado y día', { serie: 'alertas_estado', por: 'dia', porcentaje: false }),
      tarjeta('t5', 'alertas_dona', 8, 1, 4, 3, 'Alertas por nivel', { por: 'nivel' }),
      tarjeta('t6', 'tiempo_atencion', 0, 4, 4, 2, 'Tiempo de atención por área', { por: 'area' }, META_TIEMPO),
      tarjeta('t7', 'ranking', 4, 4, 4, 2, 'Dispositivos con más alertas', { metrica: 'alertas', variable: 'filtro', por: 'dispositivo', sentido: 'peores', n: 5 }),
      tarjeta('t8', 'mapa_calor', 8, 4, 4, 2, 'Alertas por hora y día', { variable: 'TEMP', estadistico: 'promedio', alertas: true }),
    ]),
  ])
}
function plantillaOperacion() {
  return conf('7d', [
    paginaConf('p1', 'Operación', [
      kpi('t1', 0, 0, 4, 'Dispositivos en línea', 'dispositivos_en_linea'),
      kpi('t2', 4, 0, 4, 'Disponibilidad', 'disponibilidad', 'filtro', META_DISPONIBILIDAD),
      kpi('t3', 8, 0, 4, 'Lecturas', 'lecturas'),
      tarjeta('t4', 'disponibilidad', 0, 1, 8, 5, 'Disponibilidad por dispositivo', { limite: 10, orden: 'asc' }, META_DISPONIBILIDAD),
      tarjeta('t5', 'medidor', 8, 1, 4, 2, 'Disponibilidad', { indicador: 'disponibilidad', variable: 'filtro' }, META_DISPONIBILIDAD),
      tarjeta('t6', 'barras_apiladas', 8, 3, 4, 3, 'Lecturas dentro de rango', { serie: 'lecturas_rango', por: 'dia', porcentaje: false }),
    ]),
  ])
}
function tableroOrganizacion() {
  return {
    num: 101,
    nombre: 'Operación de la organización',
    descripcion: 'Tablero de consulta de la organización, con hallazgos de Nico AI.',
    plantilla: '',
    predeterminado: true,
    activo: true,
    es_plantilla: false,
    version: 2,
    creado_por_nombre: 'Andrés Villalobos',
    fecha_creacion: '2026-11-20T18:00:00Z',
    conf: conf('7d', [
      paginaConf('p1', 'Resumen', [
        kpi('m1', 0, 0, 3, 'Cumplimiento', 'cumplimiento', 'filtro', META_CUMPLIMIENTO),
        kpi('m2', 3, 0, 3, 'Disponibilidad', 'disponibilidad', 'filtro', META_DISPONIBILIDAD),
        kpi('m3', 6, 0, 3, 'Alertas', 'alertas', 'filtro', META_ALERTAS),
        kpi('m4', 9, 0, 3, 'Tiempo de atención', 'tiempo_atencion', 'filtro', META_TIEMPO),
        tendencia('m5', 0, 1, 8, 3, 'Temperatura', 'TEMP'),
        tarjeta('m6', 'medidor', 8, 1, 4, 2, 'Cumplimiento', { indicador: 'cumplimiento', variable: 'TEMP' }, META_CUMPLIMIENTO),
        tarjeta('m7', 'barras', 0, 4, 6, 2, 'Cumplimiento por área', { metrica: 'cumplimiento', variable: 'filtro', por: 'area', orientacion: 'horizontal', orden: 'desc', limite: 8 }, META_CUMPLIMIENTO),
        tarjeta('m8', 'alertas_dona', 6, 4, 3, 2, 'Alertas por nivel', { por: 'nivel' }),
        tarjeta('m9', 'texto', 9, 4, 3, 2, 'Nota', { nota: 'Los datos se calculan en vivo con el alcance y los filtros elegidos.' }),
      ]),
      paginaConf('p2', 'Hallazgos', [
        tarjeta('h1', 'hallazgos', 0, 0, 8, 3, 'Hallazgos de Nico AI', {}),
        tarjeta('h2', 'texto', 8, 0, 4, 3, 'Cómo leer este tablero', { nota: 'Las tarjetas se recalculan al cambiar el periodo, las áreas, los dispositivos o la variable.' }),
        tarjeta('h3', 'histograma', 0, 3, 6, 3, 'Distribución de temperatura', { variable: 'TEMP' }),
        tarjeta('h4', 'dispersion', 6, 3, 6, 3, 'Temperatura y humedad', { x: 'TEMP', y: 'HUM' }),
      ]),
    ]),
  }
}

const PLANTILLAS = [
  ['EJECUTIVO', 'Ejecutivo', 'Vista general de cumplimiento, alertas y disponibilidad de la organización.', plantillaEjecutivo()],
  ['AMBIENTAL', 'Calidad ambiental', 'Temperatura, humedad y calidad del aire, con patrones y relación entre variables.', plantillaAmbiental()],
  ['ALERTAS', 'Alertas y respuesta', 'Alertas por estado, nivel y dispositivo, y tiempos de respuesta.', plantillaAlertas()],
  ['OPERACION', 'Disponibilidad y operación', 'Disponibilidad de los dispositivos y lecturas dentro de rango.', plantillaOperacion()],
]
const TABLEROS = [
  ...PLANTILLAS.map(([plantilla, nombre, descripcion, configuracion], i) => ({
    num: i + 1,
    nombre,
    descripcion,
    plantilla,
    predeterminado: false,
    activo: true,
    es_plantilla: true,
    version: 1,
    creado_por_nombre: 'Sistema',
    fecha_creacion: '2026-11-15T18:00:00Z',
    conf: configuracion,
  })),
  tableroOrganizacion(),
]

// Historial de versiones del mock, con la misma forma que el backend.
const HISTORIAL = new Map()
const USUARIO_DEMO = 'Andrés Villalobos'

function historialDe(t) {
  if (!HISTORIAL.has(t.num)) {
    const total = Math.max(1, Number(t.version) || 1)
    const entradas = [{ numero: total, fecha: t.fecha_creacion, creada_por_nombre: t.creado_por_nombre || USUARIO_DEMO, conf: copia(t.conf) }]
    for (let numero = total - 1; numero >= 1; numero -= 1) {
      entradas.push({ numero, fecha: t.fecha_creacion, creada_por_nombre: 'Sistema', conf: copia(t.conf) })
    }
    HISTORIAL.set(t.num, entradas)
  }
  return HISTORIAL.get(t.num)
}

function agregarVersion(t, configuracion) {
  const historial = historialDe(t)
  const numero = Math.max(...historial.map((v) => v.numero)) + 1
  historial.push({ numero, fecha: iso(new Date()), creada_por_nombre: USUARIO_DEMO, conf: copia(configuracion) })
  t.version = numero
}

function nombreLibre(base) {
  const usados = new Set(TABLEROS.map((t) => t.nombre))
  if (!usados.has(base)) return base
  let numero = 2
  while (true) {
    const sufijo = ` (${numero})`
    const candidato = `${base.slice(0, 80 - sufijo.length)}${sufijo}`
    if (!usados.has(candidato)) return candidato
    numero += 1
  }
}

export async function tableros() {
  await esperar()
  return pagina(copia(TABLEROS.filter((t) => t.activo)))
}

export async function versionesTablero(num) {
  await esperar()
  const t = TABLEROS.find((item) => item.num === Number(num))
  if (!t) throw new ApiError('Tablero no encontrado.', 404)
  return historialDe(t).slice().reverse().map(({ numero, fecha, creada_por_nombre }) => ({ numero, fecha, creada_por_nombre }))
}

export async function crearTablero({ nombre, desde } = {}) {
  await esperar()
  const origen = TABLEROS.find((t) => t.num === Number(desde))
  const base = origen?.conf || conf('7d', [paginaConf('p1', 'Página 1', [])])
  const nuevo = {
    num: Math.max(...TABLEROS.map((t) => t.num)) + 1,
    nombre: String(nombre || (origen ? `Copia de ${origen.nombre}` : 'Tablero sin nombre')).slice(0, 80),
    descripcion: origen?.descripcion || '',
    plantilla: '',
    predeterminado: false,
    activo: true,
    es_plantilla: false,
    version: 1,
    creado_por_nombre: USUARIO_DEMO,
    fecha_creacion: iso(new Date()),
    conf: copia(base),
  }
  nuevo.nombre = nombreLibre(nuevo.nombre)
  TABLEROS.push(nuevo)
  HISTORIAL.set(nuevo.num, [{ numero: 1, fecha: nuevo.fecha_creacion, creada_por_nombre: USUARIO_DEMO, conf: copia(base) }])
  return copia(nuevo)
}

export async function actualizarTablero(num, cambios = {}) {
  await esperar()
  const t = TABLEROS.find((item) => item.num === Number(num))
  if (!t) throw new ApiError('Tablero no encontrado.', 404)
  if (t.es_plantilla) throw new ApiError('Las plantillas no se editan; duplícalas para cambiarlas.', 403)
  if (cambios.nombre != null) {
    const nombre = String(cambios.nombre).trim().slice(0, 80)
    if (!nombre) throw new ApiError('El tablero necesita un nombre.', 400)
    if (TABLEROS.some((item) => item.num !== t.num && item.activo && item.nombre === nombre)) throw new ApiError('Ya existe un tablero activo con ese nombre.', 400)
    t.nombre = nombre
  }
  if (cambios.descripcion != null) t.descripcion = String(cambios.descripcion || '').slice(0, 200)
  if (cambios.conf != null) {
    agregarVersion(t, cambios.conf)
    t.conf = copia(cambios.conf)
  }
  return copia(t)
}

export async function eliminarTablero(num) {
  await esperar()
  const t = TABLEROS.find((item) => item.num === Number(num))
  if (!t) throw new ApiError('Tablero no encontrado.', 404)
  if (t.es_plantilla) throw new ApiError('Las plantillas no se archivan.', 403)
  t.activo = false
  t.predeterminado = false
  return null
}

export async function predeterminarTablero(num) {
  await esperar()
  const t = TABLEROS.find((item) => item.num === Number(num))
  if (!t) throw new ApiError('Tablero no encontrado.', 404)
  if (t.es_plantilla) throw new ApiError('Las plantillas no pueden ser predeterminadas.', 403)
  TABLEROS.filter((item) => item.organizacion && item.organizacion === t.organizacion).forEach((item) => { item.predeterminado = false })
  TABLEROS.forEach((item) => { if (!item.es_plantilla) item.predeterminado = false })
  t.predeterminado = true
  return copia(t)
}

export async function restaurarTablero(num, numero) {
  await esperar()
  const t = TABLEROS.find((item) => item.num === Number(num))
  if (!t) throw new ApiError('Tablero no encontrado.', 404)
  if (t.es_plantilla) throw new ApiError('Las plantillas no se restauran.', 403)
  const version = historialDe(t).find((v) => v.numero === Number(numero))
  if (!version) throw new ApiError('La versión del tablero no existe.', 404)
  agregarVersion(t, version.conf)
  t.conf = copia(version.conf)
  return copia(t)
}

function rangoPeriodo(filtros = {}) {
  const ahora = new Date()
  let inicio
  let fin = ahora
  const tipo = filtros.periodo || 'hoy'
  if (tipo === 'hoy') {
    inicio = new Date(ahora)
    inicio.setHours(0, 0, 0, 0)
  } else if (tipo === '24h') inicio = new Date(ahora.getTime() - DIA)
  else if (tipo === '7d') inicio = new Date(ahora.getTime() - 7 * DIA)
  else if (tipo === '30d') inicio = new Date(ahora.getTime() - 30 * DIA)
  else if (tipo === '90d') inicio = new Date(ahora.getTime() - 90 * DIA)
  else if (tipo === 'mes') inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  else if (tipo === 'mes_anterior') {
    inicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    fin = new Date(ahora.getFullYear(), ahora.getMonth(), Math.min(ahora.getDate(), 28))
  } else {
    const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`) : new Date(ahora.getTime() - 7 * DIA)
    const hasta = filtros.hasta ? new Date(`${filtros.hasta}T00:00:00`) : ahora
    inicio = desde
    fin = filtros.hasta ? new Date(hasta.getTime() + DIA) : hasta
  }
  const duracion = Math.max(HORA, fin - inicio)
  const previoInicio = new Date(inicio.getTime() - duracion)
  const previoFin = new Date(inicio)
  const horas = duracion / HORA
  const intervalo = horas <= 48 ? '15m' : horas <= 336 ? '1h' : horas <= 2208 ? '1d' : '1sem'
  return { inicio, fin, previoInicio, previoFin, intervalo, duracion }
}
const iso = (d) => d.toISOString()
const format = (n, d = 0) => Number(Number(n).toFixed(d))
const infoVariable = (v) => INFO[v] || INFO.TEMP
const areasVisibles = (filtros, cruzado, tarjeta) => {
  let areas = db.areas
  if (filtros.areas?.length) areas = areas.filter((a) => filtros.areas.includes(a.num))
  if (cruzado?.dimension === 'area' && cruzado.origen !== tarjeta.id) {
    areas = areas.filter((a) => String(a.num) === String(cruzado.valor))
  }
  return areas
}
const dispositivosVisibles = (filtros, cruzado, tarjeta) => {
  let dispositivos = db.dispositivos
  if (filtros.areas?.length) dispositivos = dispositivos.filter((d) => filtros.areas.includes(d.area))
  if (filtros.dispositivos?.length) dispositivos = dispositivos.filter((d) => filtros.dispositivos.includes(d.num))
  if (cruzado?.origen !== tarjeta.id && cruzado?.dimension === 'area') {
    dispositivos = dispositivos.filter((d) => String(d.area) === String(cruzado.valor))
  }
  if (cruzado?.origen !== tarjeta.id && cruzado?.dimension === 'dispositivo') {
    dispositivos = dispositivos.filter((d) => String(d.num) === String(cruzado.valor))
  }
  return dispositivos
}
const variableDe = (tarjeta, filtros) => {
  const elegida = tarjeta.opciones?.variable
  if (elegida && elegida !== 'filtro') return elegida
  return filtros.variable || 'TEMP'
}
const cruzadoActivo = (tarjeta, cruzado) => Boolean(cruzado && cruzado.origen !== tarjeta.id)
const factorCruzado = (tarjeta, cruzado) => (cruzadoActivo(tarjeta, cruzado) ? 0.82 : 1)
const textoMeta = (meta, unidad, decimales) => {
  if (!meta) return null
  const valor = Number(meta.valor)
  const numero = Number.isInteger(valor) ? valor : format(valor, decimales)
  return `Meta ${meta.sentido === 'menor' ? '≤' : '≥'} ${numero}${unidad ? ` ${unidad}` : ''}`
}
const metaCard = (tarjeta, valor, unidad, decimales) => {
  if (!tarjeta.meta) return { meta: null, meta_estado: null }
  const meta = { ...tarjeta.meta, texto: textoMeta(tarjeta.meta, unidad, decimales) }
  let estado = null
  if (valor != null) {
    const margen = Number(meta.tolerancia) / 100
    if (meta.sentido === 'mayor') estado = valor >= meta.valor ? 'cumple' : valor >= meta.valor * (1 - margen) ? 'cerca' : 'lejos'
    else estado = valor <= meta.valor ? 'cumple' : valor <= meta.valor * (1 + margen) ? 'cerca' : 'lejos'
  }
  return { meta, meta_estado: estado }
}
const variacion = (actual, previo, sentido, unidad) => {
  if (actual == null || previo == null) return null
  const diferencia = actual - previo
  const pct = previo ? diferencia / previo * 100 : null
  return {
    pct: pct == null ? null : format(pct, 2),
    abs: format(diferencia, 2),
    unidad: unidad === '%' ? 'pts' : unidad,
    sentido: Math.abs(diferencia) < 0.005 ? 'igual' : diferencia > 0 ? 'sube' : 'baja',
    mejora: Math.abs(diferencia) < 0.005 ? null : sentido === 'menor' ? diferencia < 0 : diferencia > 0,
  }
}
function puntosSerie(cantidad, inicio, fin, base, amplitud, variable, dispositivo = 0) {
  const paso = Math.max(1, Math.floor(cantidad))
  return Array.from({ length: paso }, (_, i) => {
    const t = new Date(inicio.getTime() + (fin - inicio) * (i / Math.max(1, paso - 1)))
    const valor = base + Math.sin((i + dispositivo) / 2.1) * amplitud + Math.cos(i / 3.3) * amplitud * 0.3
    return { x: iso(t), y: format(Math.max(0, valor), infoVariable(variable).decimales) }
  })
}
function datosKpi(tarjeta, contexto, filtros) {
  const indicador = tarjeta.opciones?.indicador || 'promedio'
  const variable = variableDe(tarjeta, filtros)
  const info = infoVariable(variable)
  let valor = 74.8
  let unidad = '%'
  let decimales = 1
  let sentido = 'mayor'
  if (['promedio', 'minimo', 'maximo'].includes(indicador)) {
    const bases = variable === 'HUM' ? { promedio: 55.2, minimo: 42.4, maximo: 68.1 } : variable === 'AIRE' ? { promedio: 742, minimo: 480, maximo: 980 } : { promedio: 23.4, minimo: 18.2, maximo: 28.6 }
    valor = bases[indicador] ?? 23.4
    unidad = info.unidad
    decimales = info.decimales
  } else if (indicador === 'lecturas') {
    valor = 12480
    unidad = ''
    decimales = 0
  } else if (indicador === 'disponibilidad') valor = 97.8
  else if (indicador === 'alertas') {
    valor = 7
    unidad = ''
    decimales = 0
    sentido = 'menor'
  } else if (indicador === 'alertas_pendientes') {
    valor = 2
    unidad = ''
    decimales = 0
    sentido = 'menor'
  } else if (indicador === 'tiempo_atencion') {
    valor = 18
    unidad = 'min'
    decimales = 0
    sentido = 'menor'
  } else if (indicador === 'dispositivos_en_linea') {
    valor = 10
    unidad = ''
    decimales = 0
  } else if (indicador === 'cumplimiento' || indicador === 'disponibilidad') {
    valor = {
      TEMP: 94.2,
      HUM: 96.8,
      AIRE: 88.4,
    }[variable] ?? 94.2
  }
  valor = format(valor * factorCruzado(tarjeta, contexto.cruzado), decimales)
  const previo = format(valor * 0.972, decimales)
  const { meta, meta_estado } = metaCard(tarjeta, valor, unidad, decimales)
  return {
    indicador,
    variable: ['promedio', 'minimo', 'maximo', 'cumplimiento'].includes(indicador) ? variable : null,
    valor,
    unidad,
    decimales,
    previo,
    variacion: variacion(valor, previo, sentido, unidad),
    meta,
    meta_estado,
    sparkline: tarjeta.opciones?.sparkline === false ? null : puntosSerie(12, contexto.periodo.inicio, contexto.periodo.fin, valor * 0.96, valor * 0.04, variable).map((p) => ({ x: p.x, y: p.y })),
    sin_datos: false,
  }
}
function datosTendencia(tarjeta, contexto, filtros) {
  const variable = variableDe(tarjeta, filtros)
  const info = infoVariable(variable)
  const dispositivos = dispositivosVisibles(filtros, contexto.cruzado, tarjeta)
  const areas = areasVisibles(filtros, contexto.cruzado, tarjeta)
  const agrupar = tarjeta.opciones?.agrupar || 'total'
  let grupos = [{ nombre: 'Total', dimension: null, dimension_valor: null }]
  if (agrupar === 'area') grupos = areas.map((a) => ({ nombre: a.nombre, dimension: 'area', dimension_valor: a.num }))
  if (agrupar === 'dispositivo') grupos = dispositivos.map((d) => ({ nombre: d.nombre, dimension: 'dispositivo', dimension_valor: d.num }))
  const series = grupos.slice(0, 6).map((g, i) => ({
    ...g,
    puntos: puntosSerie(12, contexto.periodo.inicio, contexto.periodo.fin, 22 + i * 1.5, 2.8, variable, i),
  }))
  const previo = puntosSerie(12, contexto.periodo.inicio, contexto.periodo.fin, 21.4, 2.4, variable).map((p) => ({ x: p.x, y: p.y }))
  let umbrales = null
  let nota = null
  if (tarjeta.opciones?.umbrales) {
    if (dispositivos.length !== 1) nota = 'Las bandas de umbral se muestran al filtrar un dispositivo.'
    else umbrales = { advertencia_min: 18, advertencia_max: 26, peligro_min: 15, peligro_max: 30 }
  }
  return {
    variable,
    unidad: info.unidad,
    decimales: info.decimales,
    estadistico: tarjeta.opciones?.estadistico || 'promedio',
    agrupar,
    estilo: tarjeta.opciones?.estilo || 'linea',
    intervalo: contexto.intervalo,
    series,
    previo,
    umbrales,
    nota_umbrales: nota,
    sin_datos: !series.length,
  }
}
function datosMedidor(tarjeta, contexto, filtros) {
  const valor = format((tarjeta.opciones?.indicador === 'disponibilidad' ? 97.8 : 94.2) * factorCruzado(tarjeta, contexto.cruzado), 1)
  const { meta, meta_estado } = metaCard(tarjeta, valor, '%', 1)
  return { indicador: tarjeta.opciones?.indicador || 'cumplimiento', variable: variableDe(tarjeta, filtros), valor, unidad: '%', decimales: 1, min: 0, max: 100, previo: format(valor * 0.97, 1), variacion: variacion(valor, valor * 0.97, 'mayor', '%'), meta, meta_estado, sin_datos: false }
}
function datosBarras(tarjeta, contexto, filtros) {
  const por = tarjeta.opciones?.por || 'area'
  const variable = variableDe(tarjeta, filtros)
  const base = por === 'variable' ? VARIABLES.map((v) => ({ etiqueta: infoVariable(v).nombre, dimension: 'variable', dimension_valor: v })) : por === 'dispositivo' ? dispositivosVisibles(filtros, contexto.cruzado, tarjeta).map((d) => ({ etiqueta: d.nombre, dimension: 'dispositivo', dimension_valor: d.num })) : areasVisibles(filtros, contexto.cruzado, tarjeta).map((a) => ({ etiqueta: a.nombre, dimension: 'area', dimension_valor: a.num }))
  const filas = base.slice(0, tarjeta.opciones?.limite || 10).map((fila, i) => ({
    ...fila,
    valor: format((88 + (i % 5) * 2.4 + (por === 'variable' ? 3 : 0)) * factorCruzado(tarjeta, contexto.cruzado), 1),
    previo: format(86 + i * 2, 1),
    variacion: variacion(88 + i * 2.4, 86 + i * 2, 'mayor', '%'),
  }))
  if (tarjeta.opciones?.orden === 'nombre') filas.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  else if (tarjeta.opciones?.orden === 'asc') filas.sort((a, b) => a.valor - b.valor)
  else filas.sort((a, b) => b.valor - a.valor)
  return { metrica: tarjeta.opciones?.metrica || 'cumplimiento', por, variable, orientacion: tarjeta.opciones?.orientacion || 'vertical', unidad: '%', decimales: 1, barras: filas, meta: tarjeta.meta ? { ...tarjeta.meta, texto: textoMeta(tarjeta.meta, '%', 1) } : null, sin_datos: !filas.length }
}
function datosRanking(tarjeta, contexto, filtros) {
  const por = tarjeta.opciones?.por || 'dispositivo'
  const variable = variableDe(tarjeta, filtros)
  const filas = (por === 'area' ? areasVisibles(filtros, contexto.cruzado, tarjeta).map((a) => ({ etiqueta: a.nombre, dimension: 'area', dimension_valor: a.num })) : dispositivosVisibles(filtros, contexto.cruzado, tarjeta).map((d) => ({ etiqueta: d.nombre, dimension: 'dispositivo', dimension_valor: d.num }))).slice(0, tarjeta.opciones?.n || 5).map((fila, i) => ({
    ...fila,
    valor: format(98 - i * 2.1 - (por === 'dispositivo' ? 0.4 : 0), 1),
    previo: format(99 - i * 2, 1),
    variacion: variacion(98 - i * 2.1, 99 - i * 2, 'mayor', '%'),
  }))
  const metrica = tarjeta.opciones?.metrica || 'cumplimiento'
  const sentido = tarjeta.opciones?.sentido || 'peores'
  // Para cumplimiento/disponibilidad/lecturas, más es mejor; alertas y tiempo de atención, menos.
  const masEsMejor = !['alertas', 'tiempo_atencion'].includes(metrica)
  filas.sort((a, b) => {
    if (sentido === 'mejores') return masEsMejor ? b.valor - a.valor : a.valor - b.valor
    return masEsMejor ? a.valor - b.valor : b.valor - a.valor
  })
  return { metrica, por, variable, sentido, unidad: '%', decimales: 1, filas, maximo: filas.length ? Math.max(...filas.map((f) => f.valor)) : null, sin_datos: !filas.length }
}
function datosApiladas(tarjeta, contexto, filtros) {
  const por = tarjeta.opciones?.por || 'area'
  const estados = tarjeta.opciones?.serie === 'lecturas_rango' ? [['Dentro', 'success'], ['Advertencia', 'warning'], ['Peligro', 'danger']] : [['Pendiente', 'warning'], ['Atendida', 'success'], ['Descartada', 'neutral']]
  const categorias = por === 'dia' || por === 'semana' ? Array.from({ length: 6 }, (_, i) => ({ etiqueta: `${i + 1} nov`, dimension: null, dimension_valor: null })) : por === 'dispositivo' ? dispositivosVisibles(filtros, contexto.cruzado, tarjeta).slice(0, 5).map((d) => ({ etiqueta: d.nombre, dimension: 'dispositivo', dimension_valor: d.num })) : areasVisibles(filtros, contexto.cruzado, tarjeta).map((a) => ({ etiqueta: a.nombre, dimension: 'area', dimension_valor: a.num }))
  const series = estados.map(([nombre, tono], i) => ({ nombre, tono, dimension: tarjeta.opciones?.serie === 'alertas_nivel' ? 'nivel' : null, dimension_valor: null, valores: categorias.map((_, j) => Math.round(30 + i * 12 + j * 5)) }))
  if (tarjeta.opciones?.porcentaje) {
    categorias.forEach((_, j) => {
      const total = series.reduce((s, serie) => s + serie.valores[j], 0) || 1
      series.forEach((serie) => { serie.valores[j] = format(serie.valores[j] / total * 100, 1) })
    })
  }
  return { serie: tarjeta.opciones?.serie || 'alertas_estado', por, porcentaje: Boolean(tarjeta.opciones?.porcentaje), unidad: tarjeta.opciones?.porcentaje ? '%' : '', decimales: 1, categorias, series, sin_datos: !categorias.length }
}
function datosMatriz(tarjeta, contexto, filtros) {
  const filas = (tarjeta.opciones?.filas === 'dispositivo' ? dispositivosVisibles(filtros, contexto.cruzado, tarjeta).map((d) => ({ id: d.num, etiqueta: d.nombre, dimension: 'dispositivo', dimension_valor: d.num })) : areasVisibles(filtros, contexto.cruzado, tarjeta).map((a) => ({ id: a.num, etiqueta: a.nombre, dimension: 'area', dimension_valor: a.num }))).map((fila, i) => ({
    ...fila,
    celdas: VARIABLES.map((variable, j) => ({ variable, valor: format(88 + i * 2 + j * 2.2, 1), dimension: 'variable', dimension_valor: variable, nivel: 88 + i * 2 + j * 2.2 >= 95 ? 'cumple' : 88 + i * 2 + j * 2.2 >= 90 ? 'cerca' : 'lejos' })),
  }))
  const semaforo = tarjeta.opciones?.valor === 'cumplimiento'
  return { filas, columnas: VARIABLES.map((v) => ({ codigo: v, nombre: infoVariable(v).nombre, unidad: semaforo ? '%' : infoVariable(v).unidad, decimales: semaforo ? 1 : infoVariable(v).decimales })), semaforo, escala: { min: 15, max: 30 }, sin_datos: false }
}
function datosMapa(tarjeta, contexto, filtros) {
  const variable = variableDe(tarjeta, filtros)
  const alertas = Boolean(tarjeta.opciones?.alertas)
  const valores = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => alertas ? (h + d) % 4 : format(22 + Math.sin((h + d * 3) / 3) * 5, 1)))
  const numeros = valores.flat().filter((v) => v != null)
  return { variable: alertas ? null : variable, alertas, dias: DIAS, horas: Array.from({ length: 24 }, (_, i) => i), valores, min: Math.min(...numeros), max: Math.max(...numeros), unidad: alertas ? '' : infoVariable(variable).unidad, decimales: alertas ? 0 : infoVariable(variable).decimales, sin_datos: false }
}
function datosDispersion(tarjeta, contexto, filtros) {
  const puntos = dispositivosVisibles(filtros, contexto.cruzado, tarjeta).flatMap((d, i) => Array.from({ length: 6 }, (_, h) => ({ x: format(19 + i * 0.7 + Math.sin(h + i) * 2, 1), y: format(50 + i * 3 + Math.cos(h + i) * 8, 1), etiqueta: `${d.nombre} · ${h + 8}:00`, dispositivo: d.nombre, area: db.areas.find((a) => a.num === d.area)?.nombre || '', area_num: d.area, dimension: 'area', dimension_valor: d.area })))
  return { x: 'TEMP', y: 'HUM', info_x: infoVariable('TEMP'), info_y: infoVariable('HUM'), puntos, max_puntos: 2000, truncado: false, sin_datos: !puntos.length }
}
function datosHistograma(tarjeta, contexto, filtros) {
  const variable = variableDe(tarjeta, filtros)
  const info = infoVariable(variable)
  const bases = Array.from({ length: 15 }, (_, i) => ({ desde: 15 + i * 0.9, hasta: 15 + (i + 1) * 0.9, valor: Math.round(80 - Math.abs(i - 7) * 9 + Math.sin(i) * 12) }))
  const total = bases.reduce((s, c) => s + c.valor, 0)
  return { variable, unidad: info.unidad, decimales: info.decimales, cubetas: bases, total, umbrales: dispositivosVisibles(filtros, contexto.cruzado, tarjeta).length === 1 ? { advertencia_min: 18, advertencia_max: 26, peligro_min: 15, peligro_max: 30 } : null, nota_umbrales: dispositivosVisibles(filtros, contexto.cruzado, tarjeta).length === 1 ? null : 'Los umbrales se muestran al filtrar un dispositivo.', sin_datos: !total }
}
function datosDona(tarjeta) {
  const por = tarjeta.opciones?.por || 'estado'
  const claves = por === 'nivel' ? [['ADVERTENCIA', 'Advertencia'], ['PELIGRO', 'Peligro']] : por === 'variable' ? VARIABLES.map((v) => [v, infoVariable(v).nombre]) : [['PENDIENTE', 'Pendiente'], ['ATENDIDA', 'Atendida'], ['DESCARTADA', 'Descartada']]
  const valores = [4, 3, 2]
  const total = valores.reduce((s, v) => s + v, 0)
  return { por, total, sectores: claves.map(([clave, etiqueta], i) => ({ etiqueta, valor: valores[i] || 1, porcentaje: format((valores[i] || 1) / total * 100, 1), dimension: por === 'variable' ? 'variable' : por, dimension_valor: clave })), unidad: '', decimales: 0, sin_datos: false }
}
function datosAtencion(tarjeta, contexto, filtros) {
  const valor = 18
  const { meta, meta_estado } = metaCard(tarjeta, valor, 'min', 0)
  return { por: tarjeta.opciones?.por || 'area', promedio: valor, total: 24, atendidas: 19, grupos: areasVisibles(filtros, contexto.cruzado, tarjeta).slice(0, 5).map((a, i) => ({ etiqueta: a.nombre, valor: 12 + i * 5, total: 8, atendidas: 6, dimension: 'area', dimension_valor: a.num })), unidad: 'min', decimales: 0, previo: 21, variacion: variacion(valor, 21, 'menor', 'min'), meta, meta_estado, sin_datos: false }
}
function datosDisponibilidad(tarjeta, contexto, filtros) {
  const filas = dispositivosVisibles(filtros, contexto.cruzado, tarjeta).slice(0, tarjeta.opciones?.limite || 10).map((d, i) => ({ etiqueta: d.nombre, valor: format(92 + (i % 5) * 1.2, 1), recibidas: 1440 - i * 12, esperadas: 1440, huecos: i % 3 === 0 ? [{ inicio: iso(new Date(contexto.periodo.inicio.getTime() + i * HORA)), minutos: 20 + i * 4 }] : [], dimension: 'dispositivo', dimension_valor: d.num }))
  const promedio = format(filas.reduce((s, f) => s + f.valor, 0) / (filas.length || 1), 1)
  const { meta, meta_estado } = metaCard(tarjeta, promedio, '%', 1)
  return { promedio, filas, limite: tarjeta.opciones?.limite || 10, orden: tarjeta.opciones?.orden || 'asc', unidad: '%', decimales: 1, previo: 96.8, variacion: variacion(promedio, 96.8, 'mayor', '%'), meta, meta_estado, sin_datos: !filas.length }
}
function datosTarjeta(tarjeta, contexto, filtros) {
  let extra
  if (tarjeta.tipo === 'kpi') extra = datosKpi(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'tendencia') extra = datosTendencia(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'medidor') extra = datosMedidor(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'barras') extra = datosBarras(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'barras_apiladas') extra = datosApiladas(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'ranking') extra = datosRanking(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'matriz') extra = datosMatriz(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'mapa_calor') extra = datosMapa(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'dispersion') extra = datosDispersion(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'histograma') extra = datosHistograma(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'alertas_dona') extra = datosDona(tarjeta)
  else if (tarjeta.tipo === 'tiempo_atencion') extra = datosAtencion(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'disponibilidad') extra = datosDisponibilidad(tarjeta, contexto, filtros)
  else if (tarjeta.tipo === 'texto') extra = { nota: tarjeta.opciones?.nota || '', sin_datos: false }
  else extra = { bajo_demanda: true, sin_datos: false }
  return { tipo: tarjeta.tipo, titulo: tarjeta.titulo, ...extra }
}

export async function consulta({ tarjetas = [], filtros = {}, cruzado = null }, { signal } = {}) {
  await esperar(signal)
  const periodo = rangoPeriodo(filtros)
  const contexto = { periodo, intervalo: periodo.intervalo, cruzado }
  return {
    generado: iso(new Date()),
    periodo: { inicio: iso(periodo.inicio), fin: iso(periodo.fin) },
    previo: { inicio: iso(periodo.previoInicio), fin: iso(periodo.previoFin) },
    intervalo: periodo.intervalo,
    tarjetas: Object.fromEntries(tarjetas.map((tarjeta) => [tarjeta.id, datosTarjeta(tarjeta, contexto, filtros)])),
  }
}

const slug = (texto) => String(texto || 'tarjeta').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function csvDatos(tarjeta, datos) {
  if (datos.tipo === 'tendencia') {
    const filas = [['Serie', 'Fecha', 'Valor']]
    datos.series.forEach((s) => s.puntos.forEach((p) => filas.push([s.nombre, p.x, p.y])))
    return filas
  }
  if (datos.tipo === 'barras' || datos.tipo === 'ranking') {
    return [['Categoría', 'Valor', 'Unidad', 'Periodo anterior', 'Variación %'], ...(datos.barras || datos.filas).map((f) => [f.etiqueta, f.valor, datos.unidad, f.previo, f.variacion?.pct])]
  }
  if (datos.tipo === 'barras_apiladas') {
    return [['Categoría', 'Serie', 'Valor'], ...datos.categorias.flatMap((c, i) => datos.series.map((s) => [c.etiqueta, s.nombre, s.valores[i]]))]
  }
  if (datos.tipo === 'matriz') {
    return [['Fila', 'Variable', 'Valor'], ...datos.filas.flatMap((f) => f.celdas.map((c) => [f.etiqueta, c.variable, c.valor]))]
  }
  if (datos.tipo === 'mapa_calor') {
    return [['Día', 'Hora', 'Valor'], ...datos.valores.flatMap((fila, d) => fila.map((v, h) => [datos.dias[d], h, v]))]
  }
  if (datos.tipo === 'dispersion') {
    return [['Dispositivo', 'Área', 'Fecha', 'X', 'Y'], ...datos.puntos.map((p) => [p.dispositivo, p.area, p.etiqueta, p.x, p.y])]
  }
  if (datos.tipo === 'histograma') {
    return [['Desde', 'Hasta', 'Cantidad'], ...datos.cubetas.map((c) => [c.desde, c.hasta, c.valor])]
  }
  if (datos.tipo === 'alertas_dona') {
    return [['Categoría', 'Valor', 'Porcentaje'], ...datos.sectores.map((s) => [s.etiqueta, s.valor, s.porcentaje])]
  }
  if (datos.tipo === 'tiempo_atencion') {
    return [['Grupo', 'Promedio (min)', 'Total', 'Atendidas'], ...(datos.grupos || []).map((g) => [g.etiqueta, g.valor, g.total, g.atendidas])]
  }
  if (datos.tipo === 'disponibilidad') {
    return [['Dispositivo', 'Disponibilidad (%)', 'Recibidas', 'Esperadas', 'Huecos'], ...datos.filas.map((f) => [f.etiqueta, f.valor, f.recibidas, f.esperadas, f.huecos.length])]
  }
  if (datos.tipo === 'texto') return [['Nota'], [datos.nota]]
  return [['Métrica', 'Valor', 'Unidad', 'Periodo anterior', 'Variación', 'Variación %', 'Meta', 'Estado de la meta'], [tarjeta.titulo, datos.valor, datos.unidad, datos.previo, datos.variacion?.abs, datos.variacion?.pct, datos.meta?.valor, datos.meta_estado]]
}
export function csvTarjeta({ tarjeta, filtros = {}, cruzado = null }) {
  const periodo = rangoPeriodo(filtros)
  const datos = datosTarjeta(tarjeta, { periodo, intervalo: periodo.intervalo, cruzado }, filtros)
  if (tarjeta.tipo === 'hallazgos') throw new ApiError('La tarjeta de hallazgos no tiene CSV.', 400)
  const filas = csvDatos(tarjeta, datos)
  const contenido = '\ufeff' + filas.map((fila) => fila.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
  return { contenido, nombre: `analitica_${slug(tarjeta.titulo)}_${iso(periodo.inicio).slice(0, 10).replaceAll('-', '')}_${iso(periodo.fin).slice(0, 10).replaceAll('-', '')}.csv` }
}
export async function hallazgos() {
  await esperar()
  return {
    hallazgos: [
      'El cumplimiento se mantiene cerca de la meta en la página.',
      'Las alertas pendientes se concentran en el turno de la tarde.',
      'La disponibilidad baja en los equipos con más huecos del periodo.',
    ],
    origen: 'local',
    generado: iso(new Date()),
  }
}
