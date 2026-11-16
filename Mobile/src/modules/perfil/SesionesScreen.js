import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Badge, Button, IconCircle, Skeleton, T } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import * as auth from '../../services/auth'
import { haceCuanto } from '../../utils/formato'
import { colors } from '../../theme'

// Sesiones abiertas de la cuenta (como «Sesiones» en la web): dónde está conectada y desde
// cuándo. Las demás se pueden cerrar desde aquí; la de este teléfono se cierra en «Cerrar sesión».
export function SesionesScreen({ navigation }) {
  const { c } = useTema()
  const { estado, datos, reintentar, refrescar } = useDatos(() => auth.sesiones(), [])
  const [cerrando, setCerrando] = useState(null)

  const cerrar = (x) =>
    Alert.alert('¿Cerrar esta sesión?', `${x.agente || (x.cliente === 'web' ? 'Navegador' : 'Teléfono')} tendrá que volver a entrar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          setCerrando(x.num)
          auth
            .cerrarSesion(x.num)
            .then(refrescar)
            .catch(() => Alert.alert('No se pudo cerrar', 'Revisa tu conexión e inténtalo de nuevo.'))
            .finally(() => setCerrando(null))
        },
      },
    ])

  const zona = (
    <>
      <Cabecera titulo="Sesiones abiertas" onVolver={() => navigation.goBack()} />
      <T size={13} lh={19} color={colors.dark.textSecondary}>
        Dónde está abierta tu cuenta. Si no reconoces una, ciérrala y cambia tu contraseña.
      </T>
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta onRecargar={reintentar}>
      {estado === 'error' ? (
        <EstadoError onReintentar={reintentar} />
      ) : !datos ? (
        [0, 1].map((i) => <Skeleton key={i} height={92} style={{ borderRadius: 22 }} />)
      ) : (
        datos.map((x, i) => (
          <Aparece key={x.num} indice={i}>
            <View style={[s.tarjeta, { backgroundColor: c.surface }]}>
              <View style={s.fila}>
                <IconCircle name={x.cliente === 'web' ? 'monitor' : 'smartphone'} size="sm" tone={x.actual ? 'success' : 'neutral'} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T peso={700} size={14} numberOfLines={1}>
                    {x.agente || (x.cliente === 'web' ? 'Navegador' : 'Teléfono')}
                  </T>
                  <T size={12} color={c.textMuted}>
                    {`${x.ip ?? 'IP desconocida'} · ${x.actual ? 'activa ahora' : `usada ${haceCuanto(x.ultimo_uso)}`}`}
                  </T>
                </View>
                {x.actual && <Badge tone="success">Este teléfono</Badge>}
              </View>
              {!x.actual && (
                <Button variant="secondary" size="sm" icon="log-out" disabled={cerrando === x.num} onPress={() => cerrar(x)}>
                  {cerrando === x.num ? 'Cerrando…' : 'Cerrar esta sesión'}
                </Button>
              )}
            </View>
          </Aparece>
        ))
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  tarjeta: { gap: 12, padding: 14, borderRadius: 22 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
