import { AccesoScreen } from './acceso/AccesoScreen'
import { AlertasScreen } from './alertas/AlertasScreen'
import { DispositivosScreen } from './dispositivos/DispositivosScreen'
import { MedicionesScreen } from './mediciones/MedicionesScreen'
import { PanelScreen } from './panel/PanelScreen'

// Registro único de módulos: AppNavigator crea las pantallas y HomeScreen los accesos.
// Para agregar un módulo basta con su carpeta en modules/ y una entrada aquí.
export const modulos = [
  { nombre: 'Acceso', titulo: 'Acceso', Pantalla: AccesoScreen },
  { nombre: 'Panel', titulo: 'Panel', Pantalla: PanelScreen },
  { nombre: 'Dispositivos', titulo: 'Dispositivos', Pantalla: DispositivosScreen },
  { nombre: 'Mediciones', titulo: 'Mediciones', Pantalla: MedicionesScreen },
  { nombre: 'Alertas', titulo: 'Alertas', Pantalla: AlertasScreen },
]
