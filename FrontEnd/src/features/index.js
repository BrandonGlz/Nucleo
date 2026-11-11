import { lazy } from 'react'
import { AccesoPage } from './acceso/AccesoPage'

// Cada sección se descarga al abrirla: la primera carga solo trae el marco y el acceso.
const AgentePage = lazy(() => import('./agente/AgentePage').then((m) => ({ default: m.AgentePage })))
const AlertasPage = lazy(() => import('./alertas/AlertasPage').then((m) => ({ default: m.AlertasPage })))
const AreasPage = lazy(() => import('./areas/AreasPage').then((m) => ({ default: m.AreasPage })))
const DetalleDispositivo = lazy(() => import('./dispositivos/DetalleDispositivo').then((m) => ({ default: m.DetalleDispositivo })))
const DispositivosPage = lazy(() => import('./dispositivos/DispositivosPage').then((m) => ({ default: m.DispositivosPage })))
const MedicionesPage = lazy(() => import('./mediciones/MedicionesPage').then((m) => ({ default: m.MedicionesPage })))
const OrganizacionesPage = lazy(() => import('./organizaciones/OrganizacionesPage').then((m) => ({ default: m.OrganizacionesPage })))
const NotificacionesPage = lazy(() => import('./notificaciones/NotificacionesPage').then((m) => ({ default: m.NotificacionesPage })))
const PanelPage = lazy(() => import('./panel/PanelPage').then((m) => ({ default: m.PanelPage })))
const PerfilPage = lazy(() => import('./perfil/PerfilPage').then((m) => ({ default: m.PerfilPage })))
const ReportesPage = lazy(() => import('./reportes/ReportesPage').then((m) => ({ default: m.ReportesPage })))
const UmbralesPage = lazy(() => import('./umbrales/UmbralesPage').then((m) => ({ default: m.UmbralesPage })))
const UsuariosPage = lazy(() => import('./usuarios/UsuariosPage').then((m) => ({ default: m.UsuariosPage })))

// Registro único de módulos: App.jsx crea las rutas y MainLayout el menú a partir de esta lista.
// seccion e icono los ubican en el menú lateral; sin seccion la ruta existe pero no aparece en él.
// roles limita quién ve el módulo (sin roles, todos los de la organización; el administrador de
// plataforma, que no tiene organización, solo ve los que lo nombran).
export const modulos = [
  { ruta: '/organizaciones', titulo: 'Organizaciones', Pagina: OrganizacionesPage, seccion: 'Plataforma', icono: 'building-2', roles: ['ADMINPLAT'] },
  { ruta: '/panel', titulo: 'Panel', Pagina: PanelPage, seccion: 'Monitoreo', icono: 'layout-dashboard' },
  { ruta: '/dispositivos', titulo: 'Dispositivos', Pagina: DispositivosPage, seccion: 'Monitoreo', icono: 'cpu' },
  { ruta: '/dispositivos/:num', titulo: 'Detalle de dispositivo', Pagina: DetalleDispositivo },
  { ruta: '/mediciones', titulo: 'Histórico', Pagina: MedicionesPage, seccion: 'Monitoreo', icono: 'history' },
  { ruta: '/alertas', titulo: 'Alertas', Pagina: AlertasPage, seccion: 'Monitoreo', icono: 'bell' },
  { ruta: '/reportes', titulo: 'Reportes', Pagina: ReportesPage, seccion: 'Análisis', icono: 'file-text', roles: ['ADMIN', 'SUPER', 'ANALISTA'] },
  { ruta: '/agente', titulo: 'Nico AI', Pagina: AgentePage, seccion: 'Análisis', icono: 'sparkles' },
  { ruta: '/umbrales', titulo: 'Umbrales', Pagina: UmbralesPage, seccion: 'Configuración', icono: 'sliders-horizontal' },
  { ruta: '/usuarios', titulo: 'Usuarios', Pagina: UsuariosPage, seccion: 'Configuración', icono: 'users', roles: ['ADMIN', 'SUPER'] },
  { ruta: '/areas', titulo: 'Empresa y áreas', Pagina: AreasPage, seccion: 'Áreas', icono: 'map-pin', roles: ['ADMIN', 'SUPER'] },
  { ruta: '/perfil', titulo: 'Mi perfil', Pagina: PerfilPage },
  { ruta: '/notificaciones', titulo: 'Notificaciones', Pagina: NotificacionesPage },
]

export const puedeVer = (m, rol) => (m.roles ? m.roles.includes(rol) : rol !== 'ADMINPLAT')
// Pantalla de inicio de cada rol al entrar.
export const inicioDe = (rol) => (rol === 'ADMINPLAT' ? '/organizaciones' : '/panel')

// La pantalla de acceso va fuera del marco con menú.
export const acceso = { ruta: '/acceso', titulo: 'Acceso', Pagina: AccesoPage }
