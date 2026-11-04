import { View } from 'react-native'
import { IconButton, T } from './ui'

// Fila superior de las pantallas de detalle: volver, título centrado y hueco simétrico.
export function Cabecera({ titulo, onVolver }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton icon="chevron-left" label="Volver" size="lg" inverse onPress={onVolver} />
      <T peso={700} size={17} numberOfLines={1}>
        {titulo}
      </T>
      <View style={{ width: 48 }} />
    </View>
  )
}
