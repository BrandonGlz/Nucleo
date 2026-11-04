import { AccesoPage } from './acceso/AccesoPage'
import { AgentePage } from './agente/AgentePage'
import { AlertasPage } from './alertas/AlertasPage'
import { DetalleDispositivo } from './dispositivos/DetalleDispositivo'
import { DispositivosPage } from './dispositivos/DispositivosPage'
import { MedicionesPage } from './mediciones/MedicionesPage'
import { NotificacionesPage } from './notificaciones/NotificacionesPage'
import { OrganizacionesPage } from './organizaciones/OrganizacionesPage'
import { PanelPage } from './panel/PanelPage'
import { PerfilPage } from './perfil/PerfilPage'
import { ReportesPage } from './reportes/ReportesPage'
import { UmbralesPage } from './umbrales/UmbralesPage'
import { UsuariosPage } from './usuarios/UsuariosPage'

// Registro único de módulos: App.jsx crea las rutas y MainLayout el menú a partir de esta lista.
// seccion e icono los ubican en el menú lateral; sin seccion la ruta existe pero no aparece en él.
// roles limita quién ve el módulo (sin roles, todos los de la organización).
export const modulos = [
  { ruta: '/panel', titulo: 'Panel', Pagina: PanelPage, seccion: 'Monitoreo', icono: 'layout-dashboard' },
  { ruta: '/dispositivos', titulo: 'Dispositivos', Pagina: DispositivosPage, seccion: 'Monitoreo', icono: 'cpu' },
  { ruta: '/dispositivos/:num', titulo: 'Detalle de dispositivo', Pagina: DetalleDispositivo },
  { ruta: '/mediciones', titulo: 'Histórico', Pagina: MedicionesPage, seccion: 'Monitoreo', icono: 'history' },
  { ruta: '/alertas', titulo: 'Alertas', Pagina: AlertasPage, seccion: 'Monitoreo', icono: 'bell' },
  { ruta: '/reportes', titulo: 'Reportes', Pagina: ReportesPage, seccion: 'Análisis', icono: 'file-text', roles: ['ADMIN', 'SUPER', 'ANALISTA'] },
  { ruta: '/agente', titulo: 'Agente IA', Pagina: AgentePage, seccion: 'Análisis', icono: 'sparkles' },
  { ruta: '/umbrales', titulo: 'Umbrales', Pagina: UmbralesPage, seccion: 'Configuración', icono: 'sliders-horizontal' },
  { ruta: '/usuarios', titulo: 'Usuarios', Pagina: UsuariosPage, seccion: 'Configuración', icono: 'users', roles: ['ADMIN', 'SUPER'] },
  { ruta: '/organizaciones', titulo: 'Organización', Pagina: OrganizacionesPage, seccion: 'Configuración', icono: 'building-2', roles: ['ADMIN'] },
  { ruta: '/perfil', titulo: 'Mi perfil', Pagina: PerfilPage },
  { ruta: '/notificaciones', titulo: 'Notificaciones', Pagina: NotificacionesPage },
]

// La pantalla de acceso va fuera del marco con menú.
export const acceso = { ruta: '/acceso', titulo: 'Acceso', Pagina: AccesoPage }
