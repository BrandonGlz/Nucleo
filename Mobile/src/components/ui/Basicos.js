import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useTema } from '../../context/TemaContext'
import { font, radius } from '../../theme'
import { Icon } from './Icon'
import { T } from './Texto'

// Curva y duraciones de movimiento, las mismas que la web (--ease-standard, --duration-base / slow).
export const MOV = { curva: Easing.bezier(0.2, 0, 0, 1), base: 200, lento: 320 }

// Valor animado que sigue a `destino`; sin animaciones salta directo.
function useSigue(destino, duracion = MOV.base, nativo = false) {
  const animar = useAnimaciones()
  const [v] = useState(() => new Animated.Value(destino))
  useEffect(() => {
    if (!animar) {
      v.setValue(destino)
      return
    }
    Animated.timing(v, { toValue: destino, duration: duracion, easing: MOV.curva, useNativeDriver: nativo }).start()
  }, [destino, animar, duracion, nativo, v])
  return v
}

// Entrada de un bloque o fila: aparece y sube un poco, escalonado por `indice` (como ui-sube en la web).
export function Aparece({ indice = 0, style, children }) {
  const animar = useAnimaciones()
  const [p] = useState(() => new Animated.Value(animar ? 0 : 1))
  useEffect(() => {
    if (!animar) return
    Animated.timing(p, { toValue: 1, duration: 220, delay: Math.min(indice, 6) * 30, easing: MOV.curva, useNativeDriver: true }).start()
  }, [animar, indice, p])
  const sube = p.interpolate({ inputRange: [0, 1], outputRange: [8, 0] })
  return <Animated.View style={[style, { opacity: p, transform: [{ translateY: sube }] }]}>{children}</Animated.View>
}

// Tonos de nc-tone--*: fondo y color de texto.
export function tono(c, t) {
  return {
    neutral: [c.surfaceMuted, c.textSecondary],
    accent: [c.accent, c.accentContrast],
    ink: [c.textPrimary, c.surface],
    success: [c.successSoft, c.success],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
    offline: [c.offlineSoft, c.offline],
  }[t ?? 'neutral']
}

export const STATUS = {
  normal: { tone: 'success', icon: 'circle-check', label: 'Normal' },
  warning: { tone: 'warning', icon: 'triangle-alert', label: 'Advertencia' },
  critical: { tone: 'danger', icon: 'octagon-alert', label: 'Crítico' },
  offline: { tone: 'offline', icon: 'wifi-off', label: 'Sin señal' },
}
export const LEVEL = {
  info: { tone: 'neutral', icon: 'info' },
  normal: { tone: 'success', icon: 'circle-check' },
  warning: { tone: 'warning', icon: 'triangle-alert' },
  critical: { tone: 'danger', icon: 'octagon-alert' },
  offline: { tone: 'offline', icon: 'wifi-off' },
}

export function Badge({ tone: t, icon, dot, size, children }) {
  const { c } = useTema()
  const [bg, fg] = tono(c, t)
  const lg = size === 'lg'
  return (
    <View style={[s.badge, { backgroundColor: bg, height: lg ? 30 : 24, paddingLeft: lg ? 10 : 8, paddingRight: lg ? 12 : 10 }]}>
      {icon ? <Icon name={icon} size={14} color={fg} /> : dot ? <View style={[s.dot, { backgroundColor: fg }]} /> : null}
      <T peso={600} size={lg ? 13 : 12} lh={16} color={fg}>
        {children}
      </T>
    </View>
  )
}

export function StatusBadge({ status = 'normal', label, size }) {
  const st = STATUS[status]
  return (
    <Badge tone={st.tone} icon={st.icon} size={size}>
      {label ?? st.label}
    </Badge>
  )
}

export function IconCircle({ name, size = 'md', tone: t = 'neutral' }) {
  const { c } = useTema()
  // El círculo neutro lleva el verde suave del acento (en oscuro queda como antes).
  const [bg, fg] = t === 'neutral' ? [c.iconoNeutro, c.iconoNeutroTexto] : tono(c, t)
  const lado = { sm: 32, md: 40, lg: 48 }[size] ?? 40
  return (
    <View style={[s.circulo, { width: lado, height: lado, backgroundColor: bg }]}>
      <Icon name={name} size={Math.round(lado * 0.45)} color={fg} />
    </View>
  )
}

const iniciales = (n = '') =>
  n
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

// `foto`: fuente de la imagen ({uri, headers}); si falta o no carga, quedan las iniciales.
export function Avatar({ name, size = 40, foto }) {
  const { c } = useTema()
  const [fallida, setFallida] = useState(null)
  const conFoto = !!foto?.uri && fallida !== foto.uri
  // Misma fuente mientras no cambien la ruta ni el token: un objeto nuevo en cada render haría
  // que la imagen se volviera a pedir.
  const uri = foto?.uri
  const auth = foto?.headers?.Authorization
  const fuente = useMemo(() => (uri ? { uri, ...(auth ? { headers: { Authorization: auth } } : {}) } : null), [uri, auth])
  return (
    <View style={[s.circulo, { width: size, height: size, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }]}>
      {conFoto ? (
        <Image
          source={fuente}
          style={{ width: size, height: size }}
          onError={() => setFallida(foto.uri)}
          accessibilityLabel={name ? `Foto de ${name}` : 'Foto de perfil'}
        />
      ) : (
        <T peso={700} size={Math.round(size * 0.38)} style={{ letterSpacing: -0.2 }}>
          {iniciales(name)}
        </T>
      )}
    </View>
  )
}

export function Battery({ level = 0, hideLabel, color }) {
  const { c } = useTema()
  const fg = color ?? (level <= 15 ? c.danger : level <= 30 ? c.warning : c.textSecondary)
  return (
    <View style={s.fila6}>
      <View style={[s.bateria, { borderColor: fg }]}>
        <View style={{ width: `${Math.max(4, Math.min(100, level))}%`, height: '100%', borderRadius: 1.5, backgroundColor: fg }} />
        <View style={[s.borne, { backgroundColor: fg }]} />
      </View>
      {!hideLabel && (
        <T peso={600} size={13} num color={fg}>
          {Math.round(level)}%
        </T>
      )}
    </View>
  )
}

export function Card({ padding = 'md', style, children }) {
  const { c } = useTema()
  const p = { sm: 16, md: 24, lg: 32 }[padding] ?? 24
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: p }, style]}>{children}</View>
}

const ALTO_BOTON = { sm: 36, md: 44, lg: 56 }
export function Button({ variant = 'primary', size = 'md', icon, block, disabled, onPress, children }) {
  const { c } = useTema()
  const colores = {
    primary: [c.accent, c.accentContrast, 'transparent'],
    secondary: [c.surface, c.textPrimary, c.borderStrong],
    ghost: ['transparent', c.textPrimary, 'transparent'],
    destructive: [c.danger, c.dangerContrast, 'transparent'],
    danger: [c.dangerSoft, c.danger, 'transparent'],
  }[variant]
  const [bg, fg, borde] = disabled ? [c.surfaceMuted, c.textMuted, 'transparent'] : colores
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.boton,
        { height: ALTO_BOTON[size], paddingHorizontal: size === 'lg' ? 32 : size === 'md' ? 20 : 16, backgroundColor: bg, borderColor: borde },
        block && { alignSelf: 'stretch' },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
      ]}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 20 : 18} color={fg} />}
      <T peso={600} size={size === 'lg' ? 16 : size === 'md' ? 14 : 13} color={fg}>
        {children}
      </T>
    </Pressable>
  )
}

// IconButton: variante oscura `inverse` para la zona oscura de las pantallas.
export function IconButton({ icon, label, badge, size = 'md', variant = 'secondary', inverse, onPress }) {
  const { c } = useTema()
  const lado = size === 'lg' ? 48 : size === 'sm' ? 32 : 44
  const bg = inverse ? 'rgba(243,245,242,0.08)' : variant === 'primary' ? c.accent : variant === 'ghost' ? 'transparent' : c.surface
  const fg = inverse ? '#F3F5F2' : variant === 'primary' ? c.accentContrast : c.textPrimary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        s.circulo,
        { width: lado, height: lado, backgroundColor: bg, borderWidth: inverse ? 0 : 1, borderColor: variant === 'secondary' ? c.border : 'transparent' },
        pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] },
      ]}
    >
      <Icon name={icon} size={20} color={fg} />
      {badge ? (
        <View style={[s.insignia, { backgroundColor: c.danger, borderColor: inverse ? '#121413' : c.surface }]}>
          <T peso={700} size={11} lh={14} color={c.dangerContrast}>
            {badge}
          </T>
        </View>
      ) : null}
    </Pressable>
  )
}

export function Input({ label, icon, suffix, error, secureTextEntry, ...rest }) {
  const { c } = useTema()
  return (
    <View style={{ gap: 6 }}>
      {label && (
        <T peso={600} size={13} lh={18} color={c.textSecondary}>
          {label}
        </T>
      )}
      <View style={[s.input, { backgroundColor: c.surfaceMuted, borderColor: error ? c.danger : c.borderStrong }]}>
        {icon && <Icon name={icon} size={18} color={c.textMuted} />}
        <TextInput
          {...rest}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={c.textMuted}
          style={[s.campo, { color: c.textPrimary, fontFamily: font[500] }]}
        />
        {suffix && (
          <T peso={600} size={13} color={c.textMuted}>
            {suffix}
          </T>
        )}
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
  )
}

export function Chip({ selected, count, onPress, children }) {
  const { c } = useTema()
  // El fondo y el borde pasan de un color a otro en lugar de cambiar de golpe.
  const p = useSigue(selected ? 1 : 0)
  const fondo = p.interpolate({ inputRange: [0, 1], outputRange: [c.surface, c.seleccion] })
  const borde = p.interpolate({ inputRange: [0, 1], outputRange: [c.border, c.seleccion] })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.95 }] }}
    >
      <Animated.View style={[s.chip, { backgroundColor: fondo, borderColor: borde }]}>
        <T peso={600} size={13} color={selected ? c.seleccionTexto : c.textSecondary}>
          {children}
        </T>
        {count != null && (
          <View style={[s.cuenta, { backgroundColor: selected ? c.cuentaSeleccion : c.surfaceMuted }]}>
            <T peso={600} size={11} lh={20} color={selected ? c.cuentaSeleccionTexto : c.textSecondary}>
              {count}
            </T>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

// La pastilla oscura se desliza hasta la pestaña elegida (posición y ancho medidos de cada pestaña).
// `compacto`: más bajo y con letra menor, para ponerlo dentro de una tarjeta.
// `lleno`: las pestañas se reparten todo el ancho (la pastilla llega hasta el borde).
export function Tabs({ items, value, onChange, compacto, lleno }) {
  const { c } = useTema()
  const [medidas, setMedidas] = useState({})
  const animar = useAnimaciones()
  const m = medidas[value]
  // Bordes izquierdo y derecho de la pastilla, animados en el hilo nativo (no se traban mientras se
  // dibuja la pantalla). Son dos tapas redondas y un centro que se estira entre ellas, como la barra
  // de pestañas, porque el ancho no se puede animar en el hilo nativo.
  const [izq] = useState(() => new Animated.Value(0))
  const [der] = useState(() => new Animated.Value(0))
  const colocada = useRef(false)
  useEffect(() => {
    if (!m) return
    if (!colocada.current || !animar) {
      izq.setValue(m.x)
      der.setValue(m.x + m.w)
      colocada.current = true
      return
    }
    const ir = (v, a) => Animated.timing(v, { toValue: a, duration: 260, easing: MOV.curva, useNativeDriver: true })
    Animated.parallel([ir(izq, m.x), ir(der, m.x + m.w)]).start()
  }, [m, animar, izq, der])
  const alto = m?.h ?? 0
  const BASE = 100
  const escala = Animated.add(der, Animated.multiply(izq, -1)).interpolate({
    inputRange: [alto, alto + BASE],
    outputRange: [0.001, 1],
    extrapolateLeft: 'clamp',
  })
  const centro = Animated.add(Animated.multiply(Animated.add(izq, der), 0.5), -BASE / 2)
  const pieza = [s.tabPieza, { top: m?.y ?? 0, height: alto, backgroundColor: c.seleccion }]
  return (
    <View style={[s.tabs, compacto && { padding: 3, gap: 2 }, { backgroundColor: c.surfaceMuted }]}>
      {m ? (
        <>
          <Animated.View pointerEvents="none" style={[pieza, { width: alto, borderRadius: alto / 2, transform: [{ translateX: izq }] }]} />
          <Animated.View pointerEvents="none" style={[pieza, { width: alto, borderRadius: alto / 2, transform: [{ translateX: Animated.add(der, -alto) }] }]} />
          <Animated.View pointerEvents="none" style={[pieza, { width: BASE, transform: [{ translateX: centro }, { scaleX: escala }] }]} />
        </>
      ) : null}
      {items.map((it) => {
        const activo = it.id === value
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            onPress={() => onChange?.(it.id)}
            onLayout={(e) => {
              const { x: px, y: py, width, height } = e.nativeEvent.layout
              const a = medidas[it.id]
              if (a?.x === px && a?.w === width && a?.h === height && a?.y === py) return
              setMedidas((ant) => ({ ...ant, [it.id]: { x: px, y: py, w: width, h: height } }))
            }}
            style={({ pressed }) => [s.tab, compacto && s.tabCompacto, lleno && { flex: 1, paddingHorizontal: 8 }, !m && activo && { backgroundColor: c.seleccion }, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <T peso={600} size={compacto ? 12 : 14} color={activo ? c.seleccionTexto : c.textSecondary}>
              {it.label}
            </T>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Toggle({ label, value, onChange }) {
  const { c } = useTema()
  const x = useSigue(value ? 20 : 0, 180, true)
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value }}
      onPress={() => onChange?.(!value)}
      style={s.toggleFila}
    >
      <T peso={500} size={14} style={{ flex: 1 }}>
        {label}
      </T>
      <View style={[s.toggle, { backgroundColor: value ? c.accent : c.borderStrong }]}>
        <Animated.View style={[s.pulgar, { backgroundColor: value ? c.accentContrast : c.surface, transform: [{ translateX: x }] }]} />
      </View>
    </Pressable>
  )
}

// Bloque gris animado mientras cargan los datos.
export function Skeleton({ width = '100%', height = 16, round, style }) {
  const { c } = useTema()
  const [o] = useState(() => new Animated.Value(0.5))
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [o])
  return (
    <Animated.View
      style={[{ width, height, borderRadius: round ? 999 : radius.xs, backgroundColor: c.border, opacity: o }, style]}
    />
  )
}

export function ActivityFeed({ items = [] }) {
  const { c } = useTema()
  return (
    <View>
      {items.map((it, i) => {
        const lv = LEVEL[it.level ?? 'info']
        const [bg, fg] = tono(c, lv.tone)
        return (
          <View key={i} style={[s.feed, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
            <View style={[s.circulo, { width: 32, height: 32, backgroundColor: bg }]}>
              <Icon name={it.icon ?? lv.icon} size={16} color={fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T peso={600} size={14} lh={20}>
                {it.title}
              </T>
              {it.meta ? (
                <T size={12} lh={16} color={c.textMuted}>
                  {it.meta}
                </T>
              ) : null}
            </View>
            <T peso={500} size={12} lh={20} num color={c.textMuted}>
              {it.time}
            </T>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  circulo: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, flexShrink: 0 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bateria: { width: 24, height: 12, borderRadius: 4, borderWidth: 1.5, padding: 1.5 },
  borne: { position: 'absolute', right: -4.5, top: 2.5, width: 2, height: 4, borderTopRightRadius: 1, borderBottomRightRadius: 1 },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, borderWidth: 1 },
  insignia: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingLeft: 16, paddingRight: 12, borderRadius: radius.sm, borderWidth: 1.5 },
  campo: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, padding: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1 },
  cuenta: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999 },
  tabPieza: { position: 'absolute', left: 0 },
  tabCompacto: { height: 28, paddingHorizontal: 10 },
  tab: { height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  toggleFila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  toggle: { width: 48, height: 28, borderRadius: 14 },
  pulgar: { position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11 },
  feed: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
})
