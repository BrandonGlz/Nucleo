import { AccesoScreen } from './acceso/AccesoScreen'
import { AlertasScreen } from './alertas/AlertasScreen'
import { DetalleAlertaScreen } from './alertas/DetalleAlertaScreen'
import { EstadoScreen } from './estado/EstadoScreen'
import { MedicionesScreen } from './mediciones/MedicionesScreen'
import { PanelScreen } from './panel/PanelScreen'
import { PerfilScreen } from './perfil/PerfilScreen'

// Registro único de pantallas: AppNavigator las crea a partir de aquí.
// - `pestana`: aparece en la barra inferior con ese ícono.
// - Sin `pestana`: se apila sobre las pestañas (detalles y diagnóstico).
// La carpeta modules/dispositivos se conserva fuera de la navegación: el operador solo tiene
// un dispositivo y lo ve en Inicio.
export const acceso = { nombre: 'Acceso', Pantalla: AccesoScreen }

export const modulos = [
  { nombre: 'Inicio', titulo: 'Inicio', Pantalla: PanelScreen, pestana: 'house' },
  { nombre: 'Alertas', titulo: 'Alertas', Pantalla: AlertasScreen, pestana: 'bell' },
  { nombre: 'Perfil', titulo: 'Perfil', Pantalla: PerfilScreen, pestana: 'user' },
  { nombre: 'Variable', titulo: 'Detalle de variable', Pantalla: MedicionesScreen },
  { nombre: 'DetalleAlerta', titulo: 'Alerta', Pantalla: DetalleAlertaScreen },
  { nombre: 'Estado', titulo: 'Estado de la API', Pantalla: EstadoScreen },
]
