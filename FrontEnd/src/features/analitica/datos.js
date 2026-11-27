import { fechaCorta, hora } from '../../utils/formato'

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
export const NOMBRE_PERIODO = Object.fromEntries(PERIODOS)
export const VARIABLES = [
  ['', 'Todas'],
  ['TEMP', 'Temperatura'],
  ['HUM', 'Humedad'],
  ['AIRE', 'Calidad del aire'],
]

export const FILTROS_VACIOS = {
  periodo: null,
  variable: null,
  areas: [],
  dispositivos: [],
  desde: '',
  hasta: '',
}

// Lee el estado de la URL. Los valores ausentes quedan en null para que el tablero ponga sus
// valores por omisión cuando termine de cargar.
export function leerUrl(searchParams) {
  const numeros = (clave) =>
    String(searchParams.get(clave) || '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
  return {
    tablero: Number(searchParams.get('tablero')) || null,
    pagina: searchParams.get('pagina') || null,
    filtros: {
      periodo: searchParams.get('periodo') || null,
      variable: searchParams.has('variable') ? searchParams.get('variable') : null,
      areas: numeros('areas'),
      dispositivos: numeros('dispositivos'),
      desde: searchParams.get('desde') || '',
      hasta: searchParams.get('hasta') || '',
    },
  }
}

export function parametrosUrl({ tablero, pagina, filtros }) {
  const params = new URLSearchParams()
  if (tablero) params.set('tablero', String(tablero))
  if (pagina) params.set('pagina', pagina)
  if (filtros.periodo) params.set('periodo', filtros.periodo)
  if (filtros.periodo === 'personalizado') {
    if (filtros.desde) params.set('desde', filtros.desde)
    if (filtros.hasta) params.set('hasta', filtros.hasta)
  }
  if (filtros.variable != null) params.set('variable', filtros.variable)
  if (filtros.areas.length) params.set('areas', filtros.areas.join(','))
  if (filtros.dispositivos.length) params.set('dispositivos', filtros.dispositivos.join(','))
  return params
}

export const filtrosDelTablero = (tablero) => ({
  ...FILTROS_VACIOS,
  periodo: tablero?.conf?.filtros?.periodo || '30d',
  variable: tablero?.conf?.filtros?.variable || 'TEMP',
})

export const variableElegida = (codigo) => codigo || 'TEMP'
export const nombreVariable = (codigo) => VARIABLES.find(([id]) => id === (codigo || ''))?.[1] || 'Todas'

// Etiqueta del eje según el intervalo que devuelve la consulta.
export function etiquetaPunto(iso, intervalo) {
  if (!iso) return ''
  return intervalo === '1d' || intervalo === '1sem' ? fechaCorta(iso) : hora(iso)
}
export function tiempoPunto(iso, intervalo) {
  if (!iso) return ''
  return intervalo === '1d' || intervalo === '1sem' ? fechaCorta(iso) : `${fechaCorta(iso)} · ${hora(iso)}`
}
export const puntosChart = (puntos, intervalo) =>
  (puntos || []).map((p) => ({
    label: etiquetaPunto(p.x, intervalo),
    time: tiempoPunto(p.x, intervalo),
    value: Number(p.y),
  }))

export function variacionParaTile(variacion) {
  if (!variacion) return null
  if (variacion.unidad === 'pts') return { valor: variacion.abs, tipo: 'pts' }
  if (variacion.pct != null) return { valor: variacion.pct, tipo: 'pct' }
  return variacion.abs == null ? null : { valor: variacion.abs, tipo: variacion.unidad || 'pct' }
}
export const semaforoDe = (estado) =>
  estado === 'cumple' ? 'success' : estado === 'cerca' ? 'warning' : estado === 'lejos' ? 'danger' : null

export const tonosEstado = {
  ATENDIDA: 'success',
  PENDIENTE: 'warning',
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
export const tonoDe = (valor) => tonosEstado[valor] || null
