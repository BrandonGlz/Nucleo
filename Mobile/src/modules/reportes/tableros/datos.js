// Textos, íconos y ayudas de las tarjetas de Analítica en la app. Los nombres de los tipos y los
// íconos son los mismos de FrontEnd/src/features/analitica/catalogo.js (ICONOS_TIPO).
import { fechaCorta, hora } from '../../../utils/formato'

export const PERIODOS = [
  ['hoy', 'Hoy'],
  ['24h', 'Últimas 24 h'],
  ['7d', '7 días'],
  ['30d', '30 días'],
  ['mes', 'Este mes'],
  ['mes_anterior', 'Mes anterior'],
  ['90d', '90 días'],
  ['personalizado', 'Personalizado'],
]

export const VARIABLES = [
  ['', 'Todas'],
  ['TEMP', 'Temperatura'],
  ['HUM', 'Humedad'],
  ['AIRE', 'Calidad del aire'],
]

export const ICONOS_TIPO = {
  kpi: 'activity',
  tendencia: 'chart-spline',
  medidor: 'gauge',
  barras: 'chart-bar',
  barras_apiladas: 'chart-column-stacked',
  ranking: 'list-ordered',
  matriz: 'grid-3x3',
  mapa_calor: 'flame',
  dispersion: 'chart-scatter',
  histograma: 'chart-column',
  alertas_dona: 'chart-pie',
  tiempo_atencion: 'timer',
  disponibilidad: 'signal',
  texto: 'type',
  hallazgos: 'sparkles',
}

export const NOMBRES_TIPO = {
  kpi: 'KPI',
  tendencia: 'Tendencia',
  medidor: 'Medidor',
  barras: 'Barras',
  barras_apiladas: 'Barras apiladas',
  ranking: 'Ranking',
  matriz: 'Matriz',
  mapa_calor: 'Mapa de calor',
  dispersion: 'Dispersión',
  histograma: 'Histograma',
  alertas_dona: 'Dona de alertas',
  tiempo_atencion: 'Tiempo de atención',
  disponibilidad: 'Disponibilidad',
  texto: 'Texto',
  hallazgos: 'Hallazgos de Nico AI',
}

export const INFO_VARIABLE = {
  TEMP: { nombre: 'Temperatura', unidad: '°C', decimales: 1 },
  HUM: { nombre: 'Humedad relativa', unidad: '%HR', decimales: 1 },
  AIRE: { nombre: 'Calidad del aire', unidad: 'ppm', decimales: 0 },
}

export const NOMBRE_VARIABLE = Object.fromEntries(VARIABLES)

// Estados → tono del sistema (los mismos de la web y de utils/convertir).
export const TONOS_ESTADO = {
  PENDIENTE: 'warning',
  ATENDIDA: 'success',
  DESCARTADA: 'neutral',
  ADVERTENCIA: 'warning',
  PELIGRO: 'danger',
  DENTRO: 'success',
  Dentro: 'success',
  Advertencia: 'warning',
  Peligro: 'danger',
  Atendida: 'success',
  Pendiente: 'warning',
  Descartada: 'neutral',
  POR_ENCIMA: 'danger',
  POR_DEBAJO: 'warning',
}
export const tonoDe = (valor) => TONOS_ESTADO[valor] || null

// Rellenos de estado con los tokens de gráfica de la web (--chart-ok/warn/danger).
export const colorTono = (c, tono) =>
  ({ success: c.chartOk, warning: c.chartWarn, danger: c.chartDanger, neutral: c.textMuted })[tono] || c.chartLine

export const colorSerie = (c, i) => c.chartSeries[i % c.chartSeries.length]

export const semaforoDe = (estado) =>
  estado === 'cumple' ? 'success' : estado === 'cerca' ? 'warning' : estado === 'lejos' ? 'danger' : null

export const esSeleccion = (seleccion, dimension, valor) =>
  Boolean(seleccion && dimension && seleccion.dimension === dimension && String(seleccion.valor) === String(valor))

export const atenuado = (seleccion, dimension, valor) => (seleccion && !esSeleccion(seleccion, dimension, valor) ? 0.35 : 1)

// Valor de un punto de la serie para la etiqueta del eje según el intervalo de la consulta.
export const etiquetaPunto = (iso, intervalo) => {
  if (!iso) return ''
  return intervalo === '1d' || intervalo === '1sem' ? fechaCorta(iso) : hora(iso)
}

export const formatear = (valor, decimales = 1) => {
  if (valor == null || !Number.isFinite(Number(valor))) return '—'
  const d = Number(decimales) || 0
  return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, ' ')
}

export const conUnidad = (valor, unidad) => `${valor}${unidad ? ` ${unidad}` : ''}`

// Variación del KPI como en la web: puntos para porcentajes y % para el resto.
export function variacionKpi(variacion) {
  if (!variacion) return null
  const valor = variacion.unidad === 'pts' ? variacion.abs : variacion.pct ?? variacion.abs
  if (valor == null || !Number.isFinite(Number(valor))) return null
  return {
    valor: Number(valor),
    sufijo: variacion.unidad === 'pts' ? 'pts' : variacion.unidad === 'min' ? 'min' : '%',
  }
}

// Duración en minutos para los huecos de disponibilidad: «1 h 20 min».
export function duracion(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
