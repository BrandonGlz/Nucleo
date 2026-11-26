// Imitan cada endpoint con un retraso de 300–600 ms y devuelven la forma del contrato.
// Los errores llevan `status` como ApiError de services/api/client.js.
import { ApiError } from '../api/client'
import { cifrasHoja } from '../cifrasReporte'
import { PLATAFORMA } from './consola'
import * as db from './datos'
import { formatos as formatosDatos, formatoPredeterminado } from './formatos'

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
const PUEDEN_REPORTES = ['ADMIN', 'SUPER', 'ANALISTA']

// Acceso: se entra con el correo de cualquier cuenta de datos.js (cualquier contraseña).
// Un correo desconocido entra con la cuenta del rol de VITE_MOCK_ROL; error@nucleo.mx
// devuelve el error de credenciales y una cuenta inactiva, el 403.
export async function login({ correo }) {
  await esperar()
  const buscado = correo?.trim().toLowerCase()
  if (buscado === 'error@nucleo.mx') {
    throw new ApiError('La API respondió con el estado 400.', 400)
  }
  // plataforma@nucleo.local (o VITE_MOCK_ROL=ADMINPLAT) entra como superusuario: consolas admin. y nicoai.
  if (buscado === PLATAFORMA.correo || (!buscado && rolMock() === 'ADMINPLAT')) return { token: 'mock', usuario: copia(PLATAFORMA) }
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
// Foto de perfil: valida tipo y tamaño como la API, recorta al centro a 256×256 en WebP (data URL)
// y la guarda en la cuenta de la sesión (la que SesionContext tiene en localStorage).
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const FOTO_MAXIMO = 5 * 1024 * 1024
function cuentaDeSesion() {
  let num = null
  try {
    num = JSON.parse(localStorage.getItem('nucleo.usuario'))?.num ?? null
  } catch {
    // Sin almacenamiento: la cuenta del rol de VITE_MOCK_ROL.
  }
  num ??= USUARIO_POR_ROL[rolMock()] ?? 2
  if (num === PLATAFORMA.num) return PLATAFORMA
  return db.usuarios.find((u) => u.num === num) ?? noEncontrado()
}
const errorFoto = (mensaje) => {
  throw new ApiError('La API respondió con el estado 400.', 400, { foto: [mensaje] })
}
async function recortarFoto(archivo) {
  let imagen
  try {
    imagen = await createImageBitmap(archivo)
  } catch {
    errorFoto('El archivo no es una imagen válida (JPEG, PNG o WebP).')
  }
  const lado = Math.min(imagen.width, imagen.height)
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = 256
  lienzo
    .getContext('2d')
    .drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, 256, 256)
  imagen.close?.()
  return lienzo.toDataURL('image/webp', 0.85)
}
export async function subirFoto(archivo) {
  await esperar()
  if (!archivo) errorFoto('Adjunta la foto en el campo «foto».')
  if (archivo.size > FOTO_MAXIMO) errorFoto('La foto no puede pasar de 5 MB.')
  if (!FOTO_TIPOS.includes(archivo.type)) errorFoto('Sube una imagen JPEG, PNG o WebP.')
  const cuenta = cuentaDeSesion()
  cuenta.foto_url = await recortarFoto(archivo)
  return copia(cuenta)
}
export async function quitarFoto() {
  await esperar()
  const cuenta = cuentaDeSesion()
  cuenta.foto_url = null
  return copia(cuenta)
}

// Logo de la organización en modo simulado: hasta 2 MB y 600×200, sin recortar (data URL PNG).
const LOGO_TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const LOGO_MAXIMO = 2 * 1024 * 1024
const errorLogo = (mensaje) => {
  throw new ApiError('La API respondió con el estado 400.', 400, { logo: [mensaje] })
}
async function ajustarLogo(archivo) {
  let imagen
  try {
    imagen = await createImageBitmap(archivo)
  } catch {
    errorLogo('El archivo no es una imagen válida (PNG, JPEG o WebP).')
  }
  const escala = Math.min(1, 600 / imagen.width, 200 / imagen.height)
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, Math.round(imagen.width * escala))
  lienzo.height = Math.max(1, Math.round(imagen.height * escala))
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close?.()
  return lienzo.toDataURL('image/png')
}
export async function subirLogo(num, archivo) {
  await esperar()
  const o = db.organizaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (!archivo) errorLogo('Adjunta el logo en el campo «logo».')
  if (archivo.size > LOGO_MAXIMO) errorLogo('El logo no puede pasar de 2 MB.')
  if (!LOGO_TIPOS.includes(archivo.type)) errorLogo('Sube una imagen PNG, JPEG o WebP.')
  o.logo_url = await ajustarLogo(archivo)
  return copia(o)
}
export async function quitarLogo(num) {
  await esperar()
  const o = db.organizaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  o.logo_url = null
  return copia(o)
}
export async function cambiarPassword({ password_actual, password_nueva }) {
  await esperar()
  if (!password_actual) throw new ApiError('La API respondió con el estado 400.', 400)
  if (!password_nueva || password_nueva.length < 8) throw new ApiError('La API respondió con el estado 400.', 400)
  return null
}

// Organizaciones y usuarios
const contrasteConBlanco = (color) => {
  const canales = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  const lineales = canales.map((canal) =>
    canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4,
  )
  const luminancia = 0.2126 * lineales[0] + 0.7152 * lineales[1] + 0.0722 * lineales[2]
  return 1.05 / (luminancia + 0.05)
}
const validarColorMock = (color) => {
  if (color == null || color === '') return null
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new ApiError('La API respondió con el estado 400.', 400, {
      color_reporte: ['Usa un color en formato #RRGGBB.'],
    })
  }
  const normalizado = color.toUpperCase()
  if (contrasteConBlanco(normalizado) < 3) {
    throw new ApiError('La API respondió con el estado 400.', 400, {
      color_reporte: ['El color no tiene contraste suficiente con el blanco: el texto no se leería.'],
    })
  }
  return normalizado
}
export async function organizaciones() {
  await esperar()
  return pagina(copia(db.organizaciones))
}
export async function actualizarOrganizacion(num, cambios) {
  await esperar()
  const o = db.organizaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (cambios.nombre != null && !String(cambios.nombre).trim()) throw new ApiError('La API respondió con el estado 400.', 400)
  if ('color_reporte' in cambios) cambios.color_reporte = validarColorMock(cambios.color_reporte)
  Object.assign(o, cambios)
  return copia(o)
}
export async function crearOrganizacion(datos) {
  await esperar()
  if (!String(datos.nombre ?? '').trim()) throw new ApiError('La API respondió con el estado 400.', 400)
  if ('color_reporte' in datos) datos.color_reporte = validarColorMock(datos.color_reporte)
  const o = { num: Math.max(0, ...db.organizaciones.map((x) => x.num)) + 1, estado: 'ACTIVA', fecha_registro: new Date().toISOString(), ...datos }
  db.organizaciones.push(o)
  return copia(o)
}
export async function primerAdministrador(num, datos) {
  await esperar()
  if (!db.organizaciones.some((x) => x.num === Number(num))) noEncontrado()
  const { password: _p, ...resto } = datos
  return { num: 1000 + Number(num), rol: 'ADMIN', organizacion: Number(num), ...resto }
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
// Como la API: la nota (qué se hizo o por qué se descarta) es obligatoria, de 5 a 500 caracteres.
function resolver(num, estado, observaciones) {
  const a = db.alertas.find((x) => x.num === num) ?? noEncontrado()
  if (a.estado !== 'PENDIENTE') throw new ApiError('La API respondió con el estado 409.', 409)
  const nota = String(observaciones ?? '').trim()
  const falta = estado === 'DESCARTADA' ? 'Escribe por qué se descarta la alerta.' : 'Escribe qué se hizo para atender la alerta.'
  const problema = !nota ? falta : nota.length < 5 ? 'Describe con al menos 5 caracteres.' : nota.length > 500 ? 'La nota no puede pasar de 500 caracteres.' : null
  if (problema) throw new ApiError('La API respondió con el estado 400.', 400, { observaciones: [problema] })
  Object.assign(a, { estado, observaciones: nota, atendida_por: 2, fecha_atencion: new Date().toISOString() })
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

// Avisos de la campana (dispositivos, usuarios, reportes, Nico AI) con su marca de leído.
// Paginado como DRF (?page, ?page_size; 50 por página).
export async function avisos({ tipo, no_leidos, page = 1, page_size = 50 } = {}) {
  await esperar()
  const filas = db.avisos
    .filter((a) => (!tipo || a.tipo === tipo) && (!no_leidos || !a.leido))
    .sort((x, y) => (x.fecha_hora < y.fecha_hora ? 1 : -1))
  const [num, tam] = [Number(page), Number(page_size)]
  const desde = (num - 1) * tam
  if (desde > 0 && desde >= filas.length) noEncontrado()
  return {
    count: filas.length,
    next: desde + tam < filas.length ? `/avisos/?page=${num + 1}` : null,
    previous: num > 1 ? `/avisos/?page=${num - 1}` : null,
    results: copia(filas.slice(desde, desde + tam)),
  }
}
export async function conteoAvisos() {
  await esperar()
  return { no_leidos: db.avisos.filter((a) => !a.leido).length }
}
export async function marcarAvisosLeidos({ nums } = {}) {
  await esperar()
  const todos = !nums?.length
  let marcados = 0
  for (const a of db.avisos) {
    if (!a.leido && (todos || nums.includes(a.num))) {
      a.leido = true
      marcados++
    }
  }
  return { marcados }
}

// Reportes
const formatoDe = (num) =>
  formatosDatos.find((f) => f.num === Number(num) && f.activo) ?? formatoPredeterminado()

const prepararReporte = (r) => {
  // La primera vez que se consulta se fija la versión del formato, como en la base real.
  if (r.formato == null) {
    const inicial = formatoPredeterminado()
    Object.assign(r, {
      formato: inicial.num,
      formato_nombre: inicial.nombre,
      formato_version: inicial.version,
      formato_conf: copia(inicial.conf),
    })
  }
  const org = db.organizaciones.find((o) => o.num === r.organizacion) ?? db.organizaciones[0]
  return copia({
    ...r,
    estado: r.estado ?? 'LISTO',
    error: r.error ?? null,
    archivado: r.archivado ?? false,
    organizacion_nombre: org?.nombre ?? '',
    organizacion_logo_url: org?.logo_url ?? null,
    organizacion_color: org?.color_reporte ?? null,
  })
}

export async function reportes(params = {}) {
  await esperar()
  let lista = db.reportes.map(prepararReporte)
  if (!['1', 'true'].includes(String(params.archivados ?? '').toLowerCase())) {
    lista = lista.filter((r) => !r.archivado)
  }
  if (params.q) {
    const q = String(params.q).toLowerCase()
    lista = lista.filter((r) => String(r.cifras?.titulo ?? '').toLowerCase().includes(q))
  }
  if (params.area) {
    const area = Number(params.area)
    lista = lista.filter((r) => r.area === area || (r.areas ?? []).includes(area))
  }
  if (params.formato) lista = lista.filter((r) => r.formato === Number(params.formato))
  if (params.origen) lista = lista.filter((r) => r.origen === params.origen)
  if (params.estado) lista = lista.filter((r) => r.estado === params.estado)
  if (params.desde) lista = lista.filter((r) => r.fecha_generacion >= params.desde)
  if (params.hasta) lista = lista.filter((r) => r.fecha_generacion <= params.hasta)
  return pagina(lista)
}

export async function archivarReporte(num) {
  await esperar()
  const r = db.reportes.find((x) => x.num === Number(num)) ?? noEncontrado()
  r.archivado = true
  return prepararReporte(r)
}

export async function desarchivarReporte(num) {
  await esperar()
  const r = db.reportes.find((x) => x.num === Number(num)) ?? noEncontrado()
  r.archivado = false
  return prepararReporte(r)
}

// Como el procesador del servidor: el reporte nace GENERANDO y queda LISTO unos segundos después.
const procesarEnCola = (reporte) => {
  setTimeout(() => {
    const r = db.reportes.find((x) => x.num === reporte.num)
    if (r && r.estado === 'GENERANDO') r.estado = 'LISTO'
  }, 6000)
}

export async function repetirReporte(num, datos) {
  await esperar()
  const original = db.reportes.find((x) => x.num === Number(num)) ?? noEncontrado()
  const nuevo = {
    ...copia(original),
    num: Math.max(...db.reportes.map((r) => r.num)) + 1,
    periodo_inicio: datos.periodo_inicio,
    periodo_fin: datos.periodo_fin,
    estado: 'GENERANDO',
    error: null,
    archivado: false,
    fecha_generacion: new Date().toISOString(),
  }
  db.reportes.unshift(nuevo)
  procesarEnCola(nuevo)
  return prepararReporte(nuevo)
}
const prepararProgramacion = (p) => {
  const formato = p.formato ? formatoDe(p.formato) : null
  return copia({
    ...p,
    formato: formato?.num ?? p.formato ?? null,
    formato_nombre: formato?.nombre ?? p.formato_nombre ?? '',
  })
}

export async function programaciones() {
  await esperar()
  return pagina(db.programaciones.map(prepararProgramacion))
}

export async function crearProgramacion(datos) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const formato = datos.formato ? formatoDe(datos.formato) : null
  const nueva = {
    num: Math.max(...db.programaciones.map((p) => p.num)) + 1,
    organizacion: 1,
    area: datos.area ? Number(datos.area) : null,
    areas: [],
    creada_por: USUARIO_POR_ROL[rolMock()] ?? 2,
    formato: formato?.num ?? null,
    formato_nombre: formato?.nombre ?? '',
    frecuencia: datos.frecuencia,
    hora: datos.hora || '08:00:00',
    dia_semana: datos.frecuencia === 'SEMANAL' ? Number(datos.dia_semana) : null,
    dia_mes: datos.frecuencia === 'MENSUAL' ? Number(datos.dia_mes) : null,
    destinatarios: [...datos.destinatarios],
    activa: true,
    proxima_ejecucion: new Date(Date.now() + 86400000).toISOString(),
    ultima_ejecucion: null,
    fecha_creacion: new Date().toISOString(),
  }
  db.programaciones.push(nueva)
  return prepararProgramacion(nueva)
}

export async function actualizarProgramacion(num, cambios) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const p = db.programaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (cambios.formato !== undefined) {
    const formato = cambios.formato ? formatoDe(cambios.formato) : null
    p.formato = formato?.num ?? null
    p.formato_nombre = formato?.nombre ?? ''
  }
  for (const campo of ['frecuencia', 'hora', 'dia_semana', 'dia_mes', 'destinatarios', 'activa']) {
    if (cambios[campo] !== undefined) p[campo] = cambios[campo]
  }
  if (p.frecuencia !== 'SEMANAL') p.dia_semana = null
  if (p.frecuencia !== 'MENSUAL') p.dia_mes = null
  if (cambios.activa === true) p.proxima_ejecucion = new Date(Date.now() + 86400000).toISOString()
  return prepararProgramacion(p)
}

export async function probarProgramacion(num) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const p = db.programaciones.find((x) => x.num === Number(num)) ?? noEncontrado()
  const base = db.reportes.find((r) => r.area === p.area) ?? db.reportes[0]
  const formato = p.formato ? formatoDe(p.formato) : formatoPredeterminado()
  return copia({
    ...base,
    num: Math.max(...db.reportes.map((r) => r.num)) + 1,
    area: p.area,
    areas: [],
    origen: 'PROGRAMADO',
    formato: formato.num,
    formato_nombre: formato.nombre,
    formato_version: formato.version,
    formato_conf: formato.conf,
    periodo_inicio: new Date(Date.now() - 86400000).toISOString(),
    periodo_fin: new Date().toISOString(),
    fecha_generacion: new Date().toISOString(),
  })
}

// Título del alcance con las mismas reglas que servicios.texto_alcance.
function nombreAlcance(numeros) {
  const lista = [...new Set(numeros.map(Number))]
  if (!lista.length) return 'Toda la organización'
  const nombres = db.areas
    .filter((a) => lista.includes(a.num))
    .map((a) => a.nombre)
    .sort((a, b) => a.localeCompare(b, 'es'))
  if (nombres.length > 3) return `${nombres.length} áreas`
  if (nombres.length === 3) return `${nombres[0]}, ${nombres[1]} y ${nombres[2]}`
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`
  return nombres[0]
}

const NOMBRES_VARIABLE = { TEMP: 'Temperatura', HUM: 'Humedad relativa', AIRE: 'Calidad del aire' }

function completarCifrasNuevas(cifras, dispositivos) {
  const variables = Object.entries(cifras.variables ?? {})
  const alertas = cifras.alertas?.total ?? 0
  const porDispositivo = Object.entries(cifras.dispositivos ?? {}).map(([codigo], i) => {
    const equipo = dispositivos.find((d) => d.codigo_mqtt === codigo)
    const fila = { codigo, nombre: equipo?.nombre ?? codigo, area: equipo?.area_nombre ?? '' }
    for (const [variable, info] of variables) {
      const dec = variable === 'AIRE' ? 0 : 1
      fila[variable] = {
        minimo: +(info.promedio - (i + 1) * 0.3).toFixed(dec),
        promedio: info.promedio,
        maximo: +(info.promedio + (i + 1) * 0.4).toFixed(dec),
      }
    }
    return fila
  })
  return {
    cumplimiento: Object.fromEntries(
      variables.map(([variable, info]) => [
        variable,
        {
          dentro_pct: +(100 - (cifras.alertas?.por_variable?.[variable] ?? 0) * 1.5).toFixed(1),
          fuera_min: +((cifras.alertas?.por_variable?.[variable] ?? 0) * 3.5).toFixed(1),
          lecturas: info.muestras,
        },
      ]),
    ),
    comparativo: {
      periodo: cifras.periodo,
      variables: variables.map(([variable, info], i) => {
        const anterior = +(info.promedio - 0.4 * (i + 1)).toFixed(variable === 'AIRE' ? 0 : 1)
        const cambio = +(info.promedio - anterior).toFixed(variable === 'AIRE' ? 0 : 1)
        return {
          variable,
          nombre: info.nombre,
          unidad: info.unidad,
          promedio: info.promedio,
          minimo: info.minimo,
          maximo: info.maximo,
          promedio_previo: anterior,
          minimo_previo: info.minimo,
          maximo_previo: info.maximo,
          dif_promedio: cambio,
          dif_promedio_pct: anterior ? +((cambio / anterior) * 100).toFixed(1) : null,
          mejora: cambio <= 0,
        }
      }),
      alertas: {
        total: alertas,
        total_previo: alertas + 2,
        diferencia: -2,
        diferencia_pct: alertas ? +((-2 / (alertas + 2)) * 100).toFixed(1) : null,
        mejora: true,
      },
    },
    por_dispositivo: porDispositivo,
    gestion_alertas: {
      estados: {
        ATENDIDA: Math.max(0, alertas - 1),
        DESCARTADA: 1,
        PENDIENTE: 1,
      },
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
          huecos: [{ inicio: cifras.periodo?.inicio, minutos: 12 }],
        },
      ]),
    ),
    incidentes: porDispositivo.length
      ? [
          {
            dispositivo: porDispositivo[0].nombre,
            dispositivo_codigo: porDispositivo[0].codigo,
            area: porDispositivo[0].area,
            variable: variables[0]?.[0] ?? 'TEMP',
            variable_nombre: NOMBRES_VARIABLE[variables[0]?.[0]] ?? 'Temperatura',
            inicio: cifras.periodo?.inicio,
            duracion_min: 42,
            valor_pico: variables[0]?.[1]?.maximo ?? 0,
            nivel: 'ADVERTENCIA',
          },
        ]
      : [],
    observaciones: porDispositivo.length
      ? [
          {
            fecha: cifras.periodo?.inicio,
            dispositivo: porDispositivo[0].nombre,
            dispositivo_codigo: porDispositivo[0].codigo,
            area: porDispositivo[0].area,
            variable: variables[0]?.[1]?.nombre ?? 'Temperatura',
            variable_codigo: variables[0]?.[0] ?? 'TEMP',
            variable_nombre: NOMBRES_VARIABLE[variables[0]?.[0]] ?? 'Temperatura',
            usuario: 'Ana López',
            texto: 'Se revisó el área y se cerró la puerta del andén.',
          },
        ]
      : [],
  }
}

function cifrasDeVista(numeros, desde, hasta) {
  const dias = Math.max(1, Math.round((new Date(hasta) - new Date(desde)) / 86400000))
  const fin = new Date(hasta)
  fin.setDate(fin.getDate() - 1)
  const cifras = cifrasSimuladas(dias, 0, fin)
  const dispositivos = db.dispositivos.filter((d) => !numeros.length || numeros.includes(d.area))
  cifras.alcance = nombreAlcance(numeros)
  cifras.periodo = { inicio: desde, fin: hasta }
  cifras.dispositivos = Object.fromEntries(
    dispositivos.map((d) => [
      d.codigo_mqtt,
      { nombre: d.nombre, area: db.areas.find((a) => a.num === d.area)?.nombre ?? '' },
    ]),
  )
  const equipos = dispositivos.map((d) => ({ ...d, area_nombre: db.areas.find((a) => a.num === d.area)?.nombre ?? '' }))
  Object.assign(cifras, completarCifrasNuevas(cifras, equipos))
  return cifras
}

export async function vistaPreviaReporte({ areas = [], desde, hasta }) {
  await esperar()
  if (!PUEDEN_REPORTES.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const inicio = new Date(desde)
  const final = new Date(hasta)
  const dias = (final - inicio) / 86400000
  if (!(dias > 0)) {
    throw new ApiError('La API respondió con el estado 400.', 400, {
      desde: ['Debe ser anterior al fin del periodo.'],
    })
  }
  if (dias > 31) {
    throw new ApiError('La API respondió con el estado 400.', 400, {
      hasta: ['El periodo no puede durar más de 31 días.'],
    })
  }
  const numeros = [...new Set(areas.map(Number))]
  if (numeros.some((num) => !db.areas.some((a) => a.num === num))) {
    throw new ApiError('La API respondió con el estado 400.', 400, {
      areas: ['Hay áreas que no existen o no están a su alcance.'],
    })
  }
  const alcance = numeros.length
    ? numeros
    : rolMock() !== 'ADMIN' && cuentaDeSesion().area
      ? [cuentaDeSesion().area]
      : []
  return { cifras: cifrasDeVista(alcance, desde, hasta), areas: alcance }
}

export async function crearReporte({ area, areas = [], formato, periodo_inicio, periodo_fin }) {
  await esperar()
  if (!PUEDEN_REPORTES.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const pedidas = areas.length ? areas.map(Number) : area ? [Number(area)] : []
  // Como la API: sin alcance explícito, un usuario con área reporta solo su área.
  const numeros = pedidas.length
    ? pedidas
    : rolMock() !== 'ADMIN' && cuentaDeSesion().area
      ? [cuentaDeSesion().area]
      : []
  const base = db.reportes.find((r) => r.area === numeros[0]) ?? db.reportes[0]
  const elegido = formatoDe(formato ?? formatoPredeterminado().num)
  // Las mismas cifras que muestra la vista previa para este alcance y periodo.
  const cifras = cifrasDeVista(numeros, periodo_inicio, periodo_fin)
  const nombres = Object.fromEntries(db.dispositivos.map((d) => [d.codigo_mqtt, d.nombre]))
  const nuevo = {
    ...copia(base), num: Math.max(...db.reportes.map((r) => r.num)) + 1,
    area: numeros.length === 1 ? numeros[0] : null,
    areas: numeros.length > 1 ? numeros : [],
    generado_por: 2, origen: 'MANUAL', periodo_inicio, periodo_fin, fecha_generacion: new Date().toISOString(),
    cifras: cifrasHoja(cifras, { area: cifras.alcance, nombres }),
    contenido: base.contenido,
    formato: elegido.num, formato_nombre: elegido.nombre, formato_version: elegido.version, formato_conf: elegido.conf,
    estado: 'GENERANDO', error: null, archivado: false,
  }
  db.reportes.unshift(nuevo)
  procesarEnCola(nuevo)
  return copia(nuevo)
}
export async function cambiarFormatoReporte(num, formato) {
  await esperar()
  const r = db.reportes.find((x) => x.num === Number(num)) ?? noEncontrado()
  const elegido = formatoDe(formato)
  Object.assign(r, {
    formato: elegido.num,
    formato_nombre: elegido.nombre,
    formato_version: elegido.version,
    formato_conf: elegido.conf,
  })
  return prepararReporte(r)
}
export async function descargarReporte() {
  await esperar()
  return new Blob(['%PDF-1.4\n% Reporte simulado de Núcleo\n'], { type: 'application/pdf' })
}

export async function descargarReporteCsv() {
  await esperar()
  const filas = [
    'Fecha y hora local,Dispositivo,Área,Variable,Valor,Unidad,Estabilizada',
    '2026-11-20 10:00:00,Núcleo T-01,Moldeo,Temperatura,23.60,°C,Sí',
    '2026-11-20 10:00:00,Núcleo T-01,Moldeo,Humedad relativa,46.00,%HR,Sí',
  ]
  return new Blob([`\ufeff${filas.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
}

// Formatos de reporte
const PUEDEN_EDITAR = ['ADMIN', 'SUPER']
const formatoSalida = (f) => {
  const { versiones: _versiones, ...resto } = f
  return copia(resto)
}
const nombreLibre = (base) => {
  const usados = new Set(formatosDatos.map((f) => f.nombre))
  if (!usados.has(base)) return base
  let n = 2
  while (usados.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

export async function formatos({ archivados = false } = {}) {
  await esperar()
  const visibles = formatosDatos.filter(
    (f) => f.es_plantilla || archivados || f.activo,
  )
  return pagina(visibles.map(formatoSalida))
}
export async function crearFormato({ nombre, conf }) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const nuevo = {
    num: Math.max(...formatosDatos.map((f) => f.num)) + 1,
    nombre,
    plantilla: '',
    predeterminado: false,
    activo: true,
    es_plantilla: false,
    version: 1,
    conf,
    creado_por_nombre: 'Ana López',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: new Date().toISOString(), creada_por_nombre: 'Ana López' }],
  }
  formatosDatos.push(nuevo)
  return formatoSalida(nuevo)
}
export async function actualizarFormato(num, cambios) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const f = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (f.es_plantilla) throw new ApiError('La API respondió con el estado 403.', 403)
  if (cambios.nombre != null) f.nombre = cambios.nombre
  if (cambios.conf != null) {
    f.conf = cambios.conf
    f.version += 1
    f.versiones.push({ numero: f.version, fecha: new Date().toISOString(), creada_por_nombre: 'Ana López' })
  }
  return formatoSalida(f)
}
export async function archivarFormato(num) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const f = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (f.es_plantilla) throw new ApiError('La API respondió con el estado 403.', 403)
  f.activo = false
  f.predeterminado = false
  f.areas_predeterminado = []
  return null
}
export async function duplicarFormato(num, { nombre } = {}) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const original = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  const copiaFormato = {
    num: Math.max(...formatosDatos.map((f) => f.num)) + 1,
    nombre: nombreLibre(nombre || `Copia de ${original.nombre}`),
    plantilla: '',
    predeterminado: false,
    activo: true,
    es_plantilla: false,
    version: 1,
    conf: copia(original.conf),
    creado_por_nombre: 'Ana López',
    areas_predeterminado: [],
    versiones: [{ numero: 1, fecha: new Date().toISOString(), creada_por_nombre: 'Ana López' }],
  }
  formatosDatos.push(copiaFormato)
  return formatoSalida(copiaFormato)
}
export async function predeterminadoFormato(num) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const f = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (f.es_plantilla) throw new ApiError('La API respondió con el estado 403.', 403)
  for (const otro of formatosDatos) if (!otro.es_plantilla) otro.predeterminado = false
  f.predeterminado = true
  return formatoSalida(f)
}
export async function areasFormato(num, areas) {
  await esperar()
  if (!PUEDEN_EDITAR.includes(rolMock())) throw new ApiError('La API respondió con el estado 403.', 403)
  const f = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (f.es_plantilla) throw new ApiError('La API respondió con el estado 403.', 403)
  for (const otro of formatosDatos) {
    if (otro !== f) {
      otro.areas_predeterminado = otro.areas_predeterminado.filter(
        (area) => !areas.includes(area),
      )
    }
  }
  f.areas_predeterminado = areas
  return formatoSalida(f)
}
export async function versionesFormato(num) {
  await esperar()
  const f = formatosDatos.find((x) => x.num === Number(num)) ?? noEncontrado()
  return copia(f.versiones)
}

// Agente IA: hay un agente por dispositivo (cada ESP32). La respuesta se arma con los datos del
// dispositivo elegido. Con ?agente=caido en la URL responde 503.
export async function preguntarAgente(pregunta, dispositivo) {
  await esperar()
  if (new URLSearchParams(window.location.search).get('agente') === 'caido') {
    throw new ApiError('La API respondió con el estado 503.', 503)
  }
  const d = db.dispositivos.find((x) => x.num === Number(dispositivo)) ?? db.dispositivos[4]
  const t = pregunta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/(compara|comparativ|cooperativa|versus|contra)/.test(t)) return comparativaSimulada(d, t)
  if (/(grafica|grafico|diagrama|dashboard|tablero)/.test(t)) return graficaSimulada(d, t)
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

// Cifras con la misma forma que las de la API (servicios.calcular_cifras) para las gráficas
// sueltas y comparativas de Nico AI.
function cifrasSimuladas(dias, desfase = 0, fin = new Date()) {
  const base = { TEMP: [24.5, '°C', 'Temperatura'], HUM: [55, '%HR', 'Humedad relativa'], AIRE: [540, 'ppm', 'Calidad del aire (eCO2)'] }
  const hoy = fin
  const variables = {}
  const series = {}
  for (const [v, [b, unidad, nombre]] of Object.entries(base)) {
    const paso = v === 'AIRE' ? 40 : 1.2
    series[v] = Array.from({ length: dias }, (_, i) => {
      const f = new Date(hoy)
      f.setDate(hoy.getDate() - (dias - 1 - i))
      const p = b + desfase * paso + Math.sin(i * 1.3) * paso * 2
      return { t: f.toISOString(), promedio: +p.toFixed(1), minimo: +(p - paso).toFixed(1), maximo: +(p + paso * 2).toFixed(1) }
    })
    const ps = series[v].map((x) => x.promedio)
    variables[v] = {
      nombre, unidad, muestras: dias * 2880,
      promedio: +(ps.reduce((a, x) => a + x, 0) / dias).toFixed(1),
      minimo: Math.min(...series[v].map((x) => x.minimo)),
      maximo: Math.max(...series[v].map((x) => x.maximo)),
    }
  }
  return {
    variables, series, intervalo_serie: 'dia',
    dispositivos: { 'NUC-A01': {}, 'NUC-A02': {} },
    alertas: { total: 3 + desfase, por_variable: { HUM: 2 + desfase, TEMP: 1, AIRE: 0 }, por_nivel: {}, por_estado: {} },
  }
}

function graficaSimulada(d, t) {
  const mes = /mes/.test(t)
  const dias = mes ? 30 : 7
  const descripcion = mes ? 'este mes' : 'los últimos 7 días'
  const cifras = cifrasSimuladas(dias)
  const elemento = /alerta/.test(t) ? 'alertas' : /cifras|indicadores/.test(t) ? 'cifras' : 'serie'
  const variable = /temperatura/.test(t) ? 'TEMP' : /aire/.test(t) ? 'AIRE' : 'HUM'
  const fin = new Date()
  const inicio = new Date(fin.getTime() - dias * 86400000)
  const info = cifras.variables[variable]
  return {
    texto: elemento === 'serie'
      ? `La ${info.nombre.toLowerCase()} de ${d.nombre}, ${descripcion}: promedió ${info.promedio} ${info.unidad}, con mínimo de ${info.minimo} y máximo de ${info.maximo} ${info.unidad}.`
      : `${elemento === 'alertas' ? 'Alertas por variable' : 'Cifras clave'} de ${d.nombre}, ${descripcion}.`,
    grafica: { elemento, variable, donde: d.nombre, descripcion, periodo_inicio: inicio.toISOString(), periodo_fin: fin.toISOString(), cifras },
  }
}

function comparativaSimulada(d, t) {
  if (/dispositivos|equipos/.test(t))
    return {
      texto: `Dispositivos del área, los últimos 7 días: ${d.nombre} tuvo la humedad más alta (57.2 %HR).`,
      comparativa: {
        tipo: 'dispositivos', donde: 'Almacén', descripcion: 'los últimos 7 días',
        filas: [
          { variable: 'TEMP', nombre: 'temperatura', unidad: '°C', puntos: [[d.nombre, 25.1], ['Núcleo A-02', 24.3], ['Núcleo A-03', 23.8]] },
          { variable: 'HUM', nombre: 'humedad relativa', unidad: '%HR', puntos: [[d.nombre, 57.2], ['Núcleo A-03', 54.9], ['Núcleo A-02', 52.4]] },
        ],
        alertas: [[d.nombre, 3], ['Núcleo A-02', 1], ['Núcleo A-03', 0]],
      },
    }
  const a = cifrasSimuladas(7, 1).variables
  const b = cifrasSimuladas(7, 0).variables
  const fila = (v, nombre) => ({ variable: v, nombre, unidad: a[v].unidad, a: { promedio: a[v].promedio }, b: { promedio: b[v].promedio } })
  return {
    texto: `${d.nombre}: esta semana contra el mismo tramo de la semana pasada. La humedad relativa promedió ${a.HUM.promedio} %HR, ${(a.HUM.promedio - b.HUM.promedio).toFixed(1)} %HR más que antes. Hubo 4 alertas contra 3.`,
    comparativa: {
      tipo: 'periodos', donde: d.nombre, columnas: ['esta semana', 'el mismo tramo de la semana pasada'],
      filas: [fila('TEMP', 'temperatura'), fila('HUM', 'humedad relativa'), fila('AIRE', 'calidad del aire')],
      alertas: [4, 3],
    },
  }
}
