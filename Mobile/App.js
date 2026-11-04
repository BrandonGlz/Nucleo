import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SesionProvider } from './src/context/SesionContext'
import { TemaProvider } from './src/context/TemaContext'
import { AppNavigator } from './src/navigation/AppNavigator'

export default function App() {
  const [fuentes] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  })
  if (!fuentes) return <View style={{ flex: 1, backgroundColor: '#121413' }} />
  return (
    <SafeAreaProvider>
      <TemaProvider>
        <SesionProvider>
          <AppNavigator />
        </SesionProvider>
      </TemaProvider>
    </SafeAreaProvider>
  )
}
