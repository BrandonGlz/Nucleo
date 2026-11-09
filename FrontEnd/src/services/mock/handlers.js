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

// Acceso: se entra con el correo de cualquier cuenta de datos.js (cualquier contraseña).
// Un correo desconocido entra con la cuenta del rol de VITE_MOCK_ROL; error@nucleo.mx
// devuelve el error de credenciales y una cuenta inactiva, el 403.
export async function login({ correo }) {
  await esperar()
  const buscado = correo?.trim().toLowerCase()
  if (buscado === 'error@nucleo.mx') {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  const usuario =
    db.usuarios.find((u) => u.correo === buscado) ??
    db.usuarios.find((u) => u.num === (USUARIO_POR_ROL[rolMock()] ?? 2))
  if (usuario.estado_usuario !== 'ACT') throw new ApiError('La API respondió con el estado 403.', 403)
  usuario.ultimo_acceso = new Date().toISOString()
  return { token: 'mock', usuario: copia(usuario) }
}
// Cuentas de prueba que ofrece la pantalla de acceso: una por rol y la inactiva.
export function cuentasDemo() {
  return copia(db.usuarios)
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
export async function actualizarOrganizacion(num, cambios) {
  await esperar()
  const o = db.organizaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (cambios.nombre != null && !String(cambios.nombre).trim()) throw new ApiError('La API respondió con el estado 400.', 400)
  Object.assign(o, cambios)
  return copia(o)
}
export async function areas() {
  await esperar()
  return pagina(copia(db.areas))
}
export async function crearArea(datos) {
  await esperar()
  const nombre = datos.nombre?.trim()
  if (!nombre || db.areas.some((a) => a.nombre.toLowerCase() === nombre.toLowerCase())) {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  const nueva = { num: Math.max(0, ...db.areas.map((a) => a.num)) + 1, organizacion: 1, nombre, descripcion: datos.descripcion ?? '' }
  db.areas.push(nueva)
  return copia(nueva)
}
export async function actualizarArea(num, cambios) {
  await esperar()
  const a = db.areas.find((x) => x.num === Number(num)) ?? noEncontrado()
  const nombre = cambios.nombre?.trim()
  if (cambios.nombre != null && (!nombre || db.areas.some((x) => x.num !== a.num && x.nombre.toLowerCase() === nombre.toLowerCase()))) {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  Object.assign(a, cambios, nombre ? { nombre } : {})
  return copia(a)
}
// Un área con dispositivos o usuarios no se puede borrar (409), como en la API.
export async function eliminarArea(num) {
  await esperar()
  const i = db.areas.findIndex((x) => x.num === Number(num))
  if (i < 0) noEncontrado()
  const n = Number(num)
  if (db.dispositivos.some((d) => d.area === n) || db.usuarios.some((u) => u.area === n)) {
    throw new ApiError('La API respondió con el estado 409.', 409)
  }
  db.areas.splice(i, 1)
  return null
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
  if (cambios.area != null) {
    if (!db.areas.some((a) => a.num === Number(cambios.area))) throw new ApiError('La API respondió con el estado 400.', 400)
    d.area = Number(cambios.area)
    // El operador asignado debe ser del área: al mover el dispositivo se le quita.
    const op = db.usuarios.find((u) => u.num === d.operador)
    if (op && op.area !== d.area) d.operador = null
  }
  if (cambios.intervalo_muestreo_seg != null) {
    const s = Number(cambios.intervalo_muestreo_seg)
    if (!(s >= 5 && s <= 120)) {
      throw new ApiError('La API respondió con el estado 400.', 400)
    }
    d.intervalo_muestreo_seg = s
  }
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

// Agente IA: hay un agente por dispositivo (cada ESP32). La respuesta se arma con los datos del
// dispositivo elegido. Con ?agente=caido en la URL responde 503.
export async function preguntarAgente(pregunta, dispositivo) {
  await esperar()
  if (new URLSearchParams(window.location.search).get('agente') === 'caido') {
    throw new ApiError('La API respondió con el estado 503.', 503)
  }
  const d = db.dispositivos.find((x) => x.num === Number(dispositivo)) ?? db.dispositivos[4]
  const fuera = !/humedad|temperatura|aire|sensor|alerta|dispositivo|reporte|pico|área|area|bater|conex/i.test(pregunta)
  if (fuera) return { texto: `Solo puedo responder sobre ${d.nombre} y sus sensores.` }
  const variable = /temperatura/i.test(pregunta) ? 'TEMP' : /aire/i.test(pregunta) ? 'AIRE' : 'HUM'
  const umbral = db.umbrales.find((u) => u.dispositivo === d.num && u.variable === variable)
  const maximo = Number(umbral.advertencia_max)
  const actual = Number(db.ultimas[d.num].find((l) => l.variable === variable).valor)
  const paso = variable === 'AIRE' ? 60 : 1.6
  const picos = [
    { cuando: 'Jue 22 · 15:10', valor: Math.max(actual, maximo) + paso * 3 },
    { cuando: 'Mié 21 · 14:55', valor: maximo + paso * 1.5 },
    { cuando: 'Lun 19 · 15:20', valor: maximo + paso * 0.6 },
  ]
  const base = maximo - paso * 4
  const etiqueta = { TEMP: 'temperatura', HUM: 'humedad', AIRE: 'calidad del aire' }[variable]
  return {
    texto: `Hubo tres lecturas sobre el máximo de ${etiqueta} esta semana en ${d.nombre}. Todas fueron por la tarde, cerca del cambio de turno.`,
    picos,
    serie: [base, picos[2].valor, base - paso, base + paso, picos[1].valor, base, base + paso * 2, picos[0].valor, base + paso * 3, base + paso],
    unidad: UNIDAD_VAR[variable],
    maximo,
  }
}
const UNIDAD_VAR = { TEMP: '°C', HUM: '%HR', AIRE: 'ppm' }
