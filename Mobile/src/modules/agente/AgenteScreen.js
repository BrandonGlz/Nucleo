import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Chip, Icon, T } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import * as agenteApi from '../../services/agente'
import * as dispositivosApi from '../../services/dispositivos'
import { pagina } from '../../utils/convertir'
import { hora } from '../../utils/formato'
import { font, marca } from '../../theme'

const SUGERENCIAS = ['¿Cómo está la temperatura ahora?', '¿Hubo picos de humedad hoy?', '¿Cómo está la calidad del aire?']

// Agente IA en la app: hay un agente por dispositivo. El operador habla con el de su dispositivo;
// las demás cuentas eligen el dispositivo. Solo aparece para las cuentas autorizadas.
export function AgenteScreen() {
  const { c } = useTema()
  const { usuario } = useSesion()
  const inset = useSafeAreaInsets()
  const hilo = useRef(null)
  const [elegido, setElegido] = useState(null)
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState({})
  const [pensando, setPensando] = useState(false)

  const { datos } = useDatos(async () => {
    const todos = pagina(await dispositivosApi.lista())
    return usuario.rol === 'OPER' ? todos.filter((d) => d.operador === usuario.num) : todos
  }, [usuario.num])
  const dispositivos = datos ?? []
  const d = dispositivos.find((x) => x.num === elegido) ?? dispositivos[0]
  const lista = d ? (mensajes[d.num] ?? []) : []

  useEffect(() => {
    hilo.current?.scrollToEnd({ animated: true })
  }, [lista.length, pensando])

  const preguntar = async (pregunta) => {
    const p = pregunta.trim()
    if (!p || pensando || !d) return
    const num = d.num
    const agregar = (m) => setMensajes((x) => ({ ...x, [num]: [...(x[num] ?? []), m] }))
    setTexto('')
    agregar({ de: 'yo', texto: p })
    setPensando(true)
    try {
      const r = await agenteApi.preguntar(p, num)
      agregar({ de: 'agente', texto: r.texto, hora: hora(new Date().toISOString()) })
    } catch (e) {
      agregar({ de: 'error', texto: e.status === 503 ? 'El agente no está disponible por ahora.' : 'No se pudo obtener la respuesta.' })
    } finally {
      setPensando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: marca.tinta }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <TemaFijo tema="dark">
        <View style={[s.zona, { paddingTop: inset.top + 16 }]}>
          <View style={s.fila12}>
            <View style={s.marca}>
              <Icon name="sparkles" size={20} color={marca.lima} />
            </View>
            <View style={{ flex: 1 }}>
              <T peso={700} size={22} lh={28} style={{ letterSpacing: -0.5 }}>
                Agente IA
              </T>
              <T size={12} color={marca.tenue}>
                {d ? `Agente de ${d.nombre}` : 'Cargando tu dispositivo…'}
              </T>
            </View>
          </View>
          {dispositivos.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dispositivos.map((x) => (
                <Chip key={x.num} selected={x.num === d?.num} onPress={() => setElegido(x.num)}>
                  {x.nombre}
                </Chip>
              ))}
            </ScrollView>
          )}
        </View>
      </TemaFijo>
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <ScrollView ref={hilo} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {lista.length === 0 && !pensando ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
              <T peso={700} size={18} style={{ textAlign: 'center' }}>
                {`Hola, ${usuario.nombre}`}
              </T>
              <T size={14} lh={20} color={c.textMuted} style={{ textAlign: 'center', marginBottom: 8 }}>
                {d ? `Pregunta lo que necesites sobre ${d.nombre}.` : ' '}
              </T>
              {SUGERENCIAS.map((p) => (
                <Pressable key={p} onPress={() => preguntar(p)} style={({ pressed }) => [s.sugerencia, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.7 }]}>
                  <Icon name="sparkles" size={14} color={c.textSecondary} />
                  <T size={14} style={{ flex: 1 }}>
                    {p}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : (
            lista.map((m, i) =>
              m.de === 'yo' ? (
                <View key={i} style={[s.mio, { backgroundColor: c.surfaceMuted }]}>
                  <T size={14} lh={21}>
                    {m.texto}
                  </T>
                </View>
              ) : (
                <View key={i} style={[s.suyo, { backgroundColor: c.surface, borderColor: m.de === 'error' ? c.danger : c.border }]}>
                  <T size={14} lh={21} color={m.de === 'error' ? c.danger : undefined}>
                    {m.texto}
                  </T>
                  {m.hora && (
                    <T size={11} color={c.textMuted}>
                      {`Agente de ${d?.nombre} · ${m.hora}`}
                    </T>
                  )}
                </View>
              ),
            )
          )}
          {pensando && (
            <View style={[s.suyo, s.fila12, { backgroundColor: c.surface, borderColor: c.border }]}>
              <ActivityIndicator size="small" color={c.textSecondary} />
              <T size={13} color={c.textMuted}>
                Consultando las lecturas…
              </T>
            </View>
          )}
        </ScrollView>
        <View style={[s.compositor, { backgroundColor: c.surface, borderColor: c.border, marginBottom: 104 + inset.bottom }]}>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Pregunta sobre tu dispositivo…"
            placeholderTextColor={c.textMuted}
            style={[s.entrada, { color: c.textPrimary, fontFamily: font[500] }]}
            multiline
            editable={!!d}
            onSubmitEditing={() => preguntar(texto)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar pregunta"
            disabled={!texto.trim() || pensando || !d}
            onPress={() => preguntar(texto)}
            style={[s.enviar, { backgroundColor: texto.trim() && !pensando ? c.accent : c.surfaceMuted }]}
          >
            <Icon name="send" size={18} color={texto.trim() && !pensando ? c.accentContrast : c.textMuted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  zona: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  marca: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(198,239,78,0.12)' },
  hoja: { flex: 1, marginTop: -4, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
  sugerencia: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
  mio: { alignSelf: 'flex-end', maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderBottomRightRadius: 6 },
  suyo: { alignSelf: 'flex-start', maxWidth: '90%', gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1 },
  compositor: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginHorizontal: 16, padding: 6, paddingLeft: 16, borderRadius: 26, borderWidth: 1 },
  entrada: { flex: 1, minHeight: 40, maxHeight: 110, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  enviar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
