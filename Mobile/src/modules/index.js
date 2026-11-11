import { puedeUsarAgente } from '../utils/convertir'

// Alertas y agente son de una organización; la cuenta de plataforma no tiene.
const conOrganizacion = (u) => !!u?.organizacion
import { AccesoScreen } from './acceso/AccesoScreen'
import { AgenteScreen } from './agente/AgenteScreen'
import { AlertasScreen } from './alertas/AlertasScreen'
import { DetalleAlertaScreen } from './alertas/DetalleAlertaScreen'
import { EstadoScreen } from './estado/EstadoScreen'
import { MedicionesScreen } from './mediciones/MedicionesScreen'
import { PanelScreen } from './panel/PanelScreen'
import { PerfilScreen } from './perfil/PerfilScreen'

// Registro único de pantallas: AppNavigator las crea a partir de aquí.
// - `pestana`: aparece en la barra inferior con ese ícono.
// - Sin `pestana`: se apila sobre las pestañas (detalles y diagnóstico).
// - `permiso(usuario)`: si devuelve false, el módulo no aparece para esa cuenta.
// La carpeta modules/dispositivos se conserva fuera de la navegación: el operador solo tiene
// un dispositivo y lo ve en Inicio.
export const acceso = { nombre: 'Acceso', Pantalla: AccesoScreen }

export const modulos = [
  { nombre: 'Inicio', titulo: 'Inicio', Pantalla: PanelScreen, pestana: 'house' },
  { nombre: 'Alertas', titulo: 'Alertas', Pantalla: AlertasScreen, pestana: 'bell', permiso: conOrganizacion },
  { nombre: 'Agente', titulo: 'Nico AI', Pantalla: AgenteScreen, pestana: 'sparkles', permiso: (u) => conOrganizacion(u) && puedeUsarAgente(u) },
  { nombre: 'Perfil', titulo: 'Perfil', Pantalla: PerfilScreen, pestana: 'user' },
  { nombre: 'Variable', titulo: 'Detalle de variable', Pantalla: MedicionesScreen },
  { nombre: 'DetalleAlerta', titulo: 'Alerta', Pantalla: DetalleAlertaScreen },
  { nombre: 'Estado', titulo: 'Estado de la API', Pantalla: EstadoScreen },
]
