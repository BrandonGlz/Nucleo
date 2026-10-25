import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '../screens/HomeScreen'
import { modulos } from '../modules'
import { colors } from '../theme'

const Stack = createNativeStackNavigator()

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Inicio" component={HomeScreen} options={{ headerShown: false }} />
        {modulos.map(({ nombre, titulo, Pantalla }) => (
          <Stack.Screen key={nombre} name={nombre} component={Pantalla} options={{ title: titulo }} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
