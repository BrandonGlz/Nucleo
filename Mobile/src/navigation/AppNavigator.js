import { View } from 'react-native'
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TabBar } from '../components/ui'
import { useSesion } from '../context/SesionContext'
import { useTema } from '../context/TemaContext'
import { OperadorProvider, pendientesDe, useOperador } from '../hooks/useOperador'
import { acceso, modulos } from '../modules'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const permitido = (usuario) => (m) => !m.permiso || m.permiso(usuario)
const pestanasDe = (usuario) => modulos.filter((m) => m.pestana && permitido(usuario)(m))
const apiladas = modulos.filter((m) => !m.pestana)

// Barra flotante a 16 px de los lados y 24 px del borde inferior, con el contador de alertas pendientes.
function BarraInferior({ state, navigation }) {
  const inset = useSafeAreaInsets()
  const { usuario } = useSesion()
  const pestanas = pestanasDe(usuario)
  const { datos } = useOperador()
  const pendientes = pendientesDe(datos).length
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom: 24 + inset.bottom }}>
      <TabBar
        items={pestanas.map((m) => ({ id: m.nombre, label: m.titulo, icon: m.pestana, count: m.nombre === 'Alertas' ? pendientes : 0 }))}
        active={state.routes[state.index].name}
        onChange={(nombre) => navigation.navigate(nombre)}
      />
    </View>
  )
}

function Principal() {
  const { usuario } = useSesion()
  const pestanas = pestanasDe(usuario)
  return (
    <Tab.Navigator tabBar={(props) => <BarraInferior {...props} />} screenOptions={{ headerShown: false }}>
      {pestanas.map(({ nombre, Pantalla }) => (
        <Tab.Screen key={nombre} name={nombre} component={Pantalla} />
      ))}
    </Tab.Navigator>
  )
}

// Sin sesión: Acceso. Con sesión: las pestañas y, encima, las pantallas de detalle.
export function AppNavigator() {
  const { usuario } = useSesion()
  const { c, oscuro } = useTema()
  const base = oscuro ? DarkTheme : DefaultTheme
  const tema = { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.textPrimary, border: c.border, primary: c.accent } }
  const pilas = (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#121413' } }}>
      {usuario ? (
        <>
          <Stack.Screen name="Principal" component={Principal} />
          {apiladas.map(({ nombre, Pantalla }) => (
            <Stack.Screen key={nombre} name={nombre} component={Pantalla} />
          ))}
        </>
      ) : (
        <Stack.Screen name={acceso.nombre} component={acceso.Pantalla} />
      )}
    </Stack.Navigator>
  )
  return (
    <NavigationContainer theme={tema}>
      {usuario ? <OperadorProvider usuario={usuario}>{pilas}</OperadorProvider> : pilas}
    </NavigationContainer>
  )
}
