import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTema } from '../../context/TemaContext'
import { diaRelativo } from '../../utils/formato'
import { Icon, Input, T } from '../../components/ui'

const grupos = (conversaciones) => {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  const semana = new Date(hoy)
  semana.setDate(semana.getDate() - 6)
  const salida = [
    { id: 'hoy', label: 'Hoy', items: [] },
    { id: 'ayer', label: 'Ayer', items: [] },
    { id: 'semana', label: 'Esta semana', items: [] },
    { id: 'antes', label: 'Antes', items: [] },
  ]
  for (const c of conversaciones) {
    const fecha = c.fecha ? new Date(c.fecha) : new Date(0)
    if (fecha >= hoy) salida[0].items.push(c)
    else if (fecha >= ayer) salida[1].items.push(c)
    else if (fecha >= semana) salida[2].items.push(c)
    else salida[3].items.push(c)
  }
  return salida.filter((g) => g.items.length)
}

// Pantalla completa de conversaciones: búsqueda, grupos por fecha, renombrar y borrar.
export function ConversacionesScreen({ visible, conversaciones, onCerrar, onAbrir, onRenombrar, onBorrar }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  const [busqueda, setBusqueda] = useState('')
  const [renombrando, setRenombrando] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [menu, setMenu] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return conversaciones.filter((x) => !q || `${x.titulo} ${(x.mensajes ?? []).map((m) => m.texto).join(' ')}`.toLowerCase().includes(q))
  }, [conversaciones, busqueda])
  const lista = grupos(filtradas)
  const pulsacion = (conv) => setMenu(conv)
  const guardar = (id) => {
    onRenombrar(id, titulo)
    setRenombrando(null)
  }
  return (
    <>
      <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCerrar}>
      <View style={[s.pantalla, { backgroundColor: c.background, paddingTop: inset.top + 12, paddingBottom: inset.bottom }]}>
        <View style={s.cabeza}>
          <T peso={800} size={26} lh={32} style={{ flex: 1 }}>Conversaciones</T>
          <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar conversaciones" hitSlop={8} style={s.cerrar}>
            <Icon name="x" size={22} color={c.textPrimary} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <Input icon="search" placeholder="Buscar conversaciones…" value={busqueda} onChangeText={setBusqueda} autoCapitalize="none" />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {lista.length === 0 && <T size={13} color={c.textMuted}>No hay conversaciones que coincidan.</T>}
          {lista.map((grupo) => (
            <View key={grupo.id} style={{ gap: 6 }}>
              <T mayus color={c.textMuted}>{grupo.label}</T>
              {grupo.items.map((conv) => {
                const editando = renombrando === conv.id
                const cuerpo = (
                  <>
                    <Icon name="message-square" size={16} color={c.textMuted} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      {editando ? (
                        <TextInput
                          value={titulo}
                          onChangeText={setTitulo}
                          onSubmitEditing={() => guardar(conv.id)}
                          onKeyPress={(e) => {
                            if (e.nativeEvent.key === 'Enter') guardar(conv.id)
                          }}
                          autoFocus
                          maxLength={80}
                          style={[s.entrada, { color: c.textPrimary, borderColor: c.accent }]}
                        />
                      ) : (
                        <T peso={700} size={13} numberOfLines={1}>{conv.titulo}</T>
                      )}
                      <T size={11} color={c.textMuted} numberOfLines={1}>
                        {`${diaRelativo(conv.fecha)} · ${conv.alcance === 'AREA' ? `Área: ${conv.area_nombre}` : conv.alcance === 'ORGANIZACION' ? 'Toda la organización' : `Dispositivo: ${conv.dispositivo_nombre}`}`}
                      </T>
                    </View>
                  </>
                )
                // Al renombrar no se anida un botón dentro de otro: la fila deja de ser Pressable.
                return editando ? (
                  <View key={conv.id} style={[s.fila, { backgroundColor: c.surface, borderColor: c.border }]}>
                    {cuerpo}
                    <Pressable onPress={() => guardar(conv.id)} accessibilityRole="button" accessibilityLabel="Guardar nombre" hitSlop={8}>
                      <Icon name="check" size={18} color={c.accent} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    key={conv.id}
                    onPress={() => {
                      onAbrir(conv)
                      onCerrar()
                    }}
                    onLongPress={() => pulsacion(conv)}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ${conv.titulo}. Mantén pulsado para renombrar o borrar.`}
                    style={({ pressed }) => [s.fila, { backgroundColor: c.surface, borderColor: c.border }, pressed && { opacity: 0.7 }]}
                  >
                    {cuerpo}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
    <Modal visible={!!menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(null)}>
        <Pressable style={s.fondo} onPress={() => setMenu(null)} accessibilityLabel="Cerrar acciones" />
        <View style={[s.menu, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom }]}>
          <View style={[s.asa, { backgroundColor: c.border }]} />
          <T peso={700} size={16} numberOfLines={2}>{menu?.titulo}</T>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRenombrando(menu.id)
              setTitulo(menu.titulo)
              setMenu(null)
            }}
            style={[s.opcion, { borderColor: c.border }]}
          >
            <Icon name="square-pen" size={18} color={c.textPrimary} />
            <T peso={600} size={14}>Renombrar</T>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setConfirmar(menu)
              setMenu(null)
            }}
            style={[s.opcion, { borderColor: c.border }]}
          >
            <Icon name="trash-2" size={18} color={c.danger} />
            <T peso={600} size={14} color={c.danger}>Borrar</T>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={s.cancelar}>
            <T peso={700} size={14} color={c.textSecondary}>Cancelar</T>
          </Pressable>
        </View>
      </Modal>
      <Modal visible={!!confirmar} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setConfirmar(null)}>
        <Pressable style={s.fondo} onPress={() => setConfirmar(null)} accessibilityLabel="Cerrar confirmación" />
        <View style={[s.menu, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom }]}>
          <View style={[s.asa, { backgroundColor: c.border }]} />
          <T peso={800} size={18}>¿Borrar conversación?</T>
          <T size={13} lh={19} color={c.textSecondary}>{`«${confirmar?.titulo ?? ''}» se borrará de este teléfono. No se puede deshacer.`}</T>
          <View style={s.confirmacion}>
            <Pressable accessibilityRole="button" onPress={() => setConfirmar(null)} style={[s.boton, { borderColor: c.border }]}>
              <T peso={700} size={14} color={c.textSecondary}>Cancelar</T>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onBorrar(confirmar.id)
                setConfirmar(null)
              }}
              style={[s.boton, { backgroundColor: c.danger, borderColor: c.danger }]}
            >
              <T peso={700} size={14} color={c.onAccent ?? '#fff'}>Borrar</T>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  pantalla: { flex: 1 },
  cabeza: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  cerrar: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  entrada: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 13 },
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  menu: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, gap: 8, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  cancelar: { alignItems: 'center', paddingVertical: 12 },
  confirmacion: { flexDirection: 'row', gap: 10, marginTop: 4 },
  boton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 14, borderWidth: 1 },
})
