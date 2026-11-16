import { useState } from 'react'
import { Alert, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { Pantalla } from '../../components/Pantalla'
import { Button, Card, Input, T } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import * as auth from '../../services/auth'
import { colors } from '../../theme'

const primero = (v) => (Array.isArray(v) ? v[0] : v)

// Cambiar la contraseña (como en «Mi perfil» de la web). La API cierra todas las sesiones al
// cambiarla, así que al terminar se vuelve a entrar con la nueva.
export function ContrasenaScreen({ navigation }) {
  const { c } = useTema()
  const { logout } = useSesion()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const e = {}
    if (!actual) e.actual = 'Escribe tu contraseña actual.'
    if (nueva.length < 8) e.nueva = 'Usa al menos 8 caracteres.'
    if (nueva !== repetida) e.repetida = 'Las contraseñas no coinciden.'
    setErrores(e)
    if (Object.keys(e).length) return
    setGuardando(true)
    try {
      await auth.cambiarPassword(actual, nueva)
      Alert.alert('Contraseña cambiada', 'Por seguridad se cerraron tus sesiones. Entra de nuevo con la contraseña nueva.', [
        { text: 'Entendido', onPress: () => logout().catch(() => {}) },
      ])
    } catch (err) {
      const d = err.datos ?? {}
      setErrores({
        actual: primero(d.password_actual),
        nueva: primero(d.password_nueva) ?? (d.password_actual ? undefined : 'No se pudo cambiar. Inténtalo de nuevo.'),
      })
    } finally {
      setGuardando(false)
    }
  }

  const zona = (
    <>
      <Cabecera titulo="Cambiar contraseña" onVolver={() => navigation.goBack()} />
      <T size={13} lh={19} color={colors.dark.textSecondary}>
        Al cambiarla se cierran tus sesiones en la web y en otros teléfonos.
      </T>
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta>
      <Card>
        <View style={{ gap: 14 }}>
          <Input label="Contraseña actual" icon="lock" secureTextEntry value={actual} onChangeText={setActual} error={errores.actual} autoComplete="current-password" />
          <Input label="Contraseña nueva" icon="key-round" secureTextEntry value={nueva} onChangeText={setNueva} error={errores.nueva} autoComplete="new-password" />
          <Input label="Repite la contraseña nueva" icon="key-round" secureTextEntry value={repetida} onChangeText={setRepetida} error={errores.repetida} autoComplete="new-password" />
          <T size={12} lh={17} color={c.textMuted}>
            Mínimo 8 caracteres; evita datos personales y contraseñas comunes.
          </T>
          <Button size="lg" icon="check" block disabled={guardando} onPress={guardar}>
            {guardando ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </View>
      </Card>
    </Pantalla>
  )
}
