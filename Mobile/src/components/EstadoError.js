import { View } from 'react-native'
import { useTema } from '../context/TemaContext'
import { Button, Card, IconCircle, T } from './ui'

// Tarjeta informativa cuando no hay nada que mostrar (por ejemplo, una cuenta sin dispositivos).
export function EstadoVacio({ titulo, mensaje, icono = 'cpu' }) {
  const { c } = useTema()
  return (
    <Card padding="sm" style={{ borderRadius: 22, gap: 12, alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconCircle name={icono} size="sm" tone="neutral" />
        <T peso={700} size={15} style={{ flex: 1 }}>
          {titulo}
        </T>
      </View>
      <T size={13} lh={20} color={c.textSecondary}>
        {mensaje}
      </T>
    </Card>
  )
}

// Tarjeta de error con reintento, para cuando la API no responde.
export function EstadoError({ titulo = 'No se pudieron cargar los datos', onReintentar }) {
  const { c } = useTema()
  return (
    <Card padding="sm" style={{ borderRadius: 22, gap: 12, alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconCircle name="wifi-off" size="sm" tone="danger" />
        <T peso={700} size={15} style={{ flex: 1 }}>
          {titulo}
        </T>
      </View>
      <T size={13} lh={20} color={c.textSecondary}>
        Revisa tu conexión a internet. Tu dispositivo sigue alertando con LED y buzzer.
      </T>
      <Button variant="secondary" size="sm" icon="activity" onPress={onReintentar}>
        Reintentar
      </Button>
    </Card>
  )
}
