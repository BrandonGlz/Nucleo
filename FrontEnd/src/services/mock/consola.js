// Respuestas simuladas de la consola de administración (admin.<dominio>) con la forma del
// contrato de /consola/: todas las organizaciones, sus usuarios, sesiones y equipos ESP32.
// También simulan la auditoría y las integraciones vistas por el superusuario (?organizacion=).
import { ApiError } from '../api/client'
import * as db from './datos'

const esperar = () => new Promise((r) => setTimeout(r, 250 + Math.random() * 300))
const pagina = (results) => ({ count: results.length, next: null, previous: null, results })
const copia = (x) => structuredClone(x)
const invalido = (datos) => {
  throw new ApiError('La API respondió con el estado 400.', 400, datos)
}
const noEncontrado = () => {
  throw new ApiError('La API respondió con el estado 404.', 404, { detail: 'No encontrado.' })
}
const sinAcentos = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const { hace } = db
const MIN = 60
const HORA = 3600
const DIA = 86400

// Cuenta del superusuario en modo simulado: se entra con plataforma@nucleo.local.
export const PLATAFORMA = {
  num: 100, organizacion: null, area: null, rol: 'ADMINPLAT', estado_usuario: 'ACT', nombre: 'Plataforma',
  primer_apellido: 'Núcleo', segundo_apellido: '', correo: 'plataforma@nucleo.local', telefono: '',
  ultimo_acceso: hace(30), fecha_registro: '2026-07-01T16:00:00Z', acceso_agente: true,
}

const organizaciones = [
  { num: 1, nombre: 'Grupo Altamira', areas: db.areas.map(({ num, nombre }) => ({ num, nombre })) },
  { num: 2, nombre: 'Laboratorios Cedros', areas: [{ num: 4, nombre: 'Farmacia' }, { num: 5, nombre: 'Almacén frío' }] },
]
const orgDe = (num) => organizaciones.find((o) => o.num === Number(num)) ?? null
const areaDe = (num) => organizaciones.flatMap((o) => o.areas).find((a) => a.num === Number(num)) ?? null
const corta = (o) => (o ? { num: o.num, nombre: o.nombre } : null)

const usuarios = [
  ...db.usuarios.map((u, i) => ({ ...u, segundo_factor: ['ADMIN', 'SUPER'].includes(u.rol) && i !== 3 })),
  { ...db.usuarios[0], num: 20, organizacion: 2, area: null, rol: 'ADMIN', nombre: 'Sofía', primer_apellido: 'Treviño', segundo_apellido: 'Lara', correo: 'sofia.trevino@cedros.mx', ultimo_acceso: hace(3 * HORA), segundo_factor: true },
  { ...db.usuarios[1], num: 21, organizacion: 2, area: 4, rol: 'SUPER', nombre: 'Héctor', primer_apellido: 'Ibarra', segundo_apellido: 'Núñez', correo: 'hector.ibarra@cedros.mx', ultimo_acceso: hace(2 * DIA), segundo_factor: false },
  { ...db.usuarios[5], num: 22, organizacion: 2, area: 5, rol: 'OPER', nombre: 'Iván', primer_apellido: 'Delgado', segundo_apellido: '', correo: 'ivan.delgado@cedros.mx', estado_usuario: 'BLQ', ultimo_acceso: hace(6 * DIA), segundo_factor: false },
  { ...PLATAFORMA, segundo_factor: true },
]
const aContrato = (u) => ({
  num: u.num, nombre: u.nombre, primer_apellido: u.primer_apellido, segundo_apellido: u.segundo_apellido ?? '',
  nombre_completo: [u.nombre, u.primer_apellido, u.segundo_apellido].filter(Boolean).join(' '), correo: u.correo,
  organizacion: corta(orgDe(u.organizacion)), area: areaDe(u.area), rol: u.rol, estado_usuario: u.estado_usuario,
  segundo_factor: !!u.segundo_factor, sesiones: sesiones.filter((s) => s.usuario === u.num).length,
  ultimo_acceso: u.ultimo_acceso, fecha_registro: u.fecha_registro,
})

let siguienteSesion = 1
const S = (usuario, cliente, dispositivo, ip, creadaSeg, usoSeg, actual = false) => ({
  id: `s${siguienteSesion++}`, usuario, cliente, dispositivo, ip, creada: hace(creadaSeg), ultimo_uso: hace(usoSeg), actual,
})
let sesiones = [
  S(100, 'web', 'Chrome en Linux', '100.80.9.62', 2 * HORA, 20, true),
  S(1, 'web', 'Chrome en Windows', '187.190.44.12', 3 * DIA, 10),
  S(1, 'app', 'App Núcleo (Android)', '187.190.44.12', 9 * DIA, 25 * MIN),
  S(2, 'web', 'Edge en Windows', '201.141.8.77', DIA, 5 * MIN),
  S(5, 'web', 'Firefox en macOS', '189.203.11.3', 2 * DIA, 25 * MIN),
  S(6, 'app', 'App Núcleo (Android)', '187.190.51.200', 12 * DIA, 2 * MIN),
  S(7, 'app', 'App Núcleo (Android)', '187.190.51.201', 4 * DIA, 12 * MIN),
  S(20, 'web', 'Safari en iPhone', '177.230.9.140', 5 * HORA, 3 * HORA),
]
const sesionAContrato = (s) => {
  const u = usuarios.find((x) => x.num === s.usuario)
  const c = aContrato(u)
  return { ...s, usuario: { num: c.num, nombre_completo: c.nombre_completo, correo: c.correo, rol: c.rol, organizacion: c.organizacion } }
}

const dispositivos = [
  ...db.dispositivos.map((d) => ({
    num: d.num, nombre: d.nombre, codigo_mqtt: d.codigo_mqtt, organizacion: 1, area: d.area, estado: d.estado_dispositivo,
    nivel_bateria: d.nivel_bateria, ultima_conexion: d.ultima_conexion, ultimo_arranque: d.ultimo_arranque,
    intervalo_muestreo_seg: d.intervalo_muestreo_seg, recibe_ota: d.num <= 3,
  })),
  { num: 20, nombre: 'Cedros F-01', codigo_mqtt: 'NC-0501', organizacion: 2, area: 4, estado: 'LINEA', nivel_bateria: 74, ultima_conexion: hace(8), ultimo_arranque: hace(DIA), intervalo_muestreo_seg: 30, recibe_ota: false },
  { num: 21, nombre: 'Cedros AF-01', codigo_mqtt: 'NC-0502', organizacion: 2, area: 5, estado: 'MANT', nivel_bateria: 12, ultima_conexion: hace(2 * DIA), ultimo_arranque: hace(5 * DIA), intervalo_muestreo_seg: 60, recibe_ota: false },
  { num: 22, nombre: 'Cedros AF-02', codigo_mqtt: 'NC-0503', organizacion: 2, area: 5, estado: 'BAJA', nivel_bateria: null, ultima_conexion: null, ultimo_arranque: null, intervalo_muestreo_seg: 60, recibe_ota: false },
]
const dispositivoAContrato = (d) => ({
  ...d, organizacion: corta(orgDe(d.organizacion)), area: areaDe(d.area),
  en_linea: ['LINEA', 'CALENT', 'BATBAJA'].includes(d.estado),
})

const politicas = {
  dias_sesion: 14, intentos_login_por_minuto: 10, roles_2fa_obligatorio: ['ADMINPLAT', 'ADMIN'], dias_auditoria: 365,
  ota_todos: false, actualizado: hace(4 * DIA), actualizado_por: 'Plataforma Núcleo',
}

// Alertas de seguridad (módulo «Alertas») y notificaciones de la campana de la consola.
const usuarioCorto = (num) => {
  const c = aContrato(usuarios.find((u) => u.num === num))
  return { num: c.num, nombre: c.nombre_completo, correo: c.correo }
}
const A = (num, tipo, nivel, estado, titulo, detalle, usuario, ip, eventos, seg, extra = {}) => ({
  num, tipo, nivel, estado, titulo, detalle, usuario: usuario ? usuarioCorto(usuario) : null, ip, eventos,
  creada: hace(seg + 20 * MIN), ultimo_evento: hace(seg), revisada_por: null, fecha_revision: null, nota: '', ...extra,
})
const alertasSeguridad = [
  A(6, 'ip_nueva', 'advertencia', 'nueva', 'Sofía Treviño Lara entró desde una IP nueva', 'No había usado esa dirección en los 30 días anteriores.', 20, '177.230.9.140', 1, 5 * HORA),
  A(5, 'ip_fallidos', 'critico', 'nueva', '12 intentos fallidos desde una misma IP', 'En las últimas 24 horas, con 4 cuentas. Puede ser un intento de adivinar contraseñas.', null, '45.83.12.201', 12, 9 * HORA),
  A(4, 'cuenta_fallidos', 'advertencia', 'nueva', '4 intentos fallidos en la cuenta de Iván Delgado', 'En las últimas 24 horas.', 22, '187.190.60.4', 4, 20 * HORA),
  A(3, 'cuenta_bloqueada', 'advertencia', 'revisada', 'Cuenta bloqueada: Iván Delgado', 'La bloqueó Sofía Treviño Lara. No puede entrar hasta que se desbloquee en Usuarios.', 22, null, 1, 6 * DIA,
    { revisada_por: 'Plataforma Núcleo', fecha_revision: hace(5 * DIA), nota: 'Confirmado con la organización.' }),
  A(2, 'ip_fallidos', 'advertencia', 'descartada', '6 intentos fallidos desde una misma IP', 'En las últimas 24 horas, con una sola cuenta. Puede ser un intento de adivinar contraseñas.', null, '189.203.11.3', 6, 9 * DIA,
    { revisada_por: 'Plataforma Núcleo', fecha_revision: hace(9 * DIA), nota: 'Olvidó su contraseña.' }),
]
let notificacionesSeguridad = alertasSeguridad
  .filter((a) => a.estado === 'nueva' || a.num === 3)
  .map((a, i) => ({ num: 50 - i, alerta: a.num, nivel: a.nivel, fecha: a.creada, leida: a.estado !== 'nueva', correo_enviado: a.nivel === 'critico' ? true : null }))
const prefsAvisos = { niveles_consola: ['advertencia', 'critico'], niveles_correo: ['critico'] }

export async function listaAlertas({ estado, nivel, tipo, q } = {}) {
  await esperar()
  const t = sinAcentos(q)
  return pagina(
    copia(
      alertasSeguridad.filter(
        (a) =>
          (!estado || a.estado === estado) &&
          (!nivel || a.nivel === nivel) &&
          (!tipo || a.tipo === tipo) &&
          (!t || sinAcentos(`${a.titulo} ${a.ip ?? ''} ${a.usuario?.correo ?? ''}`).includes(t)),
      ),
    ),
  )
}

// CSV del mock con las alertas filtradas (como GET /consola/alertas/exportar/).
// Mismo CSV que GET /consola/alertas/exportar/: columnas, orden, BOM y textos que parecerían
// fórmulas (=, +, -, @, tabulador o retorno al inicio) con un apóstrofo delante.
export async function csvAlertas(params) {
  const { results } = await listaAlertas(params)
  const celda = (v) => {
    let t = String(v ?? '')
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`
    return /[",\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
  }
  const cabecera = ['alerta', 'tipo', 'nivel', 'estado', 'titulo', 'detalle', 'usuario', 'correo', 'ip', 'eventos', 'creada', 'ultimo_evento', 'revisada_por', 'fecha_revision', 'nota']
  const filas = results.map((a) =>
    [
      a.num,
      a.tipo,
      a.nivel,
      a.estado,
      a.titulo,
      a.detalle,
      a.usuario?.nombre ?? '',
      a.usuario?.correo ?? '',
      a.ip ?? '',
      a.eventos,
      a.creada,
      a.ultimo_evento,
      a.revisada_por ?? '',
      a.fecha_revision ?? '',
      a.nota ?? '',
    ]
      .map(celda)
      .join(','),
  )
  return '\ufeff' + [cabecera.join(','), ...filas].join('\r\n') + '\r\n'
}

export async function resumenAlertas() {
  await esperar()
  const nuevas = alertasSeguridad.filter((a) => a.estado === 'nueva')
  const tipos = ['ip_fallidos', 'cuenta_fallidos', 'ip_nueva', 'cuenta_bloqueada']
  return {
    nuevas: nuevas.length,
    criticas: nuevas.filter((a) => a.nivel === 'critico').length,
    ultimos_30_dias: alertasSeguridad.length,
    por_tipo: tipos.map((tipo) => ({ tipo, total: alertasSeguridad.filter((a) => a.tipo === tipo).length })),
    sin_2fa: usuarios.filter((u) => politicas.roles_2fa_obligatorio.includes(u.rol) && !u.segundo_factor && u.estado_usuario === 'ACT').length,
  }
}

export async function cerrarAlerta(num, estado, nota = '') {
  await esperar()
  const a = alertasSeguridad.find((x) => x.num === Number(num))
  if (!a) noEncontrado()
  if (a.estado !== 'nueva') invalido({ detail: 'La alerta ya se había revisado o descartado.' })
  Object.assign(a, { estado, nota, revisada_por: 'Plataforma Núcleo', fecha_revision: new Date().toISOString() })
  return copia(a)
}

export async function revisarTodas() {
  await esperar()
  const nuevas = alertasSeguridad.filter((a) => a.estado === 'nueva')
  for (const a of nuevas) Object.assign(a, { estado: 'revisada', revisada_por: 'Plataforma Núcleo', fecha_revision: new Date().toISOString() })
  return { revisadas: nuevas.length }
}

export async function listaNotificaciones() {
  await esperar()
  const visibles = notificacionesSeguridad
    .filter((n) => prefsAvisos.niveles_consola.includes(n.nivel))
    .map((n) => ({ ...n, alerta: copia(alertasSeguridad.find((a) => a.num === n.alerta)) }))
  return { ...pagina(visibles), no_leidas: visibles.filter((n) => !n.leida).length }
}

export async function leerNotificaciones(nums) {
  await esperar()
  let leidas = 0
  notificacionesSeguridad = notificacionesSeguridad.map((n) => {
    if (n.leida || (nums && !nums.includes(n.num))) return n
    leidas += 1
    return { ...n, leida: true }
  })
  return { leidas }
}

export async function leerPreferencias() {
  await esperar()
  return copia(prefsAvisos)
}

export async function guardarPreferencias(cambios) {
  await esperar()
  for (const k of ['niveles_consola', 'niveles_correo']) {
    if (k in cambios) {
      if (cambios[k].some((n) => !['critico', 'advertencia'].includes(n))) invalido({ [k]: ['Nivel no válido.'] })
      prefsAvisos[k] = [...new Set(cambios[k])].sort()
    }
  }
  return copia(prefsAvisos)
}

export async function organizacionesConsola() {
  await esperar()
  return copia(organizaciones)
}

export async function resumen() {
  await esperar()
  const lista = usuarios.filter((u) => u.rol !== 'ADMINPLAT')
  const serie = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DIA * 1000)
    return { dia: d.toISOString().slice(0, 10), exitosos: 8 + ((i * 7) % 11) + (d.getDay() % 6 ? 6 : 0), fallidos: [0, 1, 0, 3, 0, 0, 2, 0, 1, 9, 0, 1, 0, 4][i] }
  })
  const visibles = dispositivos.map(dispositivoAContrato)
  return {
    sesiones_activas: sesiones.length,
    sesiones: { web: sesiones.filter((x) => x.cliente === 'web').length, app: sesiones.filter((x) => x.cliente === 'app').length },
    usuarios: {
      total: lista.length,
      activos: lista.filter((u) => u.estado_usuario === 'ACT').length,
      inactivos: lista.filter((u) => u.estado_usuario === 'INA').length,
      bloqueados: lista.filter((u) => u.estado_usuario === 'BLQ').length,
      sin_2fa_obligatorio: lista.filter((u) => politicas.roles_2fa_obligatorio.includes(u.rol) && !u.segundo_factor).length,
    },
    accesos: { hoy: serie.at(-1).exitosos, fallidos_24h: serie.at(-1).fallidos, fallidos_7d: serie.slice(-7).reduce((s, x) => s + x.fallidos, 0) },
    dispositivos: {
      total: visibles.length,
      en_linea: visibles.filter((d) => d.en_linea).length,
      sin_conexion: visibles.filter((d) => d.estado === 'SINCONEX').length,
      mantenimiento: visibles.filter((d) => d.estado === 'MANT').length,
      baja: visibles.filter((d) => d.estado === 'BAJA').length,
    },
    alertas_seguridad: {
      nuevas: alertasSeguridad.filter((a) => a.estado === 'nueva').length,
      criticas: alertasSeguridad.filter((a) => a.estado === 'nueva' && a.nivel === 'critico').length,
    },
    serie_accesos: serie,
    accesos_por_hora: Array.from({ length: 24 }, (_, h) => ({ hora: h, total: h < 6 ? h % 2 : h < 9 ? 4 + h : h < 19 ? 14 + ((h * 5) % 9) : 22 - h })),
  }
}

export async function listaUsuarios({ organizacion, rol, estado, q } = {}) {
  await esperar()
  const texto = sinAcentos(q)
  return pagina(
    usuarios
      .map(aContrato)
      .filter(
        (u) =>
          (!organizacion || u.organizacion?.num === Number(organizacion)) &&
          (!rol || u.rol === rol) &&
          (!estado || u.estado_usuario === estado) &&
          (!texto || sinAcentos(`${u.nombre_completo} ${u.correo}`).includes(texto)),
      ),
  )
}

export async function crearUsuario(datos) {
  await esperar()
  const errores = {}
  if (!datos.nombre?.trim()) errores.nombre = ['Este campo es obligatorio.']
  if (!datos.primer_apellido?.trim()) errores.primer_apellido = ['Este campo es obligatorio.']
  if (usuarios.some((u) => u.correo === datos.correo?.trim().toLowerCase())) errores.correo = ['Ya existe un usuario con este correo.']
  if ((datos.password ?? '').length < 8) errores.password = ['La contraseña debe tener al menos 8 caracteres.']
  if (Object.keys(errores).length) invalido(errores)
  const u = {
    ...datos, num: Math.max(...usuarios.map((x) => x.num)) + 1, correo: datos.correo.trim().toLowerCase(), estado_usuario: 'ACT',
    segundo_factor: false, ultimo_acceso: null, fecha_registro: new Date().toISOString(),
  }
  usuarios.push(u)
  return aContrato(u)
}

export async function editarUsuario(num, cambios) {
  await esperar()
  const u = usuarios.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (u.rol === 'ADMINPLAT' && (cambios.rol || cambios.estado_usuario)) invalido({ detail: 'No puedes cambiar tu propio rol ni tu estado.' })
  Object.assign(u, cambios)
  return aContrato(u)
}

export async function restablecer(num) {
  await esperar()
  const u = usuarios.find((x) => x.num === Number(num)) ?? noEncontrado()
  return { detail: `Se envió a ${u.correo} el enlace para crear una contraseña nueva.` }
}
export async function quitar2fa(num) {
  await esperar()
  const u = usuarios.find((x) => x.num === Number(num)) ?? noEncontrado()
  u.segundo_factor = false
  return { detail: 'Se quitó la verificación en dos pasos.' }
}
export async function cerrarSesionesDe(num) {
  await esperar()
  const antes = sesiones.length
  sesiones = sesiones.filter((s) => s.usuario !== Number(num) || s.actual)
  return { cerradas: antes - sesiones.length }
}

export async function listaSesiones({ organizacion, cliente, q } = {}) {
  await esperar()
  const texto = sinAcentos(q)
  return pagina(
    sesiones
      .map(sesionAContrato)
      .filter(
        (s) =>
          (!organizacion || s.usuario.organizacion?.num === Number(organizacion)) &&
          (!cliente || s.cliente === cliente) &&
          (!texto || sinAcentos(`${s.usuario.nombre_completo} ${s.usuario.correo} ${s.ip} ${s.dispositivo}`).includes(texto)),
      ),
  )
}
export async function cerrarSesion(id) {
  await esperar()
  const s = sesiones.find((x) => x.id === id) ?? noEncontrado()
  if (s.actual) invalido({ detail: 'No puedes cerrar desde aquí la sesión con la que estás viendo la consola.' })
  sesiones = sesiones.filter((x) => x.id !== id)
  return null
}

export async function listaDispositivos({ organizacion, estado, q } = {}) {
  await esperar()
  const texto = sinAcentos(q)
  return pagina(
    dispositivos
      .map(dispositivoAContrato)
      .filter(
        (d) =>
          (!organizacion || d.organizacion.num === Number(organizacion)) &&
          (!estado || d.estado === estado) &&
          (!texto || sinAcentos(`${d.nombre} ${d.codigo_mqtt}`).includes(texto)),
      ),
  )
}
export async function editarDispositivo(num, cambios) {
  await esperar()
  const d = dispositivos.find((x) => x.num === Number(num)) ?? noEncontrado()
  if (cambios.estado === 'ACTIVO') d.estado = d.ultima_conexion && Date.now() - new Date(d.ultima_conexion) < 5 * MIN * 1000 ? 'LINEA' : 'SINCONEX'
  else if (cambios.estado) d.estado = cambios.estado
  if (cambios.recibe_ota != null) d.recibe_ota = cambios.recibe_ota
  return dispositivoAContrato(d)
}
export async function firmware() {
  await esperar()
  return { version: '1.4.2', publicada: hace(3 * DIA), ota_todos: politicas.ota_todos, dispositivos_ota: dispositivos.filter((d) => d.recibe_ota).length }
}

export async function leerPoliticas() {
  await esperar()
  return copia(politicas)
}
export async function guardarPoliticas(cambios) {
  await esperar()
  const errores = {}
  const rango = (campo, min, max) => {
    if (cambios[campo] == null) return
    const n = Number(cambios[campo])
    if (!Number.isInteger(n) || n < min || n > max) errores[campo] = [`Debe ser un número entre ${min} y ${max}.`]
  }
  rango('dias_sesion', 1, 90)
  rango('intentos_login_por_minuto', 3, 60)
  rango('dias_auditoria', 30, 3650)
  if (Object.keys(errores).length) invalido(errores)
  Object.assign(politicas, cambios, { actualizado: new Date().toISOString(), actualizado_por: 'Plataforma Núcleo' })
  return copia(politicas)
}

// Auditoría de todas las organizaciones (o de una con ?organizacion=).
const auditorias = [
  [1, 1, 'LOGIN', 'Inicio de sesión', null, null, 'Entró desde la web.', '187.190.44.12', 10],
  [2, null, 'LOGIN_FALLIDO', 'Inicio de sesión fallido', null, null, 'Contraseña incorrecta para andres.villalobos@grupoaltamira.mx.', '45.83.12.201', 5 * DIA],
  [3, 2, 'MODIFICAR', 'Modificación', 'umbral', 11, null, '201.141.8.77', 5 * HORA, { peligro_max: { antes: '26.00', despues: '27.00' } }],
  [4, 20, 'CREAR', 'Creación', 'usuario', 21, 'Alta de Héctor Ibarra.', '177.230.9.140', 2 * DIA],
  [5, 1, 'EXPORTAR', 'Exportación de datos', 'lecturas', null, 'CSV de lecturas de Moldeo.', '187.190.44.12', DIA],
  [6, 22, 'LOGIN_FALLIDO', 'Inicio de sesión fallido', null, null, 'Cuenta bloqueada tras varios intentos.', '187.190.60.4', 6 * DIA],
].map(([num, usuario, accion, accion_nombre, recurso, recurso_num, descripcion, ip, seg, cambios]) => {
  const u = usuarios.find((x) => x.num === usuario)
  return {
    num, organizacion: u?.organizacion ?? 1, usuario, usuario_nombre: u ? `${u.nombre} ${u.primer_apellido}` : null,
    usuario_correo: u?.correo ?? null, accion, accion_nombre, recurso, recurso_num, descripcion, cambios: cambios ?? null, ip,
    fecha_hora: hace(seg),
  }
})
export async function auditoria({ organizacion, accion, desde } = {}) {
  await esperar()
  return pagina(
    auditorias.filter(
      (r) => (!organizacion || r.organizacion === Number(organizacion)) && (!accion || r.accion === accion) && (!desde || r.fecha_hora >= desde),
    ),
  )
}

// Integraciones por organización.
const tokens = [
  { num: 1, organizacion: 1, nombre: 'ERP de mantenimiento', prefijo: 'a1b2c3', activo: true, ultimo_uso: hace(2 * HORA), fecha_expiracion: null },
]
const webhooks = [
  { num: 1, organizacion: 1, nombre: 'Canal de guardia', url: 'https://hooks.ejemplo.mx/nucleo', eventos: ['alerta.nueva'], activo: true, ultimo_envio: hace(DIA), ultimo_estado: '200', fallos_consecutivos: 0 },
]
const deOrg = (lista, organizacion) => {
  if (!organizacion) invalido({ organizacion: ['Elige la organización.'] })
  return pagina(copia(lista.filter((x) => x.organizacion === Number(organizacion))))
}
export async function listaTokens(organizacion) {
  await esperar()
  return deOrg(tokens, organizacion)
}
export async function crearToken(datos, organizacion) {
  await esperar()
  if (!datos.nombre?.trim()) invalido({ nombre: ['Este campo es obligatorio.'] })
  const t = { num: tokens.length + 1, organizacion: Number(organizacion), prefijo: Math.random().toString(16).slice(2, 8), activo: true, ultimo_uso: null, fecha_expiracion: datos.fecha_expiracion ?? null, nombre: datos.nombre }
  tokens.push(t)
  return { ...copia(t), clave: `nuc_${t.prefijo}_${Math.random().toString(36).slice(2)}` }
}
export async function revocarToken(num) {
  await esperar()
  const t = tokens.find((x) => x.num === Number(num)) ?? noEncontrado()
  t.activo = false
  return null
}
export async function listaWebhooks(organizacion) {
  await esperar()
  return deOrg(webhooks, organizacion)
}
export async function crearWebhook(datos, organizacion) {
  await esperar()
  if (!/^https:\/\/.+/.test(datos.url ?? '')) invalido({ url: ['La URL debe empezar con https://'] })
  const w = { ...datos, num: webhooks.length + 1, organizacion: Number(organizacion), activo: true, ultimo_envio: null, ultimo_estado: '', fallos_consecutivos: 0 }
  webhooks.push(w)
  return { ...copia(w), secreto: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) }
}
export async function editarWebhook(num, cambios) {
  await esperar()
  const w = webhooks.find((x) => x.num === Number(num)) ?? noEncontrado()
  Object.assign(w, cambios)
  return copia(w)
}
export async function borrarWebhook(num) {
  await esperar()
  const i = webhooks.findIndex((x) => x.num === Number(num))
  if (i < 0) noEncontrado()
  webhooks.splice(i, 1)
  return null
}
export async function probarWebhook() {
  await esperar()
  return { exito: true, estado: '200' }
}
