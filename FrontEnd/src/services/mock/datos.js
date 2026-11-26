// Datos de ejemplo con la forma exacta del contrato (Context/api/contrato-api.md) y los nombres
// del modelo relacional. Salen de renderVals() de Docs/Mockups/fuente/pantallas/WebScreen.dc.html.
// Las fechas se calculan a partir del momento en que carga la app para que «hace 4 s» sea real.

const AHORA = Date.now()
export const hace = (seg) => new Date(AHORA - seg * 1000).toISOString()
const MIN = 60
const HORA = 3600
const DIA = 86400

// Próxima ejecución futura para las programaciones de ejemplo (día 0 = lunes).
function proximaEjecucion({ diaSemana = null, diaMes = null, hora = '08:00' } = {}) {
  const base = new Date(AHORA)
  const [h, m] = String(hora).split(':').map(Number)
  if (diaSemana != null) {
    const jsDia = (Number(diaSemana) + 1) % 7
    let delta = (jsDia - base.getDay() + 7) % 7
    if (delta === 0) delta = 7
    const fecha = new Date(base)
    fecha.setDate(base.getDate() + delta)
    fecha.setHours(h, m, 0, 0)
    return fecha.toISOString()
  }
  if (diaMes != null) {
    const fecha = new Date(base.getFullYear(), base.getMonth(), Number(diaMes), h, m, 0, 0)
    if (fecha <= base) fecha.setMonth(fecha.getMonth() + 1)
    return fecha.toISOString()
  }
  const fecha = new Date(base)
  fecha.setHours(h, m, 0, 0)
  if (fecha <= base) fecha.setDate(fecha.getDate() + 1)
  return fecha.toISOString()
}

export const catalogos = {
  roles: [
    { codigo: 'ADMINPLAT', nombre: 'Administrador de plataforma', descripcion: '' },
    { codigo: 'ADMIN', nombre: 'Administrador', descripcion: '' },
    { codigo: 'SUPER', nombre: 'Supervisor', descripcion: '' },
    { codigo: 'ANALISTA', nombre: 'Analista', descripcion: '' },
    { codigo: 'OPER', nombre: 'Operador', descripcion: '' },
  ],
  variables: [
    { codigo: 'TEMP', nombre: 'Temperatura', unidad: '°C', rango_min: '-40.00', rango_max: '80.00' },
    { codigo: 'HUM', nombre: 'Humedad relativa', unidad: '%HR', rango_min: '0.00', rango_max: '100.00' },
    { codigo: 'AIRE', nombre: 'Calidad del aire (eCO2)', unidad: 'ppm', rango_min: '0.00', rango_max: '10000.00' },
  ],
}
export const UNIDAD = { TEMP: '°C', HUM: '%HR', AIRE: 'ppm' }

export const organizaciones = [
  {
    num: 1, nombre: 'Grupo Altamira', dir_calle: 'Blvd. Industrial', dir_numero: '1450',
    dir_colonia: 'Ciudad Industrial', ciudad: 'Tijuana', telefono: '6646231100',
    estado: 'ACTIVA', fecha_registro: '2026-08-01T16:00:00Z',
    logo_url: null, color_reporte: null,
  },
]

export const areas = [
  { num: 1, organizacion: 1, nombre: 'Moldeo', descripcion: 'Línea 1 · Línea 2 · Línea 3 · Almacén' },
  { num: 2, organizacion: 1, nombre: 'Laboratorio', descripcion: 'Sala limpia · Esclusa · Bodega fría · Control de calidad' },
  { num: 3, organizacion: 1, nombre: 'Guardería', descripcion: 'Aula 1 · Aula 3 · Comedor · Patio techado' },
]

const U = (num, area, rol, nombre, primer, segundo, estado, accesoSeg) => ({
  num, organizacion: 1, area, rol, estado_usuario: estado, nombre, primer_apellido: primer,
  segundo_apellido: segundo,
  correo: `${nombre}.${primer}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@grupoaltamira.mx',
  telefono: '', ultimo_acceso: accesoSeg == null ? null : hace(accesoSeg), fecha_registro: '2026-08-02T16:00:00Z',
  // Los operadores usan el agente IA en la app solo si un administrador o supervisor se lo permite.
  acceso_agente: rol !== 'OPER' || num === 6,
})
// En modo simulado se entra con el correo de cualquiera de estas cuentas y cualquier contraseña.
export const usuarios = [
  U(1, null, 'ADMIN', 'Andrés', 'Villalobos', 'Ruiz', 'ACT', 10),
  U(2, 2, 'SUPER', 'Yadira', 'Salazar', 'Uribe', 'ACT', 5 * MIN),
  U(3, 1, 'SUPER', 'Mariana', 'Cruz', 'León', 'ACT', HORA),
  U(4, 3, 'SUPER', 'Rubén', 'Castillo', 'Mora', 'ACT', DIA),
  U(5, null, 'ANALISTA', 'Karla', 'Méndez', 'Soto', 'ACT', 25 * MIN),
  U(6, 1, 'OPER', 'Luis', 'Ortega', 'Paz', 'ACT', 2 * MIN),
  U(7, 2, 'OPER', 'Diana', 'Ríos', 'Vega', 'ACT', 12 * MIN),
  U(8, 3, 'OPER', 'Paola', 'Herrera', 'Gil', 'ACT', 3 * HORA),
  U(9, 1, 'OPER', 'Jorge', 'Ramírez', 'Luna', 'INA', 82 * DIA),
]

// [num, area, nombre, codigo_mqtt, bateria, segundos desde la última conexión, intervalo, estado, operador,
//  temperatura, humedad, aire]
const DISP = [
  [1, 1, 'Núcleo T-01', 'NC-0341', 86, 12, 30, 'LINEA', 6, 23.6, 46.0, 780],
  [2, 1, 'Núcleo T-02', 'NC-0342', 64, 9, 30, 'LINEA', null, 27.8, 49.0, 860],
  [3, 1, 'Núcleo T-03', 'NC-0343', 78, 6, 30, 'LINEA', null, 24.0, 48.5, 820],
  [4, 1, 'Núcleo T-04', 'NC-0344', 52, 15, 60, 'LINEA', null, 21.8, 50.1, 820],
  [5, 2, 'Núcleo L-07', 'NC-0417', 22, 4, 15, 'LINEA', 7, 19.9, 71.0, 360],
  [6, 2, 'Núcleo L-08', 'NC-0418', 70, 3, 15, 'LINEA', null, 20.5, 44.0, 400],
  [7, 2, 'Núcleo L-09', 'NC-0419', 88, 5, 30, 'LINEA', null, 19.0, 40.2, 380],
  [8, 2, 'Núcleo L-10', 'NC-0420', 45, 8, 30, 'LINEA', null, 21.0, 45.3, 420],
  [9, 3, 'Núcleo E-03', 'NC-0288', 91, 20, 60, 'LINEA', null, 22.5, 44.0, 600],
  [10, 3, 'Núcleo E-04', 'NC-0289', 67, 11, 60, 'LINEA', null, 23.0, 47.0, 650],
  [11, 3, 'Núcleo E-05', 'NC-0290', 8, 6 * MIN, 60, 'SINCONEX', 8, 22.8, 46.1, 410],
  [12, 3, 'Núcleo E-06', 'NC-0291', 31, 2 * HORA, 60, 'SINCONEX', null, 21.2, 43.0, 500],
]

// Los mismos dos sensores que lleva cada ESP32 (sembrar_demo).
const SENSORES = [
  ['DHT22', 'Temperatura y humedad'],
  ['CCS811', 'eCO₂ y compuestos orgánicos'],
]
const estadoSensor = (disp, i) => (disp === 5 && i === 1 ? 'CALIB' : disp === 11 && i === 1 ? 'FALLA' : 'OPERA')
// Firmware publicado para la actualización remota (el mismo que muestra la consola) y el que informó cada
// equipo: uno se quedó atrás y otro aún no lo informa.
const FIRMWARE_PUBLICADO = '1.4.2'
const versionDe = (num) => (num === 4 ? '1.3.0' : num === 12 ? null : FIRMWARE_PUBLICADO)

export const dispositivos = DISP.map(([num, area, nombre, codigo, bat, seg, intervalo, estado, operador]) => ({
  num, area, estado_dispositivo: estado, operador, registrado_por: 1, nombre, codigo_mqtt: codigo,
  intervalo_muestreo_seg: intervalo, nivel_bateria: bat, ultima_conexion: hace(seg),
  // Voltaje aproximado de una LiPo según su carga; el equipo 4 aún no recibe su configuración.
  voltaje_bateria: bat == null ? null : (3.3 + 0.009 * bat).toFixed(3),
  intervalo_reportado_seg: num === 4 ? 120 : intervalo, configuracion_pendiente: num === 4 && intervalo !== 120,
  ultimo_arranque: hace(3 * DIA), fecha_alta: '2026-08-10T16:00:00Z',
  version_firmware: versionDe(num), version_reportada_en: versionDe(num) ? hace(seg + 2 * HORA) : null,
  version_firmware_publicada: FIRMWARE_PUBLICADO,
  sensores: SENSORES.map(([modelo, funcion], i) => ({
    num: num * 10 + i, dispositivo: num, estado_sensor: estadoSensor(num, i), modelo, funcion,
    fecha_acondicionamiento: '2026-08-10',
    fecha_calibracion: estadoSensor(num, i) === 'CALIB' ? '2026-03-03' : '2026-08-12',
  })),
}))

// Última lectura de cada variable, por dispositivo. El mock las varía para simular el «en vivo».
export const ultimas = Object.fromEntries(
  DISP.map(([num, , , , , seg, , , , t, h, a]) => [
    num,
    [
      ['TEMP', t, 'DHT22'],
      ['HUM', h, 'DHT22'],
      ['AIRE', a, 'CCS811'],
    ].map(([variable, valor, sensor_modelo]) => ({
      variable, unidad: UNIDAD[variable], valor: valor.toFixed(2),
      fecha_hora: hace(seg), recibida_en: hace(Math.max(seg - 1, 0)), sensor_modelo,
    })),
  ]),
)

// Umbrales por dispositivo. Los cuatro límites siguen peligro_min ≤ advertencia_min < advertencia_max ≤ peligro_max.
const LIMITES = {
  1: { TEMP: [18, 20, 26.5, 28], HUM: [30, 35, 60, 65], AIRE: [0, 0, 900, 1000] },
  2: { TEMP: [16, 18, 24, 26], HUM: [35, 38, 57, 60], AIRE: [0, 0, 900, 1000] },
  3: { TEMP: [18, 20, 26, 28], HUM: [30, 35, 57, 60], AIRE: [0, 0, 900, 1000] },
}
export const umbrales = dispositivos.flatMap((d) =>
  ['TEMP', 'HUM', 'AIRE'].map((variable, i) => {
    const [pmin, amin, amax, pmax] = LIMITES[d.area][variable]
    return {
      num: d.num * 10 + i, dispositivo: d.num, variable, configurado_por: d.area === 2 ? 2 : 1,
      peligro_min: pmin.toFixed(2), advertencia_min: amin.toFixed(2),
      advertencia_max: amax.toFixed(2), peligro_max: pmax.toFixed(2),
      activo: true, fecha_actualizacion: hace(d.area === 2 ? 5 * HORA : 9 * DIA),
    }
  }),
)

const A = (num, disp, variable, nivel, valor, seg, estado, atendida, obs) => {
  const umbral = umbrales.find((u) => u.dispositivo === disp && u.variable === variable)
  return {
    num, umbral: umbral.num, dispositivo: disp,
    dispositivo_nombre: dispositivos.find((d) => d.num === disp).nombre,
    variable, unidad: UNIDAD[variable], lectura_num: 900000 + num, lectura_valor: valor.toFixed(2),
    lectura_fecha_hora: hace(seg + 4), peligro_min: umbral.peligro_min,
    advertencia_min: umbral.advertencia_min, advertencia_max: umbral.advertencia_max,
    peligro_max: umbral.peligro_max, nivel, tipo: 'POR_ENCIMA', estado, fecha_hora: hace(seg),
    atendida_por: atendida || null, fecha_atencion: atendida ? hace(seg - 18 * MIN) : null,
    observaciones: obs || '',
  }
}
export const alertas = [
  A(108, 5, 'HUM', 'PELIGRO', 71.0, 8 * MIN, 'PENDIENTE'),
  A(107, 2, 'TEMP', 'ADVERTENCIA', 27.8, 22 * MIN, 'PENDIENTE'),
  A(106, 1, 'AIRE', 'PELIGRO', 1280, 4 * HORA, 'ATENDIDA', 3, 'Se revisó la extracción de Línea 1.'),
  A(105, 9, 'HUM', 'ADVERTENCIA', 58.9, 5 * HORA, 'ATENDIDA', 4, 'Se ventiló el aula.'),
  A(104, 7, 'TEMP', 'ADVERTENCIA', 24.6, 6 * HORA, 'DESCARTADA', 2, 'Puerta abierta durante la carga.'),
  A(103, 5, 'HUM', 'ADVERTENCIA', 58.6, DIA, 'ATENDIDA', 2, 'Se ajustó el deshumidificador.'),
]

// Notificaciones de la usuaria de la sesión simulada (una por alerta, por correo).
export const notificaciones = alertas.map((a, i) => ({
  num: 5000 + a.num, alerta: a.num, canal: 'CORREO', estado_envio: 'ENVIADA',
  fecha_envio: hace([8, 22, 240, 300, 360, 1440][i] * MIN - 50),
}))

// Avisos del sistema (GET /avisos/) de los cuatro tipos; los más viejos ya están leídos.
const V = (num, tipo, nivel, titulo, detalle, ruta, seg, leido = false) => ({
  num, tipo, nivel, titulo, detalle, ruta, fecha_hora: hace(seg), leido,
})
export const avisos = [
  V(9012, 'DISPOSITIVO', 'PELIGRO', 'Núcleo E-05 sin conexión', 'Guardería · NC-0290 dejó de enviar lecturas hace 6 min.', '/dispositivos/11', 5 * MIN),
  V(9011, 'NICO', 'ADVERTENCIA', 'Nico AI sin conexión', 'El modelo local no responde; las preguntas quedan en espera.', '/agente', 15 * MIN),
  V(9010, 'REPORTE', 'INFO', 'Reporte listo', 'Moldeo · semana del 9 al 15 de noviembre. Ya puedes descargar el PDF.', '/reportes', 50 * MIN),
  V(9009, 'USUARIO', 'INFO', 'Nuevo usuario dado de alta', 'Paola Herrera Gil entró como Operador en Guardería.', '/usuarios', 2 * HORA),
  V(9008, 'NICO', 'INFO', 'Nico AI está de vuelta', 'El asistente volvió a responder tras 12 min sin conexión.', '/agente', 3 * HORA, true),
  V(9007, 'DISPOSITIVO', 'INFO', 'Núcleo L-08 reconectado', 'Laboratorio · NC-0418 volvió a enviar lecturas.', '/dispositivos/6', 5 * HORA, true),
  V(9006, 'USUARIO', 'ADVERTENCIA', 'Cambio de rol', 'Mariana Cruz León ahora es Supervisor de Moldeo.', '/usuarios', 26 * HORA, true),
  V(9005, 'DISPOSITIVO', 'ADVERTENCIA', 'Núcleo E-06 sin conexión', 'Guardería · NC-0291 lleva 2 h sin enviar lecturas.', '/dispositivos/12', 28 * HORA, true),
  V(9004, 'REPORTE', 'INFO', 'Reporte listo', 'Laboratorio · octubre de 2026.', '/reportes', 2 * DIA + 3 * HORA, true),
  // Historial ya leído de reconexiones de los últimos días, para que la bandeja tenga más de una
  // página (50 por página) y se vea «Cargar más».
  ...Array.from({ length: 56 }, (_, i) => {
    const disp = 1 + (i % 12)
    const codigo = `NC-${String(400 + disp).padStart(4, '0')}`
    return i % 2
      ? V(8900 - i, 'DISPOSITIVO', 'INFO', 'Dispositivo reconectado', `${codigo} volvió a enviar lecturas.`, `/dispositivos/${disp}`, 3 * DIA + i * 9 * HORA, true)
      : V(8900 - i, 'DISPOSITIVO', 'ADVERTENCIA', 'Dispositivo sin conexión', `${codigo} dejó de enviar lecturas unos minutos.`, `/dispositivos/${disp}`, 3 * DIA + i * 9 * HORA - 20 * MIN, true)
  }),
]

export const reportes = [
  {
    num: 31, organizacion: 1, area: 1, areas: [], generado_por: 2, origen: 'MANUAL',
    periodo_inicio: '2026-10-01T07:00:00Z', periodo_fin: '2026-10-23T07:00:00Z',
    cifras: {
      titulo: 'Calidad del aire en Moldeo', alcance: 'Moldeo', lecturas: 8640, dispositivos: ['Núcleo T-01', 'Núcleo T-02', 'Núcleo T-03', 'Núcleo T-04'],
      variables: [
        { variable: 'TEMP', minimo: 20.8, promedio: 24.6, maximo: 28.4, alertas: 6 },
        { variable: 'HUM', minimo: 38.2, promedio: 47.9, maximo: 58.1, alertas: 1 },
        { variable: 'AIRE', minimo: 340, promedio: 710, maximo: 1280, alertas: 2 },
      ],
      serie: { variable: 'AIRE', etiqueta: 'Calidad del aire promedio por semana', puntos: [['Sem 40', 640], ['Sem 41', 720], ['Sem 42', 880], ['Sem 43', 680]] },
    },
    contenido:
      'La calidad del aire se mantuvo en rango la mayor parte del periodo. Los dos eventos fuera de rango ocurrieron en Línea 1, durante el arranque de la inyectora del turno matutino.\n\nLa tercera semana concentró los valores más altos. Conviene revisar la extracción de Línea 1 antes del siguiente cambio de molde.',
    archivo_pdf: '/media/reportes/31.pdf', fecha_generacion: hace(6 * HORA),
  },
  {
    num: 30, organizacion: 1, area: 3, areas: [], generado_por: null, origen: 'PROGRAMADO',
    periodo_inicio: '2026-10-19T07:00:00Z', periodo_fin: '2026-10-24T07:00:00Z',
    cifras: {
      titulo: 'Temperatura en Guardería', alcance: 'Guardería', lecturas: 2880, dispositivos: ['Núcleo E-03', 'Núcleo E-04', 'Núcleo E-05', 'Núcleo E-06'],
      variables: [
        { variable: 'TEMP', minimo: 19.6, promedio: 22.7, maximo: 25.1, alertas: 0 },
        { variable: 'HUM', minimo: 40.3, promedio: 45.2, maximo: 58.9, alertas: 1 },
        { variable: 'AIRE', minimo: 410, promedio: 590, maximo: 860, alertas: 0 },
      ],
      serie: { variable: 'TEMP', etiqueta: 'Temperatura promedio por día', puntos: [['Lun', 22.1], ['Mar', 22.6], ['Mié', 23.0], ['Jue', 22.9], ['Vie', 22.8]] },
    },
    contenido: 'La temperatura se mantuvo estable en todas las aulas. El comedor perdió conexión el viernes por la tarde; el dispositivo siguió alertando de forma local.',
    archivo_pdf: '/media/reportes/30.pdf', fecha_generacion: hace(2 * DIA),
  },
  {
    num: 29, organizacion: 1, area: 2, areas: [], generado_por: null, origen: 'PROGRAMADO',
    periodo_inicio: '2026-10-12T07:00:00Z', periodo_fin: '2026-10-19T07:00:00Z',
    cifras: {
      titulo: 'Humedad en Laboratorio', alcance: 'Laboratorio', lecturas: 4032, dispositivos: ['Núcleo L-07', 'Núcleo L-08', 'Núcleo L-09', 'Núcleo L-10'],
      variables: [
        { variable: 'TEMP', minimo: 18.4, promedio: 20.3, maximo: 23.2, alertas: 0 },
        { variable: 'HUM', minimo: 39.0, promedio: 49.6, maximo: 66.1, alertas: 3 },
        { variable: 'AIRE', minimo: 330, promedio: 390, maximo: 520, alertas: 0 },
      ],
      serie: { variable: 'HUM', etiqueta: 'Humedad máxima por día', puntos: [['Lun', 63.8], ['Mar', 54], ['Mié', 66.1], ['Jue', 55], ['Vie', 58]] },
    },
    contenido: 'Hubo tres lecturas sobre el máximo de humedad en Sala limpia, todas por la tarde y cerca del cambio de turno.',
    archivo_pdf: '/media/reportes/29.pdf', fecha_generacion: hace(15 * DIA),
  },
]

// Completa los reportes de ejemplo con las cifras nuevas de la etapa 4 para que las tarjetas
// tengan datos en el modo simulado.
const NOMBRES_VARIABLE = { TEMP: 'Temperatura', HUM: 'Humedad relativa', AIRE: 'Calidad del aire' }

function completarCifras(reporte, indice) {
  const c = reporte.cifras
  const variables = c.variables ?? []
  const alertas = variables.reduce((total, variable) => total + variable.alertas, 0)
  const dispositivos = c.dispositivos ?? []
  const cumplimiento = {}
  const comparativoVariables = []
  const porDispositivo = []
  for (const [i, variable] of variables.entries()) {
    const dec = variable.variable === 'AIRE' ? 0 : 1
    const previo = Number(variable.promedio) - 0.4 * (i + 1)
    const cambio = Number(variable.promedio) - previo
    const pct = previo ? (cambio / previo) * 100 : null
    cumplimiento[variable.variable] = {
      dentro_pct: +(100 - variable.alertas * 1.5).toFixed(1),
      fuera_min: +(variable.alertas * 3.5).toFixed(1),
      lecturas: c.lecturas / Math.max(1, variables.length),
    }
    comparativoVariables.push({
      variable: variable.variable,
      nombre: variable.variable,
      unidad: variable.variable === 'TEMP' ? '°C' : variable.variable === 'HUM' ? '%HR' : 'ppm',
      promedio: variable.promedio,
      minimo: variable.minimo,
      maximo: variable.maximo,
      promedio_previo: +previo.toFixed(dec),
      minimo_previo: +(Number(variable.minimo) - 0.3).toFixed(dec),
      maximo_previo: +(Number(variable.maximo) + 0.2).toFixed(dec),
      dif_promedio: +cambio.toFixed(dec),
      dif_promedio_pct: pct == null ? null : +pct.toFixed(1),
      mejora: cambio <= 0,
    })
  }
  dispositivos.forEach((nombre, i) => {
    const fila = {
      codigo: `NC-${String(indice + 1).padStart(2, '0')}${i + 1}`,
      nombre,
      area: c.alcance,
    }
    for (const variable of variables) {
      fila[variable.variable] = {
        minimo: variable.minimo,
        promedio: +(variable.promedio + (i - 1) * 0.2).toFixed(variable.variable === 'AIRE' ? 0 : 1),
        maximo: variable.maximo,
      }
    }
    porDispositivo.push(fila)
  })
  return {
    cumplimiento,
    comparativo: {
      periodo: { inicio: c.periodo?.inicio, fin: c.periodo?.fin },
      variables: comparativoVariables,
      alertas: {
        total: alertas,
        total_previo: alertas + 2,
        diferencia: -2,
        diferencia_pct: alertas ? -100 / (alertas + 2) : null,
        mejora: true,
      },
    },
    por_dispositivo: porDispositivo,
    gestion_alertas: {
      estados: { ATENDIDA: Math.max(0, alertas - 1), DESCARTADA: 1, PENDIENTE: 1 },
      total: alertas + 1,
      tiempo_medio_min: 24.5,
      responsables: [{ usuario: 'Ana López', total: Math.max(1, alertas - 1) }],
    },
    disponibilidad: Object.fromEntries(
      porDispositivo.map((fila) => [
        fila.codigo,
        {
          nombre: fila.nombre,
          area: fila.area,
          pct: 98.4,
          recibidas: 850,
          esperadas: 864,
          huecos: [{ inicio: c.periodo?.inicio, minutos: 12 }],
        },
      ]),
    ),
    incidentes: porDispositivo.length
      ? [
          {
            dispositivo: porDispositivo[0].nombre,
            dispositivo_codigo: porDispositivo[0].codigo,
            area: c.alcance,
            variable: variables[0]?.variable ?? 'TEMP',
            variable_nombre: NOMBRES_VARIABLE[variables[0]?.variable] ?? 'Temperatura',
            inicio: c.periodo?.inicio,
            duracion_min: 42,
            valor_pico: variables[0]?.maximo ?? 0,
            nivel: 'ADVERTENCIA',
          },
        ]
      : [],
    observaciones: porDispositivo.length
      ? [
          {
            fecha: c.periodo?.inicio,
            dispositivo: porDispositivo[0].nombre,
            dispositivo_codigo: porDispositivo[0].codigo,
            area: c.alcance,
            variable: variables[0]?.variable ?? 'TEMP',
            variable_codigo: variables[0]?.variable ?? 'TEMP',
            variable_nombre: NOMBRES_VARIABLE[variables[0]?.variable] ?? 'Temperatura',
            usuario: 'Ana López',
            texto: 'Se revisó el área y se cerró la puerta del andén.',
          },
        ]
      : [],
  }
}

reportes.forEach((reporte, indice) => {
  reporte.cifras.periodo = {
    inicio: reporte.periodo_inicio,
    fin: reporte.periodo_fin,
  }
  reporte.cifras = { ...reporte.cifras, ...completarCifras(reporte, indice) }
})


export const programaciones = [
  {
    num: 4, organizacion: 1, area: 2, areas: [], creada_por: 2, frecuencia: 'SEMANAL',
    formato: 5, formato_nombre: 'Formato de la organización', hora: '08:00:00',
    dia_semana: 0, dia_mes: null, destinatarios: [2, 5, 1],
    activa: true, proxima_ejecucion: proximaEjecucion({ diaSemana: 0 }),
    ultima_ejecucion: hace(7 * DIA), fecha_creacion: '2026-09-01T16:00:00Z',
  },
  {
    num: 5, organizacion: 1, area: null, areas: [], creada_por: 1, frecuencia: 'MENSUAL',
    formato: null, formato_nombre: '', hora: '08:00:00',
    dia_semana: null, dia_mes: 1, destinatarios: [1, 2, 3, 4, 5],
    activa: true, proxima_ejecucion: proximaEjecucion({ diaMes: 1 }),
    ultima_ejecucion: hace(24 * DIA), fecha_creacion: '2026-08-15T16:00:00Z',
  },
]

// Curvas de las últimas horas para las gráficas (un punto cada 30 min, el último es el valor actual).
export const CURVAS = {
  '5:HUM': [52.1, 53.4, 55.0, 57.2, 58.4, 59.6, 59.1, 59.8, 60.9, 64.8, 68.9, 70.4, 71.0, 71.0],
  '2:TEMP': [22.1, 22.6, 23.4, 24.1, 24.8, 25.6, 26.2, 26.9, 27.4, 27.6, 27.2, 27.5, 27.8, 27.8],
}
