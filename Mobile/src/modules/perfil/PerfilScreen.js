import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Pantalla } from '../../components/Pantalla'
import { Avatar, Button, Icon, T, Tabs, Toggle } from '../../components/ui'
import { usePreferencias } from '../../context/PreferenciasContext'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { useOperador } from '../../hooks/useOperador'
import { activarPush } from '../../services/notificaciones'
import * as organizacionesApi from '../../services/organizaciones'
import * as usuariosApi from '../../services/usuarios'
import { nombreCompleto, pagina, ROL } from '../../utils/convertir'
import { marca } from '../../theme'
import app from '../../../app.json'

// Perfil del operador: datos de su cuenta, preferencias del teléfono, tema y cierre de sesión.
export function PerfilScreen({ navigation }) {
  const { c, tema, setTema } = useTema()
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
    { k: 'Correo', v: usuario.correo, ancho: true },
    { k: 'Área', v: area },
    { k: 'Dispositivo asignado', v: d ? `${d.nombre} · ${d.codigo_mqtt}` : '—' },
    { k: 'Supervisor', v: supers?.[0] ? nombreCompleto(supers[0]) : '—', ancho: true, verde: true },
  ]
  const nombre = nombreCompleto(usuario)

  const zona = (
    <View style={s.centro}>
      <View style={s.aro}>
        <Avatar name={nombre} size={84} />
      </View>
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

  return (
    <Pantalla zona={zona} deco="perfil">
      <View style={s.rejilla}>
        {filas.map((f) => (
          <View key={f.k} style={[s.dato, { backgroundColor: f.verde ? marca.verde : c.surface, width: f.ancho ? '100%' : '48.5%' }]}>
            <T mayus color={f.verde ? 'rgba(18,20,19,0.6)' : c.textMuted}>
              {f.k}
            </T>
            <T peso={700} size={14} lh={20} color={f.verde ? marca.tinta : undefined}>
              {f.v}
            </T>
          </View>
        ))}
      </View>
      <View style={[s.tarjeta, { backgroundColor: c.surface }]}>
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
            ]}
            value={tema}
            onChange={setTema}
          />
        </View>
      </View>
      <Pressable onPress={() => navigation.navigate('Estado')} style={[s.tarjeta, s.enlace, { backgroundColor: c.surface }]} accessibilityRole="button">
        <Icon name="activity" size={18} color={c.textSecondary} />
        <T peso={600} size={14} style={{ flex: 1 }}>
          Estado de la API
        </T>
        <Icon name="chevron-right" size={18} color={c.textMuted} />
      </Pressable>
      <T size={12} color={c.textMuted} style={{ textAlign: 'center' }}>
        {`Versión ${app.expo.version} (build ${app.expo.android?.versionCode ?? '—'})`}
      </T>
      <Button
        variant="secondary"
        size="lg"
        icon="log-out"
        block
        disabled={saliendo}
        onPress={() => {
          setSaliendo(true)
          logout()
        }}
      >
        Cerrar sesión
      </Button>
    </Pantalla>
  )
}

const s = StyleSheet.create({
  centro: { alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 6 },
  aro: { padding: 5, borderRadius: 999, borderWidth: 3, borderColor: marca.verde },
  area: { marginTop: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: marca.verde },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  dato: { gap: 4, padding: 14, borderRadius: 20 },
  tarjeta: { gap: 16, padding: 18, borderRadius: 24 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
})
