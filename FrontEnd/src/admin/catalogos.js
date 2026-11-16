import { ROL } from '../utils/convertir'

// Catálogos de la consola de administración: etiquetas y tonos de lo que manda la API.

export const ROLES = ['ADMINPLAT', 'ADMIN', 'SUPER', 'ANALISTA', 'OPER']
// Roles que se pueden dar desde la consola (el de plataforma no se asigna a nadie más).
export const ROLES_ALTA = ['ADMIN', 'SUPER', 'ANALISTA', 'OPER']
export const opcionesRol = (roles = ROLES_ALTA) => roles.map((r) => ({ value: r, label: ROL[r] }))

export const ESTADO_USUARIO = {
  ACT: { label: 'Activo', tone: 'success' },
  INA: { label: 'De baja', tone: 'offline' },
  BLQ: { label: 'Bloqueado', tone: 'danger' },
}

export const ESTADO_EQUIPO = {
  LINEA: { label: 'En línea', tone: 'success' },
  CALENT: { label: 'Calentando', tone: 'warning' },
  SINCONEX: { label: 'Sin conexión', tone: 'offline' },
  BATBAJA: { label: 'Batería baja', tone: 'warning' },
  MANT: { label: 'Mantenimiento', tone: 'warning' },
  BAJA: { label: 'Baja', tone: 'offline' },
}

export const NIVEL_ALERTA = {
  critico: { label: 'Crítico', tone: 'danger', icon: 'octagon-alert' },
  advertencia: { label: 'Advertencia', tone: 'warning', icon: 'triangle-alert' },
}
export const TIPO_ALERTA = {
  ip_fallidos: { label: 'Intentos fallidos por IP', icon: 'shield-alert' },
  cuenta_fallidos: { label: 'Intentos fallidos en una cuenta', icon: 'lock' },
  ip_nueva: { label: 'Acceso desde una IP nueva', icon: 'signal' },
  cuenta_bloqueada: { label: 'Cuenta bloqueada', icon: 'user-x' },
  sin_2fa: { label: 'Sin verificación en dos pasos', icon: 'shield-off' },
}
export const ESTADO_ALERTA = {
  nueva: { label: 'Nueva', tone: 'danger', icon: 'bell' },
  revisada: { label: 'Revisada', tone: 'success', icon: 'circle-check' },
  descartada: { label: 'Descartada', tone: 'offline', icon: 'circle-x' },
}

export const CLIENTE = {
  web: { label: 'Web', icon: 'layout-grid' },
  app: { label: 'App', icon: 'smartphone' },
}
