import { useEffect, useState } from 'react'
import { Animated, Dimensions, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnimaciones } from '../context/PreferenciasContext'
import { useTema } from '../context/TemaContext'
import { enLinea } from '../utils/convertir'
import { haceCuanto } from '../utils/formato'
import { Icon, IconCircle, T } from './ui'

// Hoja que sube desde abajo con los dispositivos: nombre, si está en línea y su última conexión.
// El fondo se oscurece y la hoja sube al abrir; al cerrar hace lo mismo en reversa antes de ocultarse.
export function HojaDispositivos({ visible, dispositivos, valor, titulo = 'Elige un dispositivo', onElegir, onCerrar }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  const animar = useAnimaciones()
  const [montada, setMontada] = useState(visible)
  const [p] = useState(() => new Animated.Value(0))
  if (visible && !montada) setMontada(true)
  useEffect(() => {
    if (!montada) return
    Animated.timing(p, {
      toValue: visible ? 1 : 0,
      // Entra frenando al final; sale acelerando poco a poco para que el cierre se vea, no que se corte.
      duration: animar ? (visible ? 320 : 280) : 0,
      easing: visible ? Easing.bezier(0.2, 0, 0, 1) : Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !visible && setMontada(false))
  }, [visible, montada, animar, p])
  const alto = Dimensions.get('window').height
  const subida = p.interpolate({ inputRange: [0, 1], outputRange: [alto * 0.6, 0] })
  return (
    <Modal visible={montada} transparent animationType="none" statusBarTranslucent onRequestClose={onCerrar}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: p }]}>
        <Pressable style={s.fondo} onPress={onCerrar} accessibilityLabel="Cerrar" />
      </Animated.View>
      <Animated.View style={[s.hoja, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom, transform: [{ translateY: subida }] }]}>
        <View style={[s.asa, { backgroundColor: c.border }]} />
        <T peso={700} size={18} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {titulo}
        </T>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {dispositivos.map((d) => {
            const activo = d.num === valor
            const vivo = enLinea(d)
            return (
              <Pressable
                key={d.num}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                onPress={() => {
                  onElegir(d.num)
                  onCerrar()
                }}
                style={({ pressed }) => [
                  s.opcion,
                  { backgroundColor: c.surface, borderColor: activo ? c.accent : c.border },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <IconCircle name="cpu" size="sm" tone={activo ? 'accent' : 'neutral'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T peso={700} size={15}>
                    {d.nombre}
                  </T>
                  <View style={s.fila6}>
                    {vivo ? (
                      <View style={[s.punto, { backgroundColor: c.success }]} />
                    ) : (
                      <Icon name="wifi-off" size={12} color={c.textMuted} />
                    )}
                    <T size={12} color={c.textMuted}>
                      {vivo ? 'En línea' : `Sin conexión · ${haceCuanto(d.ultima_conexion).toLowerCase()}`}
                    </T>
                  </View>
                </View>
                {activo && <Icon name="circle-check" size={20} color={c.accent} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

// Campo tipo «select»: muestra el dispositivo elegido y abre la hoja al tocarlo.
// `children(abrir)` permite usar otro disparador (por ejemplo, la pastilla del Inicio).
export function SelectorDispositivo({ dispositivos, valor, onElegir, etiqueta = 'Dispositivo', children }) {
  const [abierto, setAbierto] = useState(false)
  const actual = dispositivos.find((d) => d.num === valor)
  const abrir = () => setAbierto(true)
  return (
    <>
      {children ? children(abrir) : (
        <Pressable
          onPress={abrir}
          accessibilityRole="button"
          accessibilityLabel={`${etiqueta}: ${actual?.nombre ?? 'sin elegir'}. Cambiar`}
          style={({ pressed }) => [s.campo, pressed && { opacity: 0.85 }]}
        >
          <Icon name="cpu" size={18} color="#2BC47A" />
          <View style={{ flex: 1 }}>
            <T size={11} color="rgba(243,245,242,0.55)" mayus>
              {etiqueta}
            </T>
            <T peso={700} size={15} numberOfLines={1}>
              {actual?.nombre ?? 'Elige un dispositivo'}
            </T>
          </View>
          <Icon name="chevron-down" size={20} color="rgba(243,245,242,0.7)" />
        </Pressable>
      )}
      <HojaDispositivos visible={abierto} dispositivos={dispositivos} valor={valor} onElegir={onElegir} onCerrar={() => setAbierto(false)} />
    </>
  )
}

const s = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  punto: { width: 7, height: 7, borderRadius: 4 },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(243,245,242,0.08)' },
})
