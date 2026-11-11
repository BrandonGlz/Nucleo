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
// Igual que en el backend (apps/reportes/graficas.py): van antes que el reporte completo.
const GRAFICA = /(grafica|grafico|graficame|chart|diagrama|dashboard|tablero|visualiza|dibuja|plot)/
const COMPARATIVA = /(compara|comparativ|comparacion|cooperativa|versus|\bvs\b|\bcontra\b|diferencia entre)/
export const esGrafica = (pregunta) => GRAFICA.test(normalizar(pregunta))
export const esComparativa = (pregunta) => COMPARATIVA.test(normalizar(pregunta))
export const esReporte = (pregunta) => {
  const t = normalizar(pregunta)
  return !GRAFICA.test(t) && !COMPARATIVA.test(t) && (REPORTE.test(t) || (VERBOS.test(t) && PERIODO.test(t)))
}

const VARIABLES = [
  [/(temperatura|calor|frio|°c|grados|calient|fresco|helad|templad)/, 'temperatura'],
  [/(humedad|humedo|seco|bochorno|vapor|condensa)/, 'humedad'],
  [/(aire|co2|calidad|ppm|ventila|olor|viciado|encerrado)/, 'calidad del aire'],
]
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const variableDe = (t) => VARIABLES.find(([re]) => re.test(t))?.[1] ?? ''

// El periodo que nombra la pregunta, como lo dirá el paso («de ayer», «de octubre»); '' si no nombra.
function periodoDe(t) {
  if (/\bhoy\b/.test(t)) return 'de hoy'
  if (/\bayer\b/.test(t)) return 'de ayer'
  if (/semana pasada/.test(t)) return 'de la semana pasada'
  if (/(esta semana|semanal)/.test(t)) return 'de esta semana'
  if (/mes pasado/.test(t)) return 'del mes pasado'
  if (/(este mes|mensual)/.test(t)) return 'de este mes'
  const dias = t.match(/ultimos? (\d+) dias/)
  if (dias) return `de los últimos ${dias[1]} días`
  const mes = MESES.find((m) => new RegExp(`\\b${m}\\b`).test(t))
  return mes ? `de ${mes}` : ''
}

function datoDe(t) {
  if (/(maxim|mas alt|pico|que tan alto|hasta donde (llego|subio)|lo mas que)/.test(t)) return 'la máxima'
  if (/(minim|mas baj|que tan bajo|lo menos que)/.test(t)) return 'la mínima'
  if (/(promedio|media)/.test(t)) return 'el promedio'
  return ''
}

// Área nombrada («del área de ventas»), para decir que se busca.
function lugarDe(t) {
  const m = t.match(/\b(?:area|zona|sala|departamento|sucursal)s?\s+(?:de\s+|del\s+)?([a-z0-9ñ]+)/)
  const nombre = m?.[1]
  return nombre && !['la', 'el', 'mi', 'su', 'esta', 'este', 'toda', 'completa', 'tengo', 'hay'].includes(nombre) ? nombre : ''
}

const alAzar = (t) => t.split(/\s+/).some((w) => w.length >= 7 && (/[^aeiou\s\d]{5,}/.test(w) || (w.match(/[aeiou]/g)?.length ?? 0) / w.length < 0.25))
const CORTA = /^(si|sip|claro|dale|va|exacto|correcto|eso|no|nop|no gracias|no era eso|si por favor|asi es)[\s!.,]*$/
const SEGUIMIENTO = /^(y|e|pero|entonces|tambien)\b/

// `anterior`: la pregunta previa del usuario, para dar continuidad («¿y ayer?», «sí la tengo»).
export function planDe(pregunta, dispositivo = 'el dispositivo', anterior = '') {
  const t = normalizar(pregunta).replace(/[¿?¡!]/g, '').trim()
  const a = normalizar(anterior)
  const plan = (pasos) => ({ ms: 500 + pasos.length * 350, pasos })
  const sigue = Boolean(a) && (SEGUIMIENTO.test(t) || t.split(/\s+/).length <= 4)
  const variable = variableDe(t) || (sigue ? variableDe(a) : '')
  const periodo = periodoDe(t)
  const de = variable ? ` de ${variable}` : ''
  const lugar = lugarDe(t)

  if (alAzar(t)) return plan(['Leyendo tu mensaje', 'Separando lo que no se entiende', 'Preparando la respuesta'])
  if (CORTA.test(t)) return plan(['Retomando la conversación', 'Preparando la respuesta'])
  if (/(\bmanana\b|proxim|va a (subir|bajar|estar)|pronostic)/.test(t))
    return plan(['Revisando la fecha que pides', `Revisando qué lecturas hay de ${dispositivo}`])
  if (lugar) return plan([`Buscando el área «${lugar}» en tu organización`, 'Revisando las áreas que puedes consultar', 'Preparando la respuesta'])
  if (a && lugarDe(a) && !variableDe(t))
    return plan(['Retomando tu mensaje anterior', `Revisando de nuevo si existe el área «${lugarDe(a)}»`, 'Revisando las áreas que puedes consultar'])
  if (/(que|cuales|mis) (areas|zonas|departamentos)|areas (hay|tengo)/.test(t))
    return plan(['Buscando las áreas que puedes consultar', 'Agrupando sus dispositivos'])
  if (COMPARATIVA.test(t))
    return plan([`Entendiendo qué comparar${de}`, `Reuniendo las lecturas ${periodo || 'de esta semana'} y del periodo anterior`, 'Calculando diferencias', 'Armando la comparativa'])
  if (GRAFICA.test(t))
    return plan([`Reuniendo las lecturas de ${variable || 'todas las variables'} ${periodo || 'de los últimos 7 días'}`, 'Dibujando la gráfica'])
  if (REPORTE.test(t) || (VERBOS.test(t) && PERIODO.test(t))) {
    if (/(que|cuales|ultimos?|hay) reportes|reportes (generados|hay|anteriores)/.test(t))
      return plan([`Buscando los reportes del área de ${dispositivo}`, 'Ordenándolos por fecha'])
    return {
      ms: 3000,
      pasos: [
        `Entendiendo el periodo: ${periodo.replace(/^del? /, '') || 'esta semana'}`,
        `Reuniendo las lecturas del área de ${dispositivo}`,
        'Calculando promedios, mínimos y máximos',
        'Revisando las alertas del periodo',
        'Redactando el análisis',
        'Armando la hoja del reporte',
      ],
    }
  }
  if (/(falla|no funciona|no sirve|descompuest|no marca|no mide|mide mal|marca mal|no actualiza)/.test(t))
    return plan([`Revisando el estado de ${dispositivo}`, 'Verificando su última conexión', 'Revisando el estado de cada sensor'])
  if (/(conect|linea|bateria|senal|wifi|prendid|encendid|apagad|vivo)/.test(t))
    return plan([`Revisando la última conexión de ${dispositivo}`, 'Verificando batería y señal'])
  if (/(que|cuales|cuantos) sensores|sensores (tiene|hay)|(primer|segundo|tercer)o? sensor|sensor \d/.test(t))
    return plan([`Buscando los sensores de ${dispositivo}`, 'Revisando su estado y calibración', 'Leyendo su última medición'])
  if (/(umbral|limite|rango (permitido|normal|configurado))/.test(t))
    return plan([`Buscando los umbrales${de} de ${dispositivo}`, 'Revisando advertencia y peligro'])
  if (/(alerta|alarma|aviso)/.test(t))
    return plan([`Buscando las alertas de ${dispositivo} ${periodo || 'de los últimos 7 días'}`, 'Agrupando por variable y nivel', 'Revisando cuáles siguen pendientes'])
  if (/(ultima|ultimo|actual|ahorita|en este momento) (medicion|lectura|registro|dato)/.test(t))
    return plan([`Buscando la última medición${de || ' de los sensores'}`, 'Comparando con los umbrales'])
  if (variable && !t.includes('?') && /^(aqui |aca |ahorita |siento que |creo que )*(hace|se siente|siento|esta|huele|hay|anda)\b/.test(t))
    return plan(['Entendiendo lo que notas', `Leyendo la última medición de ${variable}`, 'Comparando con los umbrales'])
  if (variable && /(por ?que|a que se debe|es grave|es malo|es peligroso|preocup)/.test(t))
    return plan([`Revisando las lecturas de ${variable} ${periodo || 'de los últimos 7 días'}`, 'Comparando con los umbrales', 'Revisando si hubo alertas'])
  if (variable) {
    const dato = datoDe(t)
    return plan([
      sigue ? 'Retomando tu pregunta anterior' : `Entendiendo qué necesitas de ${variable}`,
      dato
        ? `Buscando ${dato} de ${variable} ${periodo || 'de los últimos 7 días'}`
        : `Leyendo las lecturas de ${variable} ${periodo || 'de los últimos 7 días'}`,
      dato ? 'Ubicando cuándo ocurrió' : 'Buscando picos y horarios',
      'Comparando con los umbrales',
    ])
  }
  if (/(medida|medicion|lectura|ambiente|condiciones|como esta|como anda|que tal)/.test(t))
    return plan([`Leyendo temperatura, humedad y aire de ${dispositivo} ${periodo || 'de los últimos 7 días'}`, 'Calculando promedios y rangos'])
  if (sigue && periodo) return plan(['Retomando tu pregunta anterior', `Buscando las lecturas ${periodo}`])
  return plan(['Leyendo tu mensaje', `Revisando qué puedo consultar de ${dispositivo}`, 'Preparando la respuesta'])
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
  GRAFICA_HUM: { icono: 'droplets', texto: 'Gráfica de humedad' },
  GRAFICA_ALERTAS: { icono: 'bell', texto: 'Gráfica de alertas' },
  COMPARA_SEMANA: { icono: 'activity', texto: 'Compara con la semana pasada' },
  COMPARA_DISP: { icono: 'cpu', texto: 'Compara los dispositivos' },
  ELEMENTOS: { icono: 'layout-grid', texto: '¿Qué elementos tiene la plantilla?' },
}
const DESPUES = {
  TEMP: ['HUM', 'ALERTAS', 'REPORTE'],
  HUM: ['TEMP', 'PICOS', 'REPORTE'],
  AIRE: ['TEMP', 'ALERTAS', 'REPORTE'],
  ALERTAS: ['PICOS', 'CONEXION', 'REPORTE'],
  PICOS: ['ALERTAS', 'HUM', 'REPORTE'],
  CONEXION: ['ALERTAS', 'TEMP', 'AIRE'],
  REPORTE: ['ELEMENTOS', 'GRAFICA_ALERTAS', 'COMPARA_SEMANA'],
  GRAFICA: ['COMPARA_SEMANA', 'GRAFICA_ALERTAS', 'REPORTE'],
  COMPARATIVA: ['COMPARA_DISP', 'GRAFICA_HUM', 'REPORTE'],
  EDICION: ['ELEMENTOS', 'GRAFICA_ALERTAS', 'COMPARA_SEMANA'],
  OTRO: ['TEMP', 'HUM', 'ALERTAS'],
}

export function temaDe(pregunta) {
  const t = normalizar(pregunta)
  if (COMPARATIVA.test(t)) return 'COMPARATIVA'
  if (GRAFICA.test(t)) return 'GRAFICA'
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
export function siguientes(pregunta, { reporte = false, hechas = [], tema } = {}) {
  const ya = new Set(hechas.map(normalizar))
  return (DESPUES[tema ?? temaDe(pregunta)] ?? DESPUES.OTRO)
    .filter((c) => reporte || !['REPORTE', 'REPORTE_MES', 'ELEMENTOS', 'COMPARA_DISP'].includes(c))
    .map((c) => SEGUIR[c])
    .filter((s) => !ya.has(normalizar(s.texto)))
    .slice(0, 3)
}

// Respuestas que no necesitan servidor ni IA: saludos, agradecimientos, ayuda y llevar a otra
// sección. Devuelve { texto, ir? } o null.
const SECCIONES = [
  [/(historico|historial|mediciones)/, '/mediciones', 'Histórico'],
  [/alertas/, '/alertas', 'Alertas'],
  [/reportes/, '/reportes', 'Reportes'],
  [/dispositivos/, '/dispositivos', 'Dispositivos'],
  [/umbrales/, '/umbrales', 'Umbrales'],
  [/(panel|inicio)/, '/panel', 'Panel'],
]
export function respuestaRapida(pregunta, { nombre = 'equipo', dispositivo = 'tu dispositivo' } = {}) {
  const t = normalizar(pregunta).trim()
  if (/^(hola|buen(os|as)? (dias|tardes|noches)|que tal|hey|saludos)( nico)?$/.test(t))
    return { texto: `Hola, ${nombre}. Pregúntame por la temperatura, la humedad, el aire, las alertas o la conexión de ${dispositivo}; también genero reportes, gráficas y comparativas.` }
  if (/^(gracias|muchas gracias|ok|okay|vale|perfecto|excelente|listo|genial)( nico)?$/.test(t))
    return { texto: 'Con gusto. Si necesitas algo más de tus sensores, aquí estoy.' }
  if (/(que puedes hacer|en que me ayudas|como te uso|ayuda|que sabes hacer)/.test(t))
    return {
      texto: `Puedo responder al instante sobre ${dispositivo}: temperatura, humedad, calidad del aire, alertas y conexión. También genero reportes con tus plantillas (y los edito: «quita las alertas», «humedad en barras»), muestro una sola gráfica («gráfica de humedad del mes») y comparo periodos o dispositivos («compara con la semana pasada»).`,
    }
  if (/^(llevame|ir|abre|abrir|ve|vamos) (a |al |a la |a los )?/.test(t)) {
    const destino = SECCIONES.find(([re]) => re.test(t))
    if (destino) return { texto: `Te llevo a ${destino[2]}.`, ir: destino[1] }
  }
  return null
}
