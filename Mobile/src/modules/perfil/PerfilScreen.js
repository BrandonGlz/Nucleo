import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Pantalla } from '../../components/Pantalla'
import { Avatar, Button, Icon, IconCircle, T, Tabs, Toggle } from '../../components/ui'
import { usePreferencias } from '../../context/PreferenciasContext'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { useOperador } from '../../hooks/useOperador'
import * as authApi from '../../services/auth'
import { activarPush } from '../../services/notificaciones'
import * as organizacionesApi from '../../services/organizaciones'
import * as usuariosApi from '../../services/usuarios'
import { nombreCompleto, pagina, ROL } from '../../utils/convertir'
import { marca } from '../../theme'
import app from '../../../app.json'

// Error de la API al subir la foto (400 con {foto: [...]} o {detail}).
function mensajeFoto(e) {
  const d = e?.datos
  const primero = (v) => (Array.isArray(v) ? v[0] : v)
  return primero(d?.foto) || primero(d?.detail) || 'Revisa tu conexión e inténtalo de nuevo.'
}

// Toca la foto para elegir otra de la galería (recorte cuadrado) o quitarla. El usuario de la
// sesión se actualiza con la respuesta de la API, así cambia también en el Panel.
function FotoPerfil({ usuario, nombre }) {
  const { actualizarUsuario } = useSesion()
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (promesa) => {
    setOcupado(true)
    try {
      const u = await promesa()
      actualizarUsuario({ foto_url: u?.foto_url ?? null })
    } catch (e) {
      Alert.alert('No se pudo guardar la foto', mensajeFoto(e))
    } finally {
      setOcupado(false)
    }
  }
  const elegir = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 })
    if (r.canceled || !r.assets?.[0]) return
    guardar(() => authApi.subirFoto(r.assets[0]))
  }
  const opciones = () => {
    if (!usuario.foto_url) return elegir()
    Alert.alert('Foto de perfil', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar foto', style: 'destructive', onPress: () => guardar(authApi.quitarFoto) },
      { text: 'Cambiar foto', onPress: elegir },
    ])
  }
  return (
    <Pressable
      onPress={opciones}
      disabled={ocupado}
      accessibilityRole="button"
      accessibilityLabel={usuario.foto_url ? 'Cambiar o quitar la foto de perfil' : 'Agregar foto de perfil'}
      style={({ pressed }) => [s.aro, pressed && { opacity: 0.8 }]}
    >
      <Avatar name={nombre} size={84} foto={authApi.fuenteFoto(usuario.foto_url)} />
      {ocupado && (
        <View style={s.cargando}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      <View style={s.camara}>
        <Icon name="camera" size={14} color={marca.tinta} />
      </View>
    </Pressable>
  )
}

// Mi perfil: datos de la cuenta, preferencias del teléfono (tema incluido), seguridad (sesiones
// abiertas y contraseña) y cierre de sesión.
export function PerfilScreen({ navigation }) {
  const { c, setTema } = useTema()
  const { usuario, logout } = useSesion()
  const { datos: op } = useOperador()
  const { prefs, cambiar } = usePreferencias()
  const [saliendo, setSaliendo] = useState(false)
  const extra = useDatos(
    () =>
      Promise.all([
        organizacionesApi.propia(usuario.organizacion),
        // La API solo deja listar usuarios a administradores y supervisores; sin permiso queda «—».
        usuariosApi
          .lista({ rol: 'SUPER', area: usuario.area })
          .then(pagina)
          .catch(() => []),
      ]),
    [usuario.num],
  )
  const [org, supers] = extra.datos ?? []
  const area = op?.area?.nombre ?? '—'
  const d = op?.dispositivo
  const filas = [
    { k: 'Correo', v: usuario.correo },
    { k: 'Área', v: area },
    { k: 'Dispositivo', v: d ? `${d.nombre} · ${d.codigo_mqtt}` : '—' },
    { k: 'Supervisor', v: supers?.[0] ? nombreCompleto(supers[0]) : '—', verde: true },
  ]
  const nombre = nombreCompleto(usuario)

  const zona = (
    <View style={s.centro}>
      <FotoPerfil usuario={usuario} nombre={nombre} />
      <T peso={700} size={28} lh={34} style={{ marginTop: 8, letterSpacing: -0.8 }}>
        {nombre}
      </T>
      <T size={13} color="#B4BAB6">
        {`${ROL[usuario.rol]} · ${org?.nombre ?? '…'}`}
      </T>
      <View style={s.area}>
        <T peso={700} size={12} color={marca.tinta}>
          {area}
        </T>
      </View>
    </View>
  )

  const enlaces = [
    { icono: 'smartphone', titulo: 'Sesiones abiertas', texto: 'Dónde está abierta tu cuenta', ir: 'Sesiones' },
    { icono: 'key-round', titulo: 'Cambiar contraseña', texto: 'Cierra tus otras sesiones', ir: 'Contrasena' },
  ]

  return (
    <Pantalla zona={zona} deco="perfil">
      <View style={s.seccion}>
        <T mayus color={c.textMuted}>
          Cuenta
        </T>
        <View style={[s.tarjeta, { backgroundColor: c.surface }]}>
          {filas.map((f, i) => (
            <View key={f.k} style={[s.dato, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
              <T size={13} color={c.textMuted} style={{ width: 96 }}>
                {f.k}
              </T>
              <T peso={600} size={13} lh={18} style={{ flex: 1, textAlign: 'right' }} color={f.verde ? c.success : undefined}>
                {f.v}
              </T>
            </View>
          ))}
        </View>
      </View>
      <View style={s.seccion}>
        <T mayus color={c.textMuted}>
          Preferencias
        </T>
        <View style={[s.tarjeta, s.relleno, { backgroundColor: c.surface }]}>
          {/* Quita los movimientos de pantallas, pestañas y menús. Las preferencias se guardan en el teléfono. */}
          <Toggle label="Reducir animaciones" value={prefs.reducirAnimaciones} onChange={(v) => cambiar({ reducirAnimaciones: v })} />
          <Toggle
            label="Notificaciones push"
            value={prefs.push}
            onChange={(v) => {
              cambiar({ push: v })
              activarPush(v)
            }}
          />
          <Toggle label="Sonido en alertas críticas" value={prefs.sonido} onChange={(v) => cambiar({ sonido: v })} />
          <View style={s.entre}>
            <T peso={600} size={14}>
              Tema
            </T>
            <Tabs
              items={[
                { id: 'light', label: 'Claro' },
                { id: 'dark', label: 'Oscuro' },
                { id: 'sistema', label: 'Sistema' },
              ]}
              value={prefs.tema ?? 'sistema'}
              onChange={(id) => (id === 'sistema' ? cambiar({ tema: null }) : setTema(id))}
              compacto
            />
          </View>
        </View>
      </View>
      <View style={s.seccion}>
        <T mayus color={c.textMuted}>
          Seguridad
        </T>
        <View style={[s.tarjeta, { backgroundColor: c.surface }]}>
          {enlaces.map((x, i) => (
            <Pressable
              key={x.ir}
              onPress={() => navigation.navigate(x.ir)}
              accessibilityRole="button"
              style={({ pressed }) => [s.enlace, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }, pressed && { opacity: 0.7 }]}
            >
              <IconCircle name={x.icono} size="sm" />
              <View style={{ flex: 1 }}>
                <T peso={600} size={14}>
                  {x.titulo}
                </T>
                <T size={12} color={c.textMuted}>
                  {x.texto}
                </T>
              </View>
              <Icon name="chevron-right" size={18} color={c.textMuted} />
            </Pressable>
          ))}
        </View>
      </View>
      <Button
        variant="danger"
        size="lg"
        icon="log-out"
        block
        disabled={saliendo}
        onPress={() => {
          setSaliendo(true)
          logout().catch(() => {})
        }}
      >
        Cerrar sesión
      </Button>
      <T size={12} color={c.textMuted} style={{ textAlign: 'center' }}>
        {`Versión ${app.expo.version} (build ${app.expo.android?.versionCode ?? '—'})`}
      </T>
    </Pantalla>
  )
}

const s = StyleSheet.create({
  centro: { alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 6 },
  aro: { padding: 5, borderRadius: 999, borderWidth: 3, borderColor: marca.verde },
  cargando: { position: 'absolute', top: 5, left: 5, width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  camara: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: marca.verde, borderWidth: 2, borderColor: '#121413' },
  area: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: marca.verde },
  seccion: { gap: 8 },
  dato: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  tarjeta: { borderRadius: 22, overflow: 'hidden' },
  relleno: { gap: 16, padding: 16 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
})
