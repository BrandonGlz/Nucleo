// Imitan cada endpoint con un retraso de 300–600 ms y devuelven la forma del contrato.
// Los errores llevan `status` como ApiError de services/api/client.js.
import { ApiError } from '../api/client'
import * as db from './datos'

const esperar = () => new Promise((r) => setTimeout(r, 300 + Math.random() * 300))
const pagina = (results) => ({ count: results.length, next: null, previous: null, results })
const copia = (x) => structuredClone(x)
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

const rolMock = () => import.meta.env.VITE_MOCK_ROL || 'SUPER'
const USUARIO_POR_ROL = { ADMIN: 1, SUPER: 2, ANALISTA: 5, OPER: 7 }

// Acceso
export async function login({ correo }) {
  await esperar()
  if (correo === 'error@nucleo.mx') {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  const usuario = db.usuarios.find((u) => u.num === (USUARIO_POR_ROL[rolMock()] ?? 2))
  return { token: 'mock', usuario: copia(usuario) }
}
export async function logout() {
  await esperar()
  return null
}
export async function cambiarPassword({ password_actual, password_nueva }) {
  await esperar()
  if (!password_actual) throw new ApiError('La API respondió con el estado 400.', 400)
  if (!password_nueva || password_nueva.length < 8) throw new ApiError('La API respondió con el estado 400.', 400)
  return null
}

// Organizaciones y usuarios
export async function organizaciones() {
  await esperar()
  return pagina(copia(db.organizaciones))
}
export async function areas() {
  await esperar()
  return pagina(copia(db.areas))
}
export async function usuarios() {
  await esperar()
  return pagina(copia(db.usuarios))
}
export async function crearUsuario(datos) {
  await esperar()
  const nuevo = {
    num: Math.max(...db.usuarios.map((u) => u.num)) + 1, organizacion: 1, estado_usuario: 'ACT',
    segundo_apellido: '', telefono: '', ultimo_acceso: null, fecha_registro: new Date().toISOString(),
    ...datos,
  }
  delete nuevo.password
  db.usuarios.push(nuevo)
  return copia(nuevo)
}
export async function actualizarUsuario(num, cambios) {
  await esperar()
  const u = db.usuarios.find((x) => x.num === num) ?? noEncontrado()
  Object.assign(u, cambios)
  return copia(u)
}

// Dispositivos
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
export async function actualizarDispositivo(num, cambios) {
  await esperar()
  const d = db.dispositivos.find((x) => x.num === Number(num)) ?? noEncontrado()
  const s = Number(cambios.intervalo_muestreo_seg)
  if (!(s >= 5 && s <= 120)) {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  d.intervalo_muestreo_seg = s
  return copia(d)
}
export async function ultimasLecturas(num) {
  await esperar()
  iniciarVivo()
  return copia(db.ultimas[Number(num)] ?? noEncontrado())
}

// Umbrales
export async function umbrales({ dispositivo } = {}) {
  await esperar()
  return pagina(copia(db.umbrales.filter((u) => !dispositivo || u.dispositivo === Number(dispositivo))))
}
export async function guardarUmbral(num, cambios) {
  await esperar()
  const u = db.umbrales.find((x) => x.num === num) ?? noEncontrado()
  const [a, b, c, d] = ['peligro_min', 'advertencia_min', 'advertencia_max', 'peligro_max'].map((k) =>
    Number(cambios[k] ?? u[k]),
  )
  if (!(a <= b && b < c && c <= d)) throw new ApiError('La API respondió con el estado 400.', 400)
  Object.assign(u, cambios, { configurado_por: 2, fecha_actualizacion: new Date().toISOString() })
  return copia(u)
}

// Mediciones
function curva(disp, variable, puntos) {
  const fija = db.CURVAS[`${disp}:${variable}`]
  if (fija) return fija.slice(-puntos)
  const actual = Number(db.ultimas[disp].find((l) => l.variable === variable).valor)
  const paso = variable === 'AIRE' ? 18 : 0.35
  return Array.from({ length: puntos }, (_, i) => {
    const k = puntos - 1 - i
    return Number((actual + Math.sin(k * 0.9 + disp) * paso * 2 - k * paso * 0.15).toFixed(2))
  })
}
export async function serie({ dispositivo, variable }) {
  await esperar()
  const d = db.dispositivos.find((x) => x.num === Number(dispositivo)) ?? noEncontrado()
  const fin = new Date(d.ultima_conexion).getTime()
  const valores = curva(d.num, variable, d.estado_dispositivo === 'LINEA' ? 14 : 12)
  return valores.map((v, i) => ({
    periodo: new Date(fin - (valores.length - 1 - i) * 1800000).toISOString(),
    promedio: v.toFixed(2), minimo: (v - 0.3).toFixed(2), maximo: (v + 0.3).toFixed(2), muestras: 60,
  }))
}
export async function lecturas({ dispositivo }) {
  await esperar()
  const d = db.dispositivos.find((x) => x.num === Number(dispositivo)) ?? noEncontrado()
  const fin = new Date(d.ultima_conexion).getTime()
  const filas = []
  for (let i = 0; i < 40; i++) {
    const t = fin - i * d.intervalo_muestreo_seg * 1000
    for (const l of db.ultimas[d.num]) {
      const delta = l.variable === 'AIRE' ? Math.round(Math.sin(i) * 4) : Number((i * 0.02).toFixed(2))
      filas.push({
        num: 700000 + d.num * 1000 + i * 3 + filas.length % 3, dispositivo: d.num,
        sensor_num: d.num * 10 + (l.variable === 'AIRE' ? 2 : 0), variable_codigo: l.variable,
        unidad: l.unidad, valor: (Number(l.valor) - delta).toFixed(2),
        fecha_hora: new Date(t).toISOString(), recibida_en: new Date(t + 1200).toISOString(), estabilizada: true,
      })
    }
  }
  return pagina(filas)
}

// Alertas y notificaciones
export async function alertas() {
  await esperar()
  return pagina(copia(db.alertas))
}
function resolver(num, estado, observaciones) {
  const a = db.alertas.find((x) => x.num === num) ?? noEncontrado()
  if (a.estado !== 'PENDIENTE') throw new ApiError('La API respondió con el estado 409.', 409)
  Object.assign(a, { estado, observaciones: observaciones || '', atendida_por: 2, fecha_atencion: new Date().toISOString() })
  return copia(a)
}
export async function atenderAlerta(num, { observaciones } = {}) {
  await esperar()
  return resolver(num, 'ATENDIDA', observaciones)
}
export async function descartarAlerta(num, { observaciones } = {}) {
  await esperar()
  return resolver(num, 'DESCARTADA', observaciones)
}
export async function notificaciones() {
  await esperar()
  return pagina(copia(db.notificaciones))
}

// Reportes
export async function reportes() {
  await esperar()
  return pagina(copia(db.reportes))
}
export async function programaciones() {
  await esperar()
  return pagina(copia(db.programaciones))
}
export async function crearReporte({ area, periodo_inicio, periodo_fin }) {
  await esperar()
  const base = db.reportes.find((r) => r.area === Number(area)) ?? db.reportes[0]
  const nuevo = {
    ...copia(base), num: Math.max(...db.reportes.map((r) => r.num)) + 1, area: area ? Number(area) : null,
    generado_por: 2, origen: 'MANUAL', periodo_inicio, periodo_fin, fecha_generacion: new Date().toISOString(),
  }
  db.reportes.unshift(nuevo)
  return copia(nuevo)
}

// Agente IA: respuesta fija. Con ?agente=caido en la URL responde 503.
export async function preguntarAgente(pregunta) {
  await esperar()
  if (new URLSearchParams(window.location.search).get('agente') === 'caido') {
    throw new ApiError('La API respondió con el estado 503.', 503)
  }
  const fuera = !/humedad|temperatura|aire|sensor|alerta|dispositivo|reporte|pico|área|area/i.test(pregunta)
  if (fuera) return { texto: 'Solo puedo responder sobre los sensores de tu organización.' }
  return {
    texto: 'Hubo tres lecturas sobre el máximo de humedad esta semana en Núcleo L-07. Todas fueron por la tarde, cerca del cambio de turno.',
    picos: [
      { cuando: 'Jue 22 · 15:10', valor: 72.4 },
      { cuando: 'Mié 21 · 14:55', valor: 66.1 },
      { cuando: 'Lun 19 · 15:20', valor: 63.8 },
    ],
    serie: [52, 63.8, 51, 54, 66.1, 52, 55, 72.4, 58, 53],
    unidad: '%HR',
    maximo: 60,
  }
}
