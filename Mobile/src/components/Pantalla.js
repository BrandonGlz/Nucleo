import { Children, useEffect, useState } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnimaciones } from '../context/PreferenciasContext'
import { TemaFijo, useTema } from '../context/TemaContext'
import { marca } from '../theme'
import { LogoMark } from './ui'

// Decoraciones de la zona oscura: anillos y el ícono verde, según la pantalla.
function Deco({ tipo }) {
  const anillo = (st, color = 'rgba(243,245,242,0.08)') => <View style={[s.anillo, { borderColor: color }, st]} />
  if (tipo === 'centro') return <View style={s.deco}>{anillo({ alignSelf: 'center', top: 60, width: 330, height: 330 })}</View>
  if (tipo === 'perfil')
    return (
      <View style={s.deco}>
        {anillo({ alignSelf: 'center', top: -40, width: 360, height: 360 })}
        {anillo({ alignSelf: 'center', top: 15, width: 250, height: 250 })}
        <View style={{ position: 'absolute', right: -36, bottom: -40 }}>
          <LogoMark tone="verde" size={120} />
        </View>
      </View>
    )
  const rojo = tipo === 'alerta'
  return (
    <View style={s.deco}>
      {anillo({ right: -150, bottom: -170, width: 300, height: 300 }, rojo ? 'rgba(255,107,94,0.22)' : undefined)}
      {anillo({ right: -100, bottom: -120, width: 200, height: 200 }, rojo ? 'rgba(255,107,94,0.14)' : undefined)}
      {!rojo && (
        <View style={{ position: 'absolute', right: -50, bottom: -60, opacity: 0.2 }}>
          <LogoMark tone="verde" size={150} />
        </View>
      )}
    </View>
  )
}

// Esquema de las pantallas móviles: zona oscura con el dato principal y hoja clara que
// sube sobre ella con el resto. Todo hace scroll; `pestanas` deja lugar a la barra flotante y
// `compacta` reduce los márgenes para que la pantalla quepa sin desplazarse.
export function Pantalla({ zona, deco = 'anillos', pestanas = true, compacta, recargando, onRecargar, children }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
  // Cada vez que se entra a la pantalla (también al volver a una pestaña) la zona oscura aparece, la
  // hoja clara sube y su contenido entra escalonado, como los módulos de la web.
  const animar = useAnimaciones()
  const enfocada = useIsFocused()
  const [p] = useState(() => new Animated.Value(animar ? 0 : 1))
  useEffect(() => {
    if (!enfocada) return
    if (!animar) {
      p.setValue(1)
      return
    }
    p.setValue(0)
    Animated.timing(p, { toValue: 1, duration: 560, easing: Easing.bezier(0.2, 0, 0, 1), useNativeDriver: true }).start()
  }, [enfocada, animar, p])
  const tramo = (desde, hasta, de, a) => p.interpolate({ inputRange: [0, desde, hasta, 1], outputRange: [de, de, a, a] })
  const subeHoja = { opacity: tramo(0, 0.6, 0, 1), transform: [{ translateY: tramo(0, 0.6, 40, 0) }] }
  const apareceZona = { opacity: tramo(0, 0.5, 0, 1), transform: [{ translateY: tramo(0, 0.5, -8, 0) }] }
  // Escalón de cada bloque de la hoja: empieza un poco después del anterior.
  const bloque = (i) => {
    const desde = Math.min(0.12 + i * 0.07, 0.5)
    return { opacity: tramo(desde, desde + 0.4, 0, 1), transform: [{ translateY: tramo(desde, desde + 0.4, 16, 0) }] }
  }
  return (
    <View style={{ flex: 1, backgroundColor: marca.tinta }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRecargar ? <RefreshControl refreshing={!!recargando} onRefresh={onRecargar} tintColor={marca.claro} /> : undefined
        }
      >
        <TemaFijo tema="dark">
          <View style={[s.zona, { paddingTop: inset.top + (compacta ? 8 : 16) }, compacta && { paddingBottom: 22 }]}>
            <Deco tipo={deco} />
            <Animated.View style={[{ gap: compacta ? 12 : 16 }, apareceZona]}>{zona}</Animated.View>
          </View>
        </TemaFijo>
        <Animated.View
          style={[
            s.hoja,
            subeHoja,
            { backgroundColor: c.background, paddingBottom: (pestanas ? (compacta ? 100 : 120) : 32) + inset.bottom },
            compacta && { paddingTop: 16, gap: 12 },
          ]}
        >
          {Children.toArray(children).map((hijo, i) => (
            <Animated.View key={hijo.key ?? i} style={[{ gap: compacta ? 12 : 14 }, bloque(i)]}>
              {hijo}
            </Animated.View>
          ))}
        </Animated.View>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  zona: { paddingHorizontal: 20, paddingBottom: 30, overflow: 'hidden' },
  deco: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  anillo: { position: 'absolute', borderRadius: 999, borderWidth: 2 },
  hoja: {
    flexGrow: 1, marginTop: -4, paddingTop: 20, paddingHorizontal: 16, gap: 14,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 40, shadowOffset: { width: 0, height: -12 }, elevation: 8,
  },
})
