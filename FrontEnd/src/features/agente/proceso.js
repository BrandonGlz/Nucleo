// Lo que Nico AI muestra mientras prepara la respuesta: los pasos que sigue según lo que se le pide
// y el tiempo mínimo que se toma (1 a 3 s), para que se vea qué datos reúne antes de responder.
// Las palabras clave siguen las del agente en el backend (apps/reportes/agente.py).

const normalizar = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const REPORTE = /\b(reporte|informe|resumen|repote|reprote)s?\b/
const VERBOS = /\b(genera|generar|generame|hazme|haz|crea|crear|creame|dame|manda|mandame)\b/
const PERIODO = /(semana|semanal|mes|mensual|hoy|ayer|dias|quincena)/

const VARIABLES = [
  [/(temperatura|calor|frio|°c|grados)/, 'temperatura'],
  [/(humedad|humedo|seco)/, 'humedad'],
  [/(aire|co2|calidad|ppm|ventila)/, 'calidad del aire'],
]

export function planDe(pregunta, dispositivo = 'el dispositivo') {
  const t = normalizar(pregunta)
  if (REPORTE.test(t) || (VERBOS.test(t) && PERIODO.test(t))) {
    return {
      ms: 3000,
      pasos: [
        'Entendiendo qué periodo necesitas',
        `Reuniendo las lecturas del área de ${dispositivo}`,
        'Calculando promedios, mínimos y máximos',
        'Revisando las alertas del periodo',
        'Redactando el análisis',
        'Armando la hoja del reporte',
      ],
    }
  }
  if (/(conect|linea|bateria|senal|wifi|reporta)/.test(t)) {
    return {
      ms: 1200,
      pasos: [`Revisando la última conexión de ${dispositivo}`, 'Verificando batería y señal', 'Preparando la respuesta'],
    }
  }
  if (/(alerta|alarma|umbral|limite|rango)/.test(t)) {
    return {
      ms: 2000,
      pasos: [
        'Entendiendo la pregunta',
        `Buscando las alertas de ${dispositivo} de los últimos 7 días`,
        'Agrupando por variable y nivel',
        'Comparando con los umbrales',
        'Redactando la respuesta',
      ],
    }
  }
  const variable = VARIABLES.find(([re]) => re.test(t))?.[1]
  if (variable) {
    return {
      ms: 1800,
      pasos: [
        'Entendiendo la pregunta',
        `Leyendo las lecturas de ${variable} de ${dispositivo}`,
        'Buscando picos y tendencias',
        'Comparando con los umbrales',
        'Redactando la respuesta',
      ],
    }
  }
  return {
    ms: 1500,
    pasos: ['Entendiendo la pregunta', `Consultando las lecturas de ${dispositivo}`, 'Comparando con los umbrales', 'Redactando la respuesta'],
  }
}

// Preguntas para seguir la conversación, según el tema de la última pregunta. Todas tienen respuesta
// prediseñada en el backend (temas de agente.py), así que contestan al instante sin pasar por la IA.
const SEGUIR = {
  TEMP: { icono: 'thermometer', texto: 'Temperatura de la semana' },
  HUM: { icono: 'droplets', texto: 'Picos de humedad' },
  AIRE: { icono: 'wind', texto: 'Calidad del aire' },
  ALERTAS: { icono: 'bell', texto: 'Alertas de 7 días' },
  PICOS: { icono: 'activity', texto: 'Variable con más picos' },
  CONEXION: { icono: 'signal', texto: 'Estado de conexión' },
  REPORTE: { icono: 'file-text', texto: 'Reporte de esta semana' },
  REPORTE_MES: { icono: 'file-text', texto: 'Reporte del mes pasado' },
}
const DESPUES = {
  TEMP: ['HUM', 'ALERTAS', 'REPORTE'],
  HUM: ['TEMP', 'PICOS', 'REPORTE'],
  AIRE: ['TEMP', 'ALERTAS', 'REPORTE'],
  ALERTAS: ['PICOS', 'CONEXION', 'REPORTE'],
  PICOS: ['ALERTAS', 'HUM', 'REPORTE'],
  CONEXION: ['ALERTAS', 'TEMP', 'AIRE'],
  REPORTE: ['REPORTE_MES', 'ALERTAS', 'PICOS'],
  OTRO: ['TEMP', 'HUM', 'ALERTAS'],
}

export function temaDe(pregunta) {
  const t = normalizar(pregunta)
  if (REPORTE.test(t) || (VERBOS.test(t) && PERIODO.test(t))) return 'REPORTE'
  if (/(conex|bateri|senal|linea|desconect|apag)/.test(t)) return 'CONEXION'
  if (/(alerta|aviso|incidente)/.test(t)) return 'ALERTAS'
  if (/(temperatura|calor|frio|grados)/.test(t)) return 'TEMP'
  if (/humed/.test(t)) return 'HUM'
  if (/(aire|co2|calidad|ppm|ventila)/.test(t)) return 'AIRE'
  if (/(pico|lectura|sensor|medicion|valor|umbral|rango)/.test(t)) return 'PICOS'
  return 'OTRO'
}

// `hechas`: preguntas ya hechas en la conversación (no se vuelven a sugerir).
export function siguientes(pregunta, { reporte = false, hechas = [] } = {}) {
  const ya = new Set(hechas.map(normalizar))
  return DESPUES[temaDe(pregunta)]
    .filter((c) => reporte || !c.startsWith('REPORTE'))
    .map((c) => SEGUIR[c])
    .filter((s) => !ya.has(normalizar(s.texto)))
    .slice(0, 3)
}
