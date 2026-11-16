import { useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { Alerta } from '../../components/Alerta'
import { Avatar, Button, Input, Logo, LogoMark, T } from '../../components/ui'
import * as auth from '../../services/auth'
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
              {`${ROL[u.rol]}${u.rol === 'OPER' ? (u.acceso_agente ? ' · con Nico AI' : ' · sin Nico AI') : ''}${u.estado_usuario !== 'ACT' ? ' · inactiva' : ''}`}
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
  // Segundo paso (verificación en dos pasos) y recuperación de contraseña.
  const [pideCodigo, setPideCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [recuperando, setRecuperando] = useState(false)
  const [aviso, setAviso] = useState(null)
  // Con el teclado abierto la hoja sube sobre él (igual que en Nico AI) y se recorre hasta los campos.
  const scroll = useRef(null)
  const hojaY = useRef(0)
  const camposY = useRef(0)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      scroll.current?.scrollTo({ y: Math.max(0, hojaY.current + camposY.current - 24), animated: true }),
    )
    return () => sub.remove()
  }, [])

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
    if (pideCodigo && !codigo.trim()) {
      setErrores({ codigo: 'Escribe el código de 6 dígitos de tu app.' })
      return
    }
    setEnviando(true)
    try {
      await login(co, pw, pideCodigo ? codigo.trim() : undefined)
    } catch (err) {
      if (err.segundoFactorPendiente) {
        setErrorApi('Tu rol exige la verificación en dos pasos. Configúrala en la web, en Mi perfil, y vuelve a entrar.')
      } else if (err.status === 401 && err.datos?.requiere_codigo) {
        if (pideCodigo) setErrores({ codigo: 'El código no es válido. Usa el más reciente de tu app.' })
        setPideCodigo(true)
      } else if (err.status === 429) {
        setErrorApi('Demasiados intentos. Espera un minuto e inténtalo de nuevo.')
      } else {
        setErrorApi(MENSAJES[err.status] ?? 'No se pudo conectar con Núcleo. Revisa tu conexión e inténtalo de nuevo.')
      }
      setEnviando(false)
    }
  }
  const pedirEnlace = async () => {
    const co = correo.trim()
    if (!/^\S+@\S+\.\S+$/.test(co)) {
      setErrores({ correo: 'Escribe el correo de tu cuenta.' })
      return
    }
    setErrores({})
    setErrorApi(null)
    setEnviando(true)
    try {
      await auth.recuperar(co)
      setRecuperando(false)
      setAviso(`Si ${co} tiene una cuenta activa, te llegará un enlace para elegir una contraseña nueva. Vale una sola vez y caduca en una hora.`)
    } catch (err) {
      setErrorApi(err.status === 429 ? 'Ya pediste varios enlaces. Espera una hora.' : 'No se pudo conectar con Núcleo.')
    }
    setEnviando(false)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: marca.tinta }} behavior="padding">
      <StatusBar style="light" />
      <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        <View style={[s.arriba, { paddingTop: inset.top + 48 }]}>
          <View style={s.anillo} />
          <View style={{ position: 'absolute', right: -70, top: inset.top + 84 }}>
            <LogoMark tone="verde" size={260} />
          </View>
          <Logo size={40} inverse />
        </View>
        <View
          style={[s.hoja, { backgroundColor: c.surface, paddingBottom: inset.bottom + 44 }]}
          onLayout={(e) => (hojaY.current = e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 8 }}>
            <T peso={700} size={30} lh={36} style={{ letterSpacing: -0.75 }}>
              {pideCodigo ? 'Verificación en dos pasos' : recuperando ? 'Recupera tu contraseña' : 'Inicia sesión'}
            </T>
            <T size={15} lh={24} color={c.textSecondary}>
              {pideCodigo
                ? 'Escribe el código de 6 dígitos de tu app de autenticación, o uno de recuperación.'
                : recuperando
                  ? 'Te mandaremos un enlace al correo para elegir una contraseña nueva.'
                  : 'Entra con la cuenta que te dio el administrador de tu organización.'}
            </T>
          </View>
          {errorApi && <Alerta tono="danger" titulo={errorApi} />}
          {aviso && <Alerta tono="success" titulo="Revisa tu correo" texto={aviso} />}
          {pideCodigo && (
            <View style={{ gap: 12 }}>
              <Input
                label="Código"
                icon="lock"
                value={codigo}
                onChangeText={setCodigo}
                placeholder="123456"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                autoFocus
                onSubmitEditing={() => entrar()}
                error={errores.codigo}
              />
              <Pressable
                onPress={() => {
                  setPideCodigo(false)
                  setCodigo('')
                  setErrores({})
                }}
              >
                <T peso={600} size={14}>
                  Usar otra cuenta
                </T>
              </Pressable>
            </View>
          )}
          {recuperando && (
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
              <Button size="lg" icon="send" block disabled={enviando} onPress={pedirEnlace}>
                {enviando ? 'Enviando…' : 'Enviar enlace'}
              </Button>
              <Pressable onPress={() => setRecuperando(false)}>
                <T peso={600} size={14}>
                  Volver a iniciar sesión
                </T>
              </Pressable>
            </View>
          )}
          <View
            style={{ gap: 16, display: pideCodigo || recuperando ? 'none' : 'flex' }}
            onLayout={(e) => (camposY.current = e.nativeEvent.layout.y)}
          >
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
              icon="lock"
              value={password}
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              secureTextEntry
              autoComplete="password"
              onSubmitEditing={() => entrar()}
              error={errores.password}
            />
            <Pressable
              style={{ alignSelf: 'flex-end' }}
              onPress={() => {
                setErrorApi(null)
                setAviso(null)
                setRecuperando(true)
              }}
            >
              <T peso={600} size={14}>
                ¿Olvidaste tu contraseña?
              </T>
            </Pressable>
          </View>
          {!recuperando && (
            <Button size="lg" icon="log-in" block disabled={enviando} onPress={() => entrar()}>
              {enviando ? 'Entrando…' : pideCodigo ? 'Verificar y entrar' : 'Iniciar sesión'}
            </Button>
          )}
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
