import { View } from 'react-native'
import { useTema } from '../context/TemaContext'
import { formatDateTime } from '../utils/formatDate'
import { Button, Card, T } from './ui'

const CONTENIDO = {
  checking: ['Comprobando la API…', 'Consultando el endpoint de salud del backend.', 'textMuted'],
  online: ['API disponible', 'La app móvil se comunicó correctamente con el backend.', 'success'],
  offline: ['API no disponible', 'Revisa que Django esté ejecutándose y que la URL sea correcta.', 'danger'],
}

// Estado de GET /api/v1/health/ con la opción de volver a comprobar.
export function HealthStatusCard({ status, data, error, onRefresh }) {
  const { c } = useTema()
  const [titulo, texto, tono] = CONTENIDO[status] ?? CONTENIDO.checking
  const comprobando = status === 'checking'
  return (
    <Card padding="sm" style={{ gap: 12, borderRadius: 24 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c[tono] }} />
        <View style={{ flex: 1 }}>
          <T mayus color={c.textMuted}>
            Backend
          </T>
          <T peso={700} size={22} style={{ letterSpacing: -0.5 }}>
            {titulo}
          </T>
        </View>
      </View>
      <T size={15} lh={22} color={c.textSecondary}>
        {texto}
      </T>
      {error ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: c.dangerSoft }}>
          <T size={14} color={c.danger}>
            {error}
          </T>
        </View>
      ) : null}
      {data
        ? [
            ['Servicio', data.service],
            ['Versión', data.version],
            ['Última respuesta', formatDateTime(data.timestamp)],
          ].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T size={14} color={c.textMuted}>
                {k}
              </T>
              <T peso={600} size={14}>
                {v}
              </T>
            </View>
          ))
        : null}
      <Button variant="secondary" icon="activity" disabled={comprobando} onPress={onRefresh}>
        {comprobando ? 'Comprobando…' : 'Volver a comprobar'}
      </Button>
    </Card>
  )
}
