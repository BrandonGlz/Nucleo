import { puedeUsarAgente } from '../utils/convertir'

// Alertas y agente son de una organización; la cuenta de plataforma no tiene.
const conOrganizacion = (u) => !!u?.organizacion
import { AccesoScreen } from './acceso/AccesoScreen'
import { SolicitarAccesoScreen } from './acceso/SolicitarAccesoScreen'
import { AgenteScreen } from './agente/AgenteScreen'
import { AlertasScreen } from './alertas/AlertasScreen'
import { DetalleAlertaScreen } from './alertas/DetalleAlertaScreen'
import { EstadoScreen } from './estado/EstadoScreen'
import { HistoricoScreen } from './historico/HistoricoScreen'
import { MedicionesScreen } from './mediciones/MedicionesScreen'
import { NotificacionesScreen } from './notificaciones/NotificacionesScreen'
import { PanelScreen } from './panel/PanelScreen'
import { ContrasenaScreen } from './perfil/ContrasenaScreen'
import { PerfilScreen } from './perfil/PerfilScreen'
import { SesionesScreen } from './perfil/SesionesScreen'

// Registro único de pantallas: AppNavigator las crea a partir de aquí.
// - `pestana`: aparece en la barra inferior con ese ícono.
// - Sin `pestana`: se apila sobre las pestañas (detalles y diagnóstico).
// - `permiso(usuario)`: si devuelve false, el módulo no aparece para esa cuenta.
// La carpeta modules/dispositivos se conserva fuera de la navegación: el operador solo tiene
// un dispositivo y lo ve en Inicio.
export const acceso = { nombre: 'Acceso', Pantalla: AccesoScreen }
// Pantallas públicas que se apilan sobre Acceso (sin sesión).
export const publicas = [{ nombre: 'SolicitarAcceso', titulo: 'Solicita tu acceso', Pantalla: SolicitarAccesoScreen }]

export const modulos = [
  { nombre: 'Inicio', titulo: 'Panel', Pantalla: PanelScreen, pestana: 'layout-dashboard' },
  { nombre: 'Alertas', titulo: 'Alertas', Pantalla: AlertasScreen, pestana: 'bell', permiso: conOrganizacion },
  { nombre: 'Historico', titulo: 'Histórico', Pantalla: HistoricoScreen, pestana: 'history', permiso: conOrganizacion },
  { nombre: 'Agente', titulo: 'Nico AI', Pantalla: AgenteScreen, pestana: 'sparkles', permiso: (u) => conOrganizacion(u) && puedeUsarAgente(u) },
  { nombre: 'Perfil', titulo: 'Mi perfil', Pantalla: PerfilScreen, pestana: 'user' },
  { nombre: 'Variable', titulo: 'Detalle de variable', Pantalla: MedicionesScreen },
  { nombre: 'DetalleAlerta', titulo: 'Alerta', Pantalla: DetalleAlertaScreen },
  { nombre: 'Estado', titulo: 'Estado de la API', Pantalla: EstadoScreen },
  { nombre: 'Notificaciones', titulo: 'Notificaciones', Pantalla: NotificacionesScreen, permiso: conOrganizacion },
  { nombre: 'Sesiones', titulo: 'Sesiones abiertas', Pantalla: SesionesScreen },
  { nombre: 'Contrasena', titulo: 'Cambiar contraseña', Pantalla: ContrasenaScreen },
]
