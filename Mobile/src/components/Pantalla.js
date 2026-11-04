import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TemaFijo, useTema } from '../context/TemaContext'
import { marca } from '../theme'
import { LogoMark } from './ui'

// Decoraciones de la zona oscura: anillos y el ícono lima, según la pantalla.
function Deco({ tipo }) {
  const anillo = (st, color = 'rgba(243,245,242,0.08)') => <View style={[s.anillo, { borderColor: color }, st]} />
  if (tipo === 'centro') return <View style={s.deco}>{anillo({ alignSelf: 'center', top: 60, width: 330, height: 330 })}</View>
  if (tipo === 'perfil')
    return (
      <View style={s.deco}>
        {anillo({ alignSelf: 'center', top: -40, width: 360, height: 360 })}
        {anillo({ alignSelf: 'center', top: 15, width: 250, height: 250 })}
        <View style={{ position: 'absolute', right: -36, bottom: -40 }}>
          <LogoMark tone="lima" size={120} />
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
          <LogoMark tone="lima" size={150} />
        </View>
      )}
    </View>
  )
}

// Esquema de las pantallas móviles: zona oscura con el dato principal y hoja clara que
// sube sobre ella con el resto. Todo hace scroll; `pestanas` deja lugar a la barra flotante.
export function Pantalla({ zona, deco = 'anillos', pestanas = true, recargando, onRecargar, children }) {
  const { c } = useTema()
  const inset = useSafeAreaInsets()
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
          <View style={[s.zona, { paddingTop: inset.top + 16 }]}>
            <Deco tipo={deco} />
            <View style={{ gap: 16 }}>{zona}</View>
          </View>
        </TemaFijo>
        <View style={[s.hoja, { backgroundColor: c.background, paddingBottom: (pestanas ? 120 : 32) + inset.bottom }]}>
          {children}
        </View>
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
