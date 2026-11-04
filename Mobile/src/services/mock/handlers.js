// Imitan cada endpoint con un retraso de 300–600 ms y devuelven la forma del contrato.
// Los errores llevan `status` como ApiError de services/api/client.js.
import { ApiError } from '../api/client'
import * as db from './datos'

// EXPO_PUBLIC_MOCK_ESTADO fuerza un estado para revisar el diseño:
// cargando, vacio (sin alertas), error o sinConexion (el dispositivo deja de reportar).
export const ESTADO_FORZADO = process.env.EXPO_PUBLIC_MOCK_ESTADO || null
if (ESTADO_FORZADO === 'sinConexion') {
  db.dispositivos[0].estado_dispositivo = 'SINCONEX'
  db.dispositivos[0].ultima_conexion = db.hace(6 * 60)
  db.dispositivos[0].nivel_bateria = 34
  for (const l of db.ultimas[1]) l.fecha_hora = db.hace(6 * 60)
}

const esperar = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 300))
const pagina = (results) => ({ count: results.length, next: null, previous: null, results })
const copia = (x) => JSON.parse(JSON.stringify(x))
const noEncontrado = () => {
  throw new ApiError('La API respondió con el estado 404.', 404)
}

// «En vivo»: cada 30 s las lecturas de los dispositivos en línea varían ±0.1.
let vivo = null
function iniciarVivo() {
  if (vivo) return
  vivo = setInterval(() => {
    const ahora = new Date().toISOString()
    for (const d of db.dispositivos) {
      if (d.estado_dispositivo !== 'LINEA') continue
      d.ultima_conexion = ahora
      for (const l of db.ultimas[d.num]) {
        l.valor = (Number(l.valor) + (Math.random() < 0.5 ? -0.1 : 0.1)).toFixed(2)
        l.fecha_hora = ahora
        l.recibida_en = ahora
      }
    }
  }, 30000)
}

// Acceso: cualquier correo y contraseña; error@nucleo.mx devuelve el error de credenciales.
export async function login({ correo }) {
  await esperar()
  if (correo?.trim().toLowerCase() === 'error@nucleo.mx') {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  return { token: 'mock', usuario: copia(db.usuarios.find((u) => u.num === db.USUARIO_SESION)) }
}
export async function logout() {
  await esperar()
  return null
}

// Organizaciones y usuarios
export async function organizacion(num) {
  await esperar()
  return copia(db.organizaciones.find((o) => o.num === Number(num)) ?? noEncontrado())
}
export async function area(num) {
  await esperar()
  return copia(db.areas.find((a) => a.num === Number(num)) ?? noEncontrado())
}
export async function usuarios(params = {}) {
  await esperar()
  return pagina(copia(db.usuarios.filter((u) => (!params.rol || u.rol === params.rol) && (!params.area || u.area === Number(params.area)))))
}

// Dispositivos: el operador solo ve el suyo.
export async function dispositivos() {
  await esperar()
  iniciarVivo()
  return pagina(copia(db.dispositivos))
}
export async function dispositivo(num) {
  await esperar()
  iniciarVivo()
  return copia(db.dispositivos.find((d) => d.num === Number(num)) ?? noEncontrado())
}
export async function ultimasLecturas(num) {
  await esperar()
  iniciarVivo()
  return copia(db.ultimas[Number(num)] ?? noEncontrado())
}
export async function umbrales({ dispositivo } = {}) {
  await esperar()
  return pagina(copia(db.umbrales.filter((u) => !dispositivo || u.dispositivo === Number(dispositivo))))
}

// Serie de las últimas horas: un punto por hora (24) o cada 5 min alrededor de una alerta.
const ONDA = {
  TEMP: [24.8, 24.6, 24.2, 23.6, 23.1, 22.5, 22.0, 21.6, 21.2, 20.9, 20.6, 20.4, 20.3, 20.1, 20.2, 20.9, 21.8, 22.4, 23.2, 24.1, 24.7, 25.3, 24.9, 24.3],
  HUM: [46.1, 46.4, 46.9, 47.2, 47.5, 47.9, 48.4, 48.6, 48.0, 47.7, 47.4, 47.1, 46.8, 46.9, 47.2, 47.6, 48.1, 48.5, 48.4, 48.0, 47.9, 48.1, 48.3, 48.2],
  AIRE: [700, 720, 740, 760, 780, 800, 820, 840, 830, 800, 760, 740, 720, 700, 690, 700, 720, 760, 800, 840, 820, 800, 790, 780],
}
export async function serie({ dispositivo, variable, intervalo, desde, hasta }) {
  await esperar()
  const d = db.dispositivos.find((x) => x.num === Number(dispositivo)) ?? noEncontrado()
  const actual = Number(db.ultimas[d.num].find((l) => l.variable === variable).valor)
  if (intervalo === 'minuto') {
    // Alrededor de una alerta: sube hasta la lectura que la disparó y vuelve a bajar.
    const pico = Number(desde && hasta ? db.alertas.find((a) => a.variable === variable && a.fecha_hora <= hasta && a.fecha_hora >= desde)?.lectura_valor : actual) || actual
    const forma = [0.66, 0.72, 0.79, 0.89, 1, 0.95, 0.77, 0.64]
    const inicio = new Date(desde).getTime()
    return forma.map((f, i) => {
      const v = pico * f
      return { periodo: new Date(inicio + i * 5 * 60000).toISOString(), promedio: v.toFixed(2), minimo: v.toFixed(2), maximo: v.toFixed(2), muestras: 10 }
    })
  }
  const base = ONDA[variable]
  const ajuste = actual - base[base.length - 1]
  const fin = new Date(d.ultima_conexion).getTime()
  return base.map((v, i) => {
    const valor = v + ajuste
    return {
      periodo: new Date(fin - (base.length - 1 - i) * HORA_MS).toISOString(),
      promedio: valor.toFixed(2), minimo: (valor - 0.3).toFixed(2), maximo: (valor + 0.3).toFixed(2), muestras: 120,
    }
  })
}
const HORA_MS = 3600000

// Alertas y notificaciones (el operador solo consulta).
export async function alertas() {
  await esperar()
  return pagina(ESTADO_FORZADO === 'vacio' ? [] : copia(db.alertas))
}
export async function alerta(num) {
  await esperar()
  return copia(db.alertas.find((a) => a.num === Number(num)) ?? noEncontrado())
}
export async function notificaciones() {
  await esperar()
  return pagina(copia(db.notificaciones))
}
