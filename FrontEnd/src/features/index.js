import { AccesoPage } from './acceso/AccesoPage'
import { AgentePage } from './agente/AgentePage'
import { AlertasPage } from './alertas/AlertasPage'
import { AreasPage } from './areas/AreasPage'
import { DetalleDispositivo } from './dispositivos/DetalleDispositivo'
import { DispositivosPage } from './dispositivos/DispositivosPage'
import { MedicionesPage } from './mediciones/MedicionesPage'
import { OrganizacionesPage } from './organizaciones/OrganizacionesPage'
import { NotificacionesPage } from './notificaciones/NotificacionesPage'
import { PanelPage } from './panel/PanelPage'
import { PerfilPage } from './perfil/PerfilPage'
import { ReportesPage } from './reportes/ReportesPage'
import { UmbralesPage } from './umbrales/UmbralesPage'
import { UsuariosPage } from './usuarios/UsuariosPage'

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
  { ruta: '/agente', titulo: 'Núcleo AI', Pagina: AgentePage, seccion: 'Análisis', icono: 'sparkles' },
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
