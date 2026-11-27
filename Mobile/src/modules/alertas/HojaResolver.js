import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button, Icon, T } from '../../components/ui'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useTema } from '../../context/TemaContext'
import * as alertasApi from '../../services/alertas'
import { tituloAlerta } from '../../utils/convertir'
import { font, radius } from '../../theme'

// Nota obligatoria al atender o descartar (mismo mínimo y máximo que la API y la web).
export const NOTA_MIN = 5
export const NOTA_MAX = 500
const RESOLVER = {
  atender: {
    titulo: 'Atender la alerta',
    etiqueta: '¿Qué se hizo para atenderla?',
    ejemplo: 'Ej.: se ventiló el área y la temperatura volvió a la normalidad',
    boton: 'Guardar como atendida',
    icono: 'circle-check',
  },
  descartar: {
    titulo: 'Descartar la alerta',
    etiqueta: '¿Por qué se descarta?',
    ejemplo: 'Ej.: la puerta del andén estuvo abierta durante la carga',
    boton: 'Descartar alerta',
    icono: 'circle-x',
  },
}

// Mensaje del backend al resolver (400 con {observaciones: [...]} o {detail}).
function mensajeError(e) {
  if (e?.status === 409) return 'Alguien más ya resolvió esta alerta.'
  const d = e?.datos
  const primero = (v) => (Array.isArray(v) ? v[0] : v)
  return primero(d?.observaciones) || primero(d?.detail) || 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'
}

// Hoja que sube desde abajo con la nota de la resolución. `pedido`: {a, accion} o null.
function HojaResolver({ pedido, alCerrar, alTerminar }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  const animar = useAnimaciones()
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(null)
  // Cada vez que se abre para otra alerta o acción, la nota empieza vacía.
  const clave = pedido ? `${pedido.a.num}-${pedido.accion}` : null
  if (clave !== abierto) {
    setAbierto(clave)
    setNota('')
    setError(null)
  }
  const form = pedido ? RESOLVER[pedido.accion] : null
  const limpia = nota.trim()
  const corta = limpia.length < NOTA_MIN

  const cerrar = () => !enviando && alCerrar()
  const guardar = async () => {
    if (corta || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await alertasApi.resolver(pedido.a.num, pedido.accion, limpia)
      alCerrar()
      alTerminar?.(pedido, true)
    } catch (e) {
      setError(mensajeError(e))
      // Si alguien más la resolvió, la lista se pone al día.
      if (e?.status === 409) alTerminar?.(pedido, false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={!!pedido} transparent animationType={animar ? 'slide' : 'none'} statusBarTranslucent onRequestClose={cerrar}>
      <Pressable style={s.fondo} onPress={cerrar} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.abajo} pointerEvents="box-none">
        {form && (
          <View style={[s.hoja, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom }]}>
            <View style={[s.asa, { backgroundColor: c.border }]} />
            <View style={{ gap: 2 }}>
              <T peso={700} size={18}>
                {form.titulo}
              </T>
              <T size={13} color={c.textSecondary} numberOfLines={1}>
                {`${tituloAlerta(pedido.a)} · ${pedido.a.dispositivo_nombre}`}
              </T>
            </View>
            <View style={{ gap: 6 }}>
              <T peso={600} size={13} lh={18} color={c.textSecondary}>
                {form.etiqueta}
              </T>
              <TextInput
                value={nota}
                onChangeText={(t) => {
                  setNota(t)
                  setError(null)
                }}
                placeholder={form.ejemplo}
                placeholderTextColor={c.textMuted}
                multiline
                maxLength={NOTA_MAX}
                autoFocus
                editable={!enviando}
                accessibilityLabel={form.etiqueta}
                textAlignVertical="top"
                style={[
                  s.campo,
                  { color: c.textPrimary, fontFamily: font[500], backgroundColor: c.surfaceMuted, borderColor: error ? c.danger : c.borderStrong },
                ]}
              />
              <View style={s.entre}>
                <T size={12} color={c.textMuted} style={{ flex: 1 }}>
                  {corta ? `Escribe al menos ${NOTA_MIN} caracteres.` : 'Queda en el historial de la alerta.'}
                </T>
                <T size={12} num color={c.textMuted}>
                  {`${nota.length}/${NOTA_MAX}`}
                </T>
              </View>
              {error ? (
                <View style={s.fila6}>
                  <Icon name="circle-x" size={14} color={c.danger} />
                  <T size={12} lh={16} color={c.danger} style={{ flex: 1 }}>
                    {error}
                  </T>
                </View>
              ) : null}
            </View>
            <View style={s.botones}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" size="lg" block disabled={enviando} onPress={cerrar}>
                  Cancelar
                </Button>
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  variant={pedido.accion === 'descartar' ? 'destructive' : 'primary'}
                  size="lg"
                  icon={form.icono}
                  block
                  disabled={corta || enviando}
                  onPress={guardar}
                >
                  {enviando ? 'Guardando…' : form.boton}
                </Button>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  )
}

// Atender o descartar con nota: `abrir(alerta, accion)` muestra la hoja y `hoja` se coloca en la
// pantalla. `alTerminar` se llama al guardar (para refrescar los datos).
export function useResolver(alTerminar) {
  const [pedido, setPedido] = useState(null)
  const abrir = (a, accion) => setPedido({ a, accion })
  const hoja = <HojaResolver pedido={pedido} alCerrar={() => setPedido(null)} alTerminar={alTerminar} />
  return { abrir, hoja }
}

const s = StyleSheet.create({
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  abajo: { flex: 1, justifyContent: 'flex-end' },
  hoja: { gap: 16, paddingTop: 10, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  campo: { minHeight: 112, maxHeight: 200, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderRadius: radius.sm, borderWidth: 1.5, fontSize: 15 },
  entre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  botones: { flexDirection: 'row', gap: 10 },
})
