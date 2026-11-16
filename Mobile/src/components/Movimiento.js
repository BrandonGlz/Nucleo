import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, View } from 'react-native'
import { useAnimaciones } from '../context/PreferenciasContext'
import { MOV } from './ui/Basicos'

// Punto «en vivo»: un halo que late alrededor del punto. Sin animaciones queda fijo.
export function PuntoVivo({ color, size = 8 }) {
  const animar = useAnimaciones()
  const [p] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!animar) return undefined
    const ciclo = Animated.loop(Animated.timing(p, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }))
    ciclo.start()
    return () => ciclo.stop()
  }, [animar, p])
  const halo = size * 2.6
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {animar && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: color,
            opacity: p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.45, 0, 0] }),
            transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  )
}

// Número que llega a su valor contando (400 ms) en lugar de saltar. Devuelve el texto a mostrar.
export function useCuenta(valor, decimales = 1) {
  const animar = useAnimaciones()
  const destino = valor == null || valor === '' || Number.isNaN(Number(valor)) ? null : Number(valor)
  const [mostrado, setMostrado] = useState(destino)
  const actual = useRef(destino)
  useEffect(() => {
    if (destino == null || !animar || actual.current == null) {
      actual.current = destino
      setMostrado(destino)
      return undefined
    }
    const desde = actual.current
    const inicio = Date.now()
    let cuadro
    const paso = () => {
      const k = Math.min(1, (Date.now() - inicio) / 400)
      const v = desde + (destino - desde) * (1 - (1 - k) ** 3)
      actual.current = v
      setMostrado(v)
      if (k < 1) cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [destino, animar])
  return mostrado == null ? '—' : mostrado.toFixed(decimales)
}

// Barra que crece desde abajo al aparecer, escalonada por `indice`.
export function BarraCrece({ indice = 0, style }) {
  const animar = useAnimaciones()
  const [p] = useState(() => new Animated.Value(animar ? 0 : 1))
  useEffect(() => {
    if (!animar) return
    Animated.timing(p, { toValue: 1, duration: 600, delay: Math.min(indice, 30) * 18, easing: MOV.curva, useNativeDriver: true }).start()
  }, [animar, indice, p])
  return (
    <Animated.View
      style={[style, { transformOrigin: 'bottom', transform: [{ scaleY: p.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) }] }]}
    />
  )
}
