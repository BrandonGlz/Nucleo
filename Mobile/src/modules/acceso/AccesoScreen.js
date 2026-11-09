import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { Alerta } from '../../components/Alerta'
import { Avatar, Button, Input, Logo, LogoMark, T } from '../../components/ui'
import { cuentasDemo, PASSWORD_DEMO } from '../../services/auth'
import { USAR_MOCKS } from '../../services/config'
import { nombreCompleto, ROL } from '../../utils/convertir'
import { marca } from '../../theme'

const ORDEN_ROL = ['ADMIN', 'SUPER', 'ANALISTA', 'OPER']

// En modo simulado: una fila por cuenta para entrar con un toque y revisar cada rol.
function CuentasDemo({ entrar, enviando }) {
  const { c } = useTema()
  const cuentas = cuentasDemo().sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol))
  if (!cuentas.length) return null
  return (
    <View style={{ gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border }}>
      <T mayus color={c.textMuted}>
        Cuentas de prueba · {USAR_MOCKS ? 'cualquier contraseña' : `contraseña ${PASSWORD_DEMO}`}
      </T>
      {cuentas.map((u) => (
        <Pressable
          key={u.num}
          disabled={enviando}
          onPress={() => entrar(u.correo)}
          style={({ pressed }) => [s.cuenta, { borderColor: c.border, backgroundColor: pressed ? c.surfaceMuted : c.surface }]}
        >
          <Avatar name={nombreCompleto(u)} size={32} />
          <View style={{ flex: 1 }}>
            <T peso={700} size={14}>
              {nombreCompleto(u)}
            </T>
            <T size={12} color={c.textMuted}>
              {`${ROL[u.rol]}${u.rol === 'OPER' ? (u.acceso_agente ? ' · con agente IA' : ' · sin agente IA') : ''}${u.estado_usuario !== 'ACT' ? ' · inactiva' : ''}`}
            </T>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const MENSAJES = {
  400: 'Correo o contraseña incorrectos.',
  401: 'Correo o contraseña incorrectos.',
  403: 'Tu cuenta está inactiva. Pide al administrador que la active.',
}

// Inicio de sesión a pantalla completa: zona oscura con el logo y hoja con el formulario.
export function AccesoScreen() {
  const { c } = useTema()
  const { login } = useSesion()
  const inset = useSafeAreaInsets()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [errorApi, setErrorApi] = useState(null)

  const entrar = async (demo) => {
    const co = demo ?? correo.trim()
    const pw = demo ? PASSWORD_DEMO : password
    const e = {}
    if (!/^\S+@\S+\.\S+$/.test(co)) e.correo = 'Escribe un correo válido.'
    if (!pw) e.password = 'Escribe tu contraseña.'
    setErrores(e)
    setErrorApi(null)
    if (Object.keys(e).length) return
    if (demo) {
      setCorreo(demo)
      setPassword(pw)
    }
    setEnviando(true)
    try {
      await login(co, pw)
    } catch (err) {
      setErrorApi(MENSAJES[err.status] ?? 'No se pudo conectar con Núcleo. Revisa tu conexión e inténtalo de nuevo.')
      setEnviando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: marca.tinta }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[s.arriba, { paddingTop: inset.top + 48 }]}>
          <View style={s.anillo} />
          <View style={{ position: 'absolute', right: -70, top: inset.top + 84 }}>
            <LogoMark tone="lima" size={260} />
          </View>
          <Logo size={40} inverse />
        </View>
        <View style={[s.hoja, { backgroundColor: c.surface, paddingBottom: inset.bottom + 44 }]}>
          <View style={{ gap: 8 }}>
            <T peso={700} size={30} lh={36} style={{ letterSpacing: -0.75 }}>
              Inicia sesión
            </T>
            <T size={15} lh={24} color={c.textSecondary}>
              Entra con la cuenta que te dio el administrador de tu organización.
            </T>
          </View>
          {errorApi && <Alerta tono="danger" titulo={errorApi} />}
          <View style={{ gap: 16 }}>
            <Input
              label="Correo"
              icon="mail"
              value={correo}
              onChangeText={setCorreo}
              placeholder="nombre@empresa.mx"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errores.correo}
            />
            <Input
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
              autoComplete="password"
              onSubmitEditing={() => entrar()}
              error={errores.password}
            />
            <Pressable style={{ alignSelf: 'flex-end' }} onPress={() => setErrorApi('Pide al administrador de tu organización que restablezca tu contraseña.')}>
              <T peso={600} size={14}>
                ¿Olvidaste tu contraseña?
              </T>
            </Pressable>
          </View>
          <Button size="lg" icon="log-in" block disabled={enviando} onPress={() => entrar()}>
            {enviando ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
          <T size={14} lh={22} color={c.textMuted}>
            ¿Necesitas acceso? Pídelo al administrador de tu organización.
          </T>
          <CuentasDemo entrar={entrar} enviando={enviando} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  cuenta: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1 },
  arriba: { flex: 1, minHeight: 230, paddingHorizontal: 28, overflow: 'hidden' },
  anillo: { position: 'absolute', right: -150, top: 40, width: 420, height: 420, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(243,245,242,0.08)' },
  hoja: {
    gap: 24, paddingTop: 32, paddingHorizontal: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: -12 }, elevation: 8,
  },
})
