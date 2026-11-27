import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTema } from '../context/TemaContext'
import { enLinea } from '../utils/convertir'
import { haceCuanto } from '../utils/formato'
import { Icon, IconCircle, T } from './ui'

const nombre = (alcance, area, dispositivo) =>
  alcance === 'AREA' ? `Área: ${area?.nombre ?? 'sin elegir'}` : alcance === 'ORGANIZACION' ? 'Toda la organización' : `Dispositivo: ${dispositivo?.nombre ?? 'sin elegir'}`

// Selector único de Nico: hoja inferior con Dispositivos, Áreas y Toda la organización.
export function SelectorAlcance({ dispositivos, areas, alcance, area, valor, onElegir, puedeOrganizacion }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  const [abierto, setAbierto] = useState(false)
  const actual = nombre(alcance, area, dispositivos.find((d) => d.num === valor))
  const elegir = (datos) => {
    onElegir(datos)
    setAbierto(false)
  }
  return (
    <>
      <Pressable
        onPress={() => setAbierto(true)}
        accessibilityRole="button"
        accessibilityLabel={`${actual}. Cambiar alcance`}
        style={({ pressed }) => [s.campo, pressed && { opacity: 0.85 }]}
      >
        <Icon name={alcance === 'DISPOSITIVO' ? 'cpu' : 'map-pin'} size={18} color="#2BC47A" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T size={11} color="rgba(243,245,242,0.55)" mayus>Alcance</T>
          <T peso={700} size={15} numberOfLines={1}>{actual}</T>
        </View>
        <Icon name="chevron-down" size={20} color="rgba(243,245,242,0.7)" />
      </Pressable>
      <Modal visible={abierto} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setAbierto(false)}>
        <Pressable style={s.fondo} onPress={() => setAbierto(false)} accessibilityLabel="Cerrar selector de alcance" />
        <View style={[s.hoja, { backgroundColor: c.background, paddingBottom: 16 + inset.bottom }]}>
          <View style={[s.asa, { backgroundColor: c.border }]} />
          <T peso={700} size={18} style={{ paddingHorizontal: 20, paddingBottom: 8 }}>¿Sobre qué preguntas?</T>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <T mayus color={c.textMuted} style={{ paddingHorizontal: 4 }}>Dispositivos</T>
            {dispositivos.map((d) => (
              <Opcion
                key={`d-${d.num}`}
                icono="cpu"
                titulo={d.nombre}
                detalle={enLinea(d) ? 'En línea' : `Sin conexión · ${haceCuanto(d.ultima_conexion).toLowerCase()}`}
                activo={alcance === 'DISPOSITIVO' && d.num === valor}
                onPress={() => elegir({ alcance: 'DISPOSITIVO', dispositivo: d.num, area: d.area })}
              />
            ))}
            {areas.length > 0 && <T mayus color={c.textMuted} style={{ paddingHorizontal: 4, marginTop: 8 }}>Áreas</T>}
            {areas.map((a) => (
              <Opcion
                key={`a-${a.num}`}
                icono="map-pin"
                titulo={a.nombre}
                detalle={a.puente_nico ? 'Con ESP de Nico' : 'Sin ESP de Nico asignado'}
                activo={alcance === 'AREA' && a.num === area?.num}
                onPress={() => elegir({ alcance: 'AREA', area: a.num, dispositivo: a.puente_nico ?? valor })}
              />
            ))}
            {puedeOrganizacion && (
              <>
                <T mayus color={c.textMuted} style={{ paddingHorizontal: 4, marginTop: 8 }}>Organización</T>
                <Opcion
                  icono="building-2"
                  titulo="Toda la organización"
                  detalle="Suma las áreas a tu alcance"
                  activo={alcance === 'ORGANIZACION'}
                  onPress={() => elegir({ alcance: 'ORGANIZACION', area: null, dispositivo: valor })}
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

function Opcion({ icono, titulo, detalle, activo, onPress }) {
  const { c } = useTema()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={({ pressed }) => [s.opcion, { backgroundColor: c.surface, borderColor: activo ? c.accent : c.border }, pressed && { opacity: 0.8 }]}
    >
      <IconCircle name={icono} size="sm" tone={activo ? 'accent' : 'neutral'} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T peso={700} size={15} numberOfLines={2}>{titulo}</T>
        <T size={12} color={c.textMuted} numberOfLines={1}>{detalle}</T>
      </View>
      {activo && <Icon name="circle-check" size={20} color={c.accent} />}
    </Pressable>
  )
}

const s = StyleSheet.create({
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5 },
  campo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, backgroundColor: 'rgba(243,245,242,0.08)' },
})
