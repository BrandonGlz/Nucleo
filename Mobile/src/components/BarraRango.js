import { View } from 'react-native'
import { marca } from '../theme'

// Barra de rango de la zona oscura: banda permitida en verde y marca en el valor actual.
// desde, ancho y marca van de 0 a 1 sobre la escala de la variable.
export function BarraRango({ desde, ancho, marca: m, color = marca.verde }) {
  return (
    <View style={{ height: 10, borderRadius: 99, backgroundColor: 'rgba(243,245,242,0.1)' }}>
      {ancho != null && (
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${desde * 100}%`, width: `${ancho * 100}%`, borderRadius: 99, backgroundColor: color }} />
      )}
      {m != null && (
        <View
          style={{
            position: 'absolute', top: -6, left: `${m * 100}%`, marginLeft: -11, width: 22, height: 22,
            borderRadius: 11, backgroundColor: marca.claro, borderWidth: 4, borderColor: marca.tinta,
          }}
        />
      )}
    </View>
  )
}
