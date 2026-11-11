import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useTema } from '../../context/TemaContext'
import { MOV } from './Basicos'
import { Icon } from './Icon'
import { T } from './Texto'

// Barra flotante oscura de pestañas. items: [{ id, label, icon, count }]; la activa muestra su etiqueta.
// Al cambiar, la pastilla verde se desliza hasta la pestaña elegida (posición y ancho medidos), las
// pestañas se reacomodan con una transición y la etiqueta nueva aparece suavemente.
const ALTO = 52 // alto de cada pestaña
const BASE = 100 // ancho de referencia del centro de la pastilla antes de estirarlo
const TRANSICION = { duration: MOV.lento, update: { type: LayoutAnimation.Types.easeInEaseOut } }

function Etiqueta({ color, children }) {
  const animar = useAnimaciones()
  const [o] = useState(() => new Animated.Value(animar ? 0 : 1))
  useEffect(() => {
    if (animar) Animated.timing(o, { toValue: 1, duration: MOV.lento, delay: 80, easing: MOV.curva, useNativeDriver: true }).start()
  }, [animar, o])
  return (
    <Animated.View style={{ opacity: o }}>
      <T peso={700} size={14} color={color}>
        {children}
      </T>
    </Animated.View>
  )
}

export function TabBar({ items, active, onChange }) {
  const { c } = useTema()
  const animar = useAnimaciones()
  const [medidas, setMedidas] = useState({})
  // La barra marca la pestaña al instante y navega un cuadro después: así la pastilla ya va en
  // camino mientras se dibuja la pantalla nueva. Si la pestaña cambia por fuera, la sigue.
  const [elegida, setElegida] = useState(active)
  const [antes, setAntes] = useState(active)
  if (active !== antes) {
    setAntes(active)
    setElegida(active)
  }
  // Solo vale la medida tomada con la pestaña ya activa (con su etiqueta); la de antes llevaría la
  // pastilla a un lugar intermedio y luego la regresaría.
  const m = medidas[elegida]?.activo ? medidas[elegida] : null
  const [ultima, setUltima] = useState(null)
  if (m && m !== ultima) setUltima(m)
  const pastilla = m ?? ultima
  // Bordes izquierdo y derecho de la pastilla. Se animan en el hilo nativo para que el movimiento
  // no se trabe mientras se dibuja la pantalla nueva.
  const [izq] = useState(() => new Animated.Value(0))
  const [der] = useState(() => new Animated.Value(0))
  const colocada = useRef(false)
  // Pestaña pendiente de navegar: se navega en cuanto arranca la pastilla, o a los 120 ms si no hubo medida.
  const pendiente = useRef(null)
  const reloj = useRef(null)
  const alCambiar = useRef(onChange)
  useEffect(() => {
    alCambiar.current = onChange
  })
  const navegar = useCallback(() => {
    const id = pendiente.current
    if (id == null) return
    pendiente.current = null
    clearTimeout(reloj.current)
    setTimeout(() => alCambiar.current?.(id), 0)
  }, [])
  useEffect(() => () => clearTimeout(reloj.current), [])
  useEffect(() => {
    if (!m) return
    if (!colocada.current || !animar) {
      izq.setValue(m.x)
      der.setValue(m.x + m.w)
      colocada.current = true
      return
    }
    const ir = (v, a) => Animated.timing(v, { toValue: a, duration: MOV.lento, easing: MOV.curva, useNativeDriver: true })
    Animated.parallel([ir(izq, m.x), ir(der, m.x + m.w)]).start()
    // Con la pastilla ya en movimiento (en el hilo nativo) se cambia de pantalla.
    navegar()
  }, [m, animar, izq, der, navegar])
  // La pastilla son dos extremos redondos (ALTO × ALTO) y un centro que se estira entre ellos:
  // el centro mide (der − izq − ALTO) y queda a la mitad de los dos bordes.
  const escala = Animated.add(der, Animated.multiply(izq, -1)).interpolate({
    inputRange: [ALTO, ALTO + BASE],
    outputRange: [0.001, 1],
    extrapolateLeft: 'clamp',
  })
  const centro = Animated.add(Animated.multiply(Animated.add(izq, der), 0.5), -BASE / 2)

  return (
    <View style={[s.barra, { backgroundColor: c.sidebar, borderColor: c.border }]}>
      {pastilla && (
        <>
          <Animated.View testID="pastilla-izq" pointerEvents="none" style={[s.tapa, { backgroundColor: c.accent, transform: [{ translateX: izq }] }]} />
          <Animated.View testID="pastilla-der" pointerEvents="none" style={[s.tapa, { backgroundColor: c.accent, transform: [{ translateX: Animated.add(der, -ALTO) }] }]} />
          <Animated.View
            pointerEvents="none"
            style={[s.centro, { backgroundColor: c.accent, transform: [{ translateX: centro }, { scaleX: escala }] }]}
          />
        </>
      )}
      {items.map((it) => {
        const activo = it.id === elegida
        const color = activo ? c.accentContrast : c.sidebarTextMuted
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            accessibilityLabel={it.label}
            accessibilityState={{ selected: activo }}
            onPress={() => {
              if (activo) return
              if (animar) LayoutAnimation.configureNext(TRANSICION)
              setElegida(it.id)
              pendiente.current = it.id
              clearTimeout(reloj.current)
              reloj.current = setTimeout(navegar, animar ? 120 : 0)
            }}
            onLayout={(e) => {
              const { x: px, width } = e.nativeEvent.layout
              const igual = (a) => a?.x === px && a?.w === width && a?.activo === activo
              setMedidas((ant) => (igual(ant[it.id]) ? ant : { ...ant, [it.id]: { x: px, w: width, activo } }))
            }}
            style={({ pressed }) => [
              s.item,
              activo && { paddingLeft: 14, paddingRight: 18 },
              activo && !pastilla && { backgroundColor: c.accent },
              pressed && !activo && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <View>
              <Icon name={it.icon} size={22} color={color} />
              {it.count ? <View style={[s.punto, { backgroundColor: c.danger, borderColor: c.sidebar }]} /> : null}
            </View>
            {activo && <Etiqueta color={color}>{it.label}</Etiqueta>}
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  barra: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: 8,
    borderRadius: 999, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  // left: -1 compensa el borde de la barra (las medidas de onLayout lo incluyen)
  tapa: { position: 'absolute', top: 8, left: -1, width: ALTO, height: ALTO, borderRadius: ALTO / 2 },
  centro: { position: 'absolute', top: 8, left: -1, width: BASE, height: ALTO },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, minWidth: 52, paddingHorizontal: 14, borderRadius: 999 },
  punto: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
})
