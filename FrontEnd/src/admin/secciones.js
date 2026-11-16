import { lazy } from 'react'

// Secciones de la consola de administración: ruta, menú y página (cada una se descarga al abrirla).
export const SECCIONES = [
  { ruta: '/', titulo: 'Resumen', icono: 'layout-dashboard', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/ResumenAdmin')) },
  { ruta: '/auditoria', titulo: 'Auditoría', icono: 'scroll-text', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/AuditoriaAdmin')) },
  { ruta: '/politicas', titulo: 'Políticas', icono: 'shield-check', grupo: 'Seguridad', Pagina: lazy(() => import('./paginas/PoliticasAdmin')) },
  { ruta: '/usuarios', titulo: 'Usuarios y roles', icono: 'users', grupo: 'Accesos', Pagina: lazy(() => import('./paginas/UsuariosAdmin')) },
  { ruta: '/sesiones', titulo: 'Sesiones abiertas', icono: 'monitor-smartphone', grupo: 'Accesos', Pagina: lazy(() => import('./paginas/SesionesAdmin')) },
  { ruta: '/dispositivos', titulo: 'Equipos ESP32', icono: 'cpu', grupo: 'Dispositivos', Pagina: lazy(() => import('./paginas/DispositivosAdmin')) },
  { ruta: '/integraciones', titulo: 'Integraciones', icono: 'webhook', grupo: 'Dispositivos', Pagina: lazy(() => import('./paginas/IntegracionesAdmin')) },
]
export const GRUPOS = ['Seguridad', 'Accesos', 'Dispositivos']
