import { useEffect, useRef, useState } from 'react'
import { Animated, Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useTema } from '../../context/TemaContext'
import { Logo, MOV } from '../../components/ui'
import { marca } from '../../theme'

// Nico asomado (Docs/Nico/loginBlanco.jpeg y loginoscuro3.jpeg, recortados y con fondo transparente).
// El borde recto de su sudadera queda justo en el borde de la hoja y las manos caen sobre ella.
const NICO = { claro: require('../../../assets/nico-acceso-claro.webp'), oscuro: require('../../../assets/nico-acceso-oscuro.webp') }
const ALTO_NICO = 188
const ANCHO_NICO = Math.round((ALTO_NICO * 420) / 560)
// Parte de la imagen bajo el borde de la sudadera (las manos): 36 de sus 560 px.
const SOBRE_HOJA = Math.round((ALTO_NICO * 36) / 560)

// Marco de las pantallas sin sesión (acceso y solicitud de cuenta), como .acceso en la web:
// zona superior con el logo y Nico asomándose sobre la hoja que lleva el formulario.
// La zona superior sigue el tema: clara con la imagen de fondo blanco, oscura con la de fondo negro.
// `camposY`: ref con la posición de los campos dentro de la hoja, para recorrer hasta ellos al abrir el teclado.
export function MarcoAcceso({ camposY, children }) {
  const { c, oscuro } = useTema()
  const inset = useSafeAreaInsets()
  const animar = useAnimaciones()
  const fondo = oscuro ? marca.tinta : c.background
  // Con el teclado abierto la hoja sube sobre él y se recorre hasta los campos.
  const scroll = useRef(null)
  const hojaY = useRef(0)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      scroll.current?.scrollTo({ y: Math.max(0, hojaY.current + (camposY?.current ?? 0) - 24), animated: true }),
    )
    return () => sub.remove()
  }, [camposY])
  // Nico sube un poco y aparece al abrir la pantalla; sin animaciones ya está en su lugar.
  const [p] = useState(() => new Animated.Value(animar ? 0 : 1))
  useEffect(() => {
    if (!animar) {
      p.setValue(1)
      return
    }
    Animated.timing(p, { toValue: 1, duration: 700, delay: 120, easing: MOV.curva, useNativeDriver: true }).start()
  }, [animar, p])
  const sube = p.interpolate({ inputRange: [0, 1], outputRange: [18, 0] })

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: fondo }} behavior="padding">
      <StatusBar style={oscuro ? 'light' : 'dark'} />
      <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Alto mínimo para que Nico nunca quede bajo la barra de estado o el notch. */}
        <View style={[s.arriba, { paddingTop: inset.top + 48, minHeight: Math.max(230, inset.top + 16 + ALTO_NICO - SOBRE_HOJA) }]}>
          <View style={[s.anillo, { borderColor: oscuro ? 'rgba(243,245,242,0.08)' : 'rgba(18,20,19,0.07)' }]} />
          <View style={[s.halo, { backgroundColor: oscuro ? 'rgba(43,196,122,0.10)' : 'rgba(43,196,122,0.14)' }]} />
          <Logo size={40} inverse={oscuro} />
        </View>
        <View
          style={[s.hoja, { backgroundColor: c.surface, paddingBottom: inset.bottom + 44 }]}
          onLayout={(e) => (hojaY.current = e.nativeEvent.layout.y)}
        >
          <Animated.Image
            source={oscuro ? NICO.oscuro : NICO.claro}
            resizeMode="contain"
            accessible={false}
            pointerEvents="none"
            style={[s.nico, { opacity: p, transform: [{ translateY: sube }] }]}
          />
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  arriba: { flex: 1, paddingHorizontal: 28, overflow: 'hidden' },
  anillo: { position: 'absolute', right: -150, top: 40, width: 420, height: 420, borderRadius: 999, borderWidth: 2 },
  halo: { position: 'absolute', right: 28 + ANCHO_NICO / 2 - 110, bottom: -70, width: 220, height: 220, borderRadius: 999 },
  nico: { position: 'absolute', right: 28, top: -(ALTO_NICO - SOBRE_HOJA), width: ANCHO_NICO, height: ALTO_NICO, zIndex: 2 },
  hoja: {
    gap: 24, paddingTop: 32, paddingHorizontal: 24, borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: -12 }, elevation: 8,
  },
})
