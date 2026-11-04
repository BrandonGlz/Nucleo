import { View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { HealthStatusCard } from '../../components/HealthStatusCard'
import { Pantalla } from '../../components/Pantalla'
import { Card, T } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useHealthCheck } from '../../hooks/useHealthCheck'
import { API_BASE_URL } from '../../services/api/client'
import { USAR_MOCKS } from '../../services/config'
import { colors } from '../../theme'

// Diagnóstico: comprueba si la API responde y muestra la URL configurada.
export function EstadoScreen({ navigation }) {
  const { c } = useTema()
  const { status, data, error, refresh } = useHealthCheck()
  return (
    <Pantalla
      pestanas={false}
      zona={
        <>
          <Cabecera titulo="Estado de la API" onVolver={() => navigation.goBack()} />
          <T size={13} lh={20} color={colors.dark.textSecondary}>
            {USAR_MOCKS ? 'La app usa datos simulados (EXPO_PUBLIC_USE_MOCKS=true).' : 'La app usa la API real.'}
          </T>
        </>
      }
    >
      <HealthStatusCard status={status} data={data} error={error} onRefresh={refresh} />
      <Card padding="sm" style={{ gap: 6, borderRadius: 24 }}>
        <T mayus color={c.textMuted}>
          Endpoint de la API
        </T>
        <View>
          <T peso={600} size={14}>
            {API_BASE_URL}
          </T>
        </View>
        <T size={13} lh={20} color={c.textSecondary}>
          Se configura con EXPO_PUBLIC_API_BASE_URL en Mobile/.env.
        </T>
      </Card>
    </Pantalla>
  )
}
