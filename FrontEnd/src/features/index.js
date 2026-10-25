import { AccesoPage } from './acceso/AccesoPage'
import { AlertasPage } from './alertas/AlertasPage'
import { DispositivosPage } from './dispositivos/DispositivosPage'
import { MedicionesPage } from './mediciones/MedicionesPage'
import { OrganizacionesPage } from './organizaciones/OrganizacionesPage'
import { PanelPage } from './panel/PanelPage'
import { ReportesPage } from './reportes/ReportesPage'
import { UsuariosPage } from './usuarios/UsuariosPage'

// Registro único de módulos: App.jsx crea las rutas y MainLayout el menú a partir de esta lista.
// Para agregar un módulo basta con su carpeta en features/ y una entrada aquí.
export const modulos = [
  { ruta: '/acceso', titulo: 'Acceso', Pagina: AccesoPage },
  { ruta: '/panel', titulo: 'Panel', Pagina: PanelPage },
  { ruta: '/dispositivos', titulo: 'Dispositivos', Pagina: DispositivosPage },
  { ruta: '/mediciones', titulo: 'Mediciones', Pagina: MedicionesPage },
  { ruta: '/alertas', titulo: 'Alertas', Pagina: AlertasPage },
  { ruta: '/reportes', titulo: 'Reportes', Pagina: ReportesPage },
  { ruta: '/usuarios', titulo: 'Usuarios', Pagina: UsuariosPage },
  { ruta: '/organizaciones', titulo: 'Organizaciones', Pagina: OrganizacionesPage },
]
