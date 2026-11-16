import { lazy } from 'react'

// Secciones de la consola de administración: ruta, menú y página (cada una se descarga al abrirla).
// Nombres e iconos iguales a los de la web y la consola de Nico AI: Panel (layout-dashboard),
// Alertas (bell), Usuarios (users), Dispositivos (cpu), Notificaciones (bell, fuera del menú).
export const SECCIONES = [
  { ruta: '/', titulo: 'Panel', icono: 'layout-dashboard', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/PanelAdmin')) },
  { ruta: '/alertas', titulo: 'Alertas', icono: 'bell', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/AlertasAdmin')) },
  { ruta: '/auditoria', titulo: 'Auditoría', icono: 'scroll-text', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/AuditoriaAdmin')) },
  { ruta: '/politicas', titulo: 'Políticas', icono: 'shield-check', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/PoliticasAdmin')) },
  { ruta: '/usuarios', titulo: 'Usuarios', icono: 'users', grupo: 'Accesos', Pagina: lazy(() => import('./paginas/UsuariosAdmin')) },
  { ruta: '/sesiones', titulo: 'Sesiones abiertas', icono: 'monitor-smartphone', grupo: 'Accesos', Pagina: lazy(() => import('./paginas/SesionesAdmin')) },
  { ruta: '/dispositivos', titulo: 'Dispositivos', icono: 'cpu', grupo: 'Dispositivos', Pagina: lazy(() => import('./paginas/DispositivosAdmin')) },
  { ruta: '/firmware', titulo: 'Cargar firmware', icono: 'usb', grupo: 'Dispositivos', Pagina: lazy(() => import('./paginas/FirmwareAdmin')) },
  { ruta: '/integraciones', titulo: 'Integraciones', icono: 'webhook', grupo: 'Dispositivos', Pagina: lazy(() => import('./paginas/IntegracionesAdmin')) },
]
// Fuera del menú: la bandeja de la campana.
export const OCULTAS = [
  { ruta: '/notificaciones', titulo: 'Notificaciones', icono: 'bell', Pagina: lazy(() => import('./paginas/NotificacionesAdmin')) },
]
export const GRUPOS = ['Seguridad', 'Accesos', 'Dispositivos']
