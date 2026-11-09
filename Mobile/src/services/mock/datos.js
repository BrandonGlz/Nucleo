// Datos de ejemplo con la forma exacta del contrato (Context/api/contrato-api.md) y los nombres
// del modelo relacional. Salen de renderVals() de Docs/Mockups/fuente/pantallas/MobileScreen.dc.html:
// hay una cuenta de cada rol; los operadores Luis Ortega (Núcleo T-01) y Diana Ríos (Núcleo L-07).
// Las fechas se calculan a partir del momento en que abre la app para que «hace 12 s» sea real.

const AHORA = Date.now()
export const hace = (seg) => new Date(AHORA - seg * 1000).toISOString()
const MIN = 60
const HORA = 3600
const DIA = 86400

export const UNIDAD = { TEMP: '°C', HUM: '%HR', AIRE: 'ppm' }

export const organizaciones = [
  {
    num: 1, nombre: 'Grupo Altamira', dir_calle: 'Blvd. Industrial', dir_numero: '1450',
    dir_colonia: 'Ciudad Industrial', ciudad: 'Tijuana', telefono: '6646231100',
    estado: 'ACTIVA', fecha_registro: '2026-08-01T16:00:00Z',
  },
]

export const areas = [
  { num: 1, organizacion: 1, nombre: 'Moldeo', descripcion: 'Línea 1 · Línea 2 · Línea 3 · Almacén' },
  { num: 2, organizacion: 1, nombre: 'Laboratorio', descripcion: 'Sala limpia · Esclusa · Bodega fría · Control de calidad' },
  { num: 3, organizacion: 1, nombre: 'Guardería', descripcion: 'Aula 1 · Aula 3 · Comedor · Patio techado' },
]

const U = (num, area, rol, nombre, primer, segundo, estado = 'ACT') => ({
  num, organizacion: 1, area, rol, estado_usuario: estado, nombre, primer_apellido: primer,
  segundo_apellido: segundo,
  correo: `${nombre}.${primer}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@grupoaltamira.mx',
  telefono: '', ultimo_acceso: hace(2 * MIN), fecha_registro: '2026-08-02T16:00:00Z',
  // Los operadores usan el agente IA solo si un administrador o supervisor se lo permite.
  acceso_agente: rol !== 'OPER' || num === 6,
})
// En modo simulado se entra con el correo de cualquiera de estas cuentas y cualquier contraseña.
export const usuarios = [
  U(1, null, 'ADMIN', 'Andrés', 'Villalobos', 'Ruiz'),
  U(3, 1, 'SUPER', 'Mariana', 'Cruz', 'León'),
  U(5, null, 'ANALISTA', 'Karla', 'Méndez', 'Soto'),
  U(6, 1, 'OPER', 'Luis', 'Ortega', 'Paz'),
  U(7, 2, 'OPER', 'Diana', 'Ríos', 'Vega'),
  U(9, 1, 'OPER', 'Jorge', 'Ramírez', 'Luna', 'INA'),
]
// Cuenta con la que se entra si el correo no es de ninguna de las anteriores.
export const USUARIO_SESION = 6

const SENSORES = [
  ['DHT22', 'Temperatura y humedad'],
  ['CCS811', 'eCO₂ y compuestos orgánicos'],
]
const D = (num, area, operador, nombre, codigo, bateria, intervalo) => ({
  num, area, estado_dispositivo: 'LINEA', operador, registrado_por: 1, nombre,
  codigo_mqtt: codigo, intervalo_muestreo_seg: intervalo, nivel_bateria: bateria, ultima_conexion: hace(12),
  ultimo_arranque: hace(3 * DIA), fecha_alta: '2026-08-10T16:00:00Z',
  sensores: SENSORES.map(([modelo, funcion], i) => ({
    num: num * 10 + i, dispositivo: num, estado_sensor: 'OPERA', modelo, funcion,
    fecha_acondicionamiento: '2026-08-10', fecha_calibracion: '2026-08-12',
  })),
})
export const dispositivos = [
  D(1, 1, 6, 'Núcleo T-01', 'NC-0341', 86, 30),
  D(5, 2, 7, 'Núcleo L-07', 'NC-0417', 22, 15),
]

// Última lectura de cada variable, por dispositivo. El mock las varía para simular el «en vivo».
const LECTURAS = { 1: [24.3, 48.2, 780], 5: [19.9, 71.0, 360] }
export const ultimas = Object.fromEntries(
  Object.entries(LECTURAS).map(([num, [t, h, a]]) => [
    num,
    [
      ['TEMP', t, 'DHT22'],
      ['HUM', h, 'DHT22'],
      ['AIRE', a, 'CCS811'],
    ].map(([variable, valor, sensor_modelo]) => ({
      variable, unidad: UNIDAD[variable], valor: valor.toFixed(2),
      fecha_hora: hace(12), recibida_en: hace(11), sensor_modelo,
    })),
  ]),
)

// Umbrales por dispositivo: peligro_min ≤ advertencia_min < advertencia_max ≤ peligro_max.
const LIMITES = {
  1: { TEMP: [18, 20, 26, 28], HUM: [30, 35, 60, 65], AIRE: [0, 0, 900, 1000] },
  5: { TEMP: [16, 18, 24, 26], HUM: [35, 38, 57, 60], AIRE: [0, 0, 900, 1000] },
}
export const umbrales = dispositivos.flatMap((d) =>
  ['TEMP', 'HUM', 'AIRE'].map((variable, i) => {
    const [pmin, amin, amax, pmax] = LIMITES[d.num][variable]
    return {
      num: d.num * 10 + i, dispositivo: d.num, variable, configurado_por: 3,
      peligro_min: pmin.toFixed(2), advertencia_min: amin.toFixed(2),
      advertencia_max: amax.toFixed(2), peligro_max: pmax.toFixed(2),
      activo: true, fecha_actualizacion: hace(9 * DIA),
    }
  }),
)

const A = (num, disp, variable, nivel, valor, seg, estado, obs) => {
  const umbral = umbrales.find((u) => u.dispositivo === disp && u.variable === variable)
  return {
    num, umbral: umbral.num, dispositivo: disp, dispositivo_nombre: dispositivos.find((d) => d.num === disp).nombre,
    variable, unidad: UNIDAD[variable], lectura_num: 900000 + num, lectura_valor: valor.toFixed(2),
    lectura_fecha_hora: hace(seg + 4), peligro_min: umbral.peligro_min,
    advertencia_min: umbral.advertencia_min, advertencia_max: umbral.advertencia_max,
    peligro_max: umbral.peligro_max, nivel, tipo: 'POR_ENCIMA', estado, fecha_hora: hace(seg),
    atendida_por: estado === 'PENDIENTE' ? null : 3,
    fecha_atencion: estado === 'PENDIENTE' ? null : hace(seg - 18 * MIN),
    observaciones: obs || '',
  }
}
export const alertas = [
  A(109, 1, 'TEMP', 'ADVERTENCIA', 26.4, 20 * MIN, 'PENDIENTE'),
  A(108, 5, 'HUM', 'PELIGRO', 71.0, 8 * MIN, 'PENDIENTE'),
  A(106, 1, 'AIRE', 'PELIGRO', 1280, 4 * HORA, 'ATENDIDA', 'Se ajustó la extracción de Línea 1.'),
  A(103, 5, 'HUM', 'ADVERTENCIA', 58.6, DIA, 'ATENDIDA', 'Se ajustó el deshumidificador.'),
  A(102, 1, 'HUM', 'ADVERTENCIA', 60.6, DIA + 2 * HORA, 'DESCARTADA', 'Puerta abierta durante la carga.'),
]

// Notificaciones: push al teléfono, una por alerta.
export const notificaciones = alertas.map((a) => ({
  num: 5000 + a.num, alerta: a.num, canal: 'PUSH', estado_envio: 'ENVIADA',
  fecha_envio: new Date(new Date(a.fecha_hora).getTime() + 40000).toISOString(),
}))
