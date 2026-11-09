// Convierte la forma del contrato a las props de los componentes del sistema de diseño.

export const ROL = {
  ADMINPLAT: 'Administrador de plataforma',
  ADMIN: 'Administrador',
  SUPER: 'Supervisor',
  ANALISTA: 'Analista',
  OPER: 'Operador',
}
export const nombreCompleto = (u) => (u ? `${u.nombre} ${u.primer_apellido}` : '')
export const nombreCorto = (u) => (u ? `${u.nombre} ${u.primer_apellido[0]}.` : '')

// Unidades del catálogo variable_ambiental.
export const UNIDAD = { TEMP: '°C', HUM: '%HR', AIRE: 'ppm' }

// Variable ambiental → etiqueta, ícono y decimales.
export const VARIABLE = {
  TEMP: { etiqueta: 'Temperatura', corta: 'Temperatura', icono: 'thermometer', decimales: 1 },
  HUM: { etiqueta: 'Humedad', corta: 'Humedad', icono: 'droplets', decimales: 1 },
  AIRE: { etiqueta: 'Calidad del aire', corta: 'Aire', icono: 'wind', decimales: 0 },
}

// Estado del dispositivo (estado_dispositivo) → status de StatusBadge.
export const ESTADO_DISPOSITIVO = {
  LINEA: { status: 'normal', label: 'En línea' },
  CALENT: { status: 'warning', label: 'Calentando' },
  SINCONEX: { status: 'offline', label: 'Sin conexión' },
  BATBAJA: { status: 'warning', label: 'Batería baja' },
  MANT: { status: 'offline', label: 'Mantenimiento' },
  BAJA: { status: 'offline', label: 'Baja' },
}
export const enLinea = (d) => d.estado_dispositivo !== 'SINCONEX' && d.estado_dispositivo !== 'BAJA'

// Nivel de una lectura contra su umbral: normal, warning (fuera de advertencia) o critical (fuera de peligro).
export function nivelLectura(valor, umbral) {
  if (!umbral || valor == null) return 'normal'
  const v = Number(valor)
  if (v > Number(umbral.peligro_max) || v < Number(umbral.peligro_min)) return 'critical'
  if (v > Number(umbral.advertencia_max) || v < Number(umbral.advertencia_min)) return 'warning'
  return 'normal'
}
export const rangoUmbral = (u, unidad) =>
  u ? `${Number(u.peligro_min)}–${Number(u.peligro_max)} ${unidad ?? ''}`.trim() : '—'

// Alerta → fila de la lista y del feed.
export const NIVEL_ALERTA = {
  PELIGRO: { status: 'critical', tone: 'danger', icon: 'octagon-alert', level: 'critical' },
  ADVERTENCIA: { status: 'warning', tone: 'warning', icon: 'triangle-alert', level: 'warning' },
}
export const ESTADO_ALERTA = {
  PENDIENTE: { tone: 'ink', icon: 'clock', label: 'Pendiente' },
  ATENDIDA: { tone: 'neutral', icon: 'circle-check', label: 'Atendida' },
  DESCARTADA: { tone: 'offline', icon: 'circle-x', label: 'Descartada' },
}
export function tituloAlerta(a) {
  const v = VARIABLE[a.variable].etiqueta
  return a.nivel === 'PELIGRO' ? `${v} fuera de rango` : `${v} cerca del umbral`
}
export const limiteAlerta = (a) =>
  a.tipo === 'POR_DEBAJO' ? `mín ${Number(a.peligro_min)} ${a.unidad}` : `máx ${Number(a.peligro_max)} ${a.unidad}`
export const valorAlerta = (a) => `${Number(a.lectura_valor).toFixed(VARIABLE[a.variable].decimales)} ${a.unidad}`

export const pagina = (r) => (Array.isArray(r) ? r : r?.results ?? [])

// Posición (0 a 1) de un valor dentro de una escala, para las barras de rango y el medidor.
export const posicion = (v, min, max) => Math.max(0, Math.min(1, (Number(v) - min) / (max - min || 1)))
// Escala de la barra de rango de una variable: el rango de peligro con margen a los lados.
export function escala(u, variable) {
  const margen = variable === 'AIRE' ? 200 : 2
  const min = Math.max(0, Number(u.peligro_min) - margen)
  return [min, Number(u.peligro_max) + margen]
}

// El agente IA lo usan administradores, supervisores y analistas; un operador, solo si se lo permitieron.
export const puedeUsarAgente = (u) => !!u && (u.rol !== 'OPER' || !!u.acceso_agente)
