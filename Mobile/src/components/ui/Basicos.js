import { useEffect, useState } from 'react'
import { Animated, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTema } from '../../context/TemaContext'
import { font, radius } from '../../theme'
import { Icon } from './Icon'
import { T } from './Texto'

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
  const [bg, fg] = tono(c, t)
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

export function Avatar({ name, size = 40 }) {
  const { c } = useTema()
  return (
    <View style={[s.circulo, { width: size, height: size, backgroundColor: c.accentSoft, borderWidth: 1, borderColor: c.border }]}>
      <T peso={700} size={Math.round(size * 0.38)} style={{ letterSpacing: -0.2 }}>
        {iniciales(name)}
      </T>
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
        pressed && { opacity: 0.8 },
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: selected ? c.textPrimary : c.surface, borderColor: selected ? c.textPrimary : c.border }]}
    >
      <T peso={600} size={13} color={selected ? c.surface : c.textSecondary}>
        {children}
      </T>
      {count != null && (
        <View style={[s.cuenta, { backgroundColor: selected ? c.accent : c.surfaceMuted }]}>
          <T peso={600} size={11} lh={20} color={selected ? c.accentContrast : c.textSecondary}>
            {count}
          </T>
        </View>
      )}
    </Pressable>
  )
}

export function Tabs({ items, value, onChange }) {
  const { c } = useTema()
  return (
    <View style={[s.tabs, { backgroundColor: c.surfaceMuted }]}>
      {items.map((it) => {
        const activo = it.id === value
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            onPress={() => onChange?.(it.id)}
            style={[s.tab, activo && { backgroundColor: c.textPrimary }]}
          >
            <T peso={600} size={14} color={activo ? c.surface : c.textSecondary}>
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
  const [x] = useState(() => new Animated.Value(value ? 20 : 0))
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 20 : 0, duration: 180, useNativeDriver: false }).start()
  }, [value, x])
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
  tab: { height: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  toggleFila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  toggle: { width: 48, height: 28, borderRadius: 14 },
  pulgar: { position: 'absolute', top: 3, left: 3, width: 22, height: 22, borderRadius: 11 },
  feed: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
})
