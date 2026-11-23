import { useEffect, useId, useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg'
import { useTema } from '../../context/TemaContext'
import { font } from '../../theme'
import { STATUS, StatusBadge } from './Basicos'
import { T } from './Texto'

const fmt = (v, d = 1) => (typeof v === 'number' ? (Number.isInteger(v) && d === 1 ? String(v) : v.toFixed(d)) : v)

function suave(pts) {
  if (!pts.length) return ''
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const m = (x0 + x1) / 2
    d += ` C${m} ${y0} ${m} ${y1} ${x1} ${y1}`
  }
  return d
}

// Línea pequeña sin ejes. color: un color del tema o cualquier color.
export function Sparkline({ data = [], width = 96, height = 32, color }) {
  const { c } = useTema()
  const id = useId().replace(/:/g, '')
  const tinta = color ?? c.chartLine
  if (data.length < 2) return <Svg width={width} height={height} />
  const mn = Math.min(...data)
  const rng = Math.max(...data) - mn || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (width - 4) + 2, height - 3 - ((v - mn) / rng) * (height - 6)])
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')
  const ult = pts[pts.length - 1]
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tinta} stopOpacity={0.25} />
          <Stop offset="1" stopColor={tinta} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${d} L${ult[0]} ${height} L2 ${height} Z`} fill={`url(#sg${id})`} />
      <Path d={d} fill="none" stroke={tinta} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={ult[0]} cy={ult[1]} r={3} fill={tinta} />
    </Svg>
  )
}

// Tendencia con ejes, umbrales y cursor. Se toca o arrastra para mover el cursor.
// data: [{ label, time, value }]; threshold: { min, max }.
// true cuando el hilo de JS queda libre: el SVG se dibuja después de que la pantalla ya entró, para
// no quitarle cuadros a la animación. No usa InteractionManager: RN 0.88 lo quitó y en el APK de
// producción `InteractionManager` es undefined (la app se cerraba al abrir una gráfica).
function useTrasTransicion() {
  const [listo, setListo] = useState(false)
  useEffect(() => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => setListo(true), { timeout: 500 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(() => setListo(true), 0)
    return () => clearTimeout(id)
  }, [])
  return listo
}

// Solo números finitos: un NaN en un path o en un estilo nativo cierra la app en Android.
const finito = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// Escala del eje y con marcas «bonitas» (1, 2, 2.5, 5 × 10^n, nunca menores a 1): el eje acaba en
// valores redondos (0–1500, no 0–1504) con, como mucho, `pasos` renglones. Igual que en la web.
export function escalaBonita(bajo, alto, pasos, fijoMin, fijoMax) {
  if (fijoMin != null && fijoMax != null) {
    const ticks = Array.from({ length: pasos + 1 }, (_, t) => fijoMin + ((fijoMax - fijoMin) * t) / pasos)
    return { mn: fijoMin, mx: fijoMax, ticks }
  }
  if (fijoMin != null) bajo = fijoMin
  if (fijoMax != null) alto = fijoMax
  if (alto - bajo < 1e-9) {
    bajo -= 1
    alto += 1
  }
  const base = 10 ** Math.max(0, Math.floor(Math.log10((alto - bajo) / pasos)))
  let paso = base
  let mn = bajo
  let mx = alto
  for (let intento = 0; intento < 40; intento++) {
    const m = [1, 2, 2.5, 5][intento % 4] * base * 10 ** Math.floor(intento / 4)
    if (m === 2.5) continue // 2.5 daría marcas con decimales (22.5); desde 25 sí es redondo
    mn = fijoMin ?? Math.floor(bajo / m + 1e-9) * m
    mx = fijoMax ?? (fijoMin != null ? mn + Math.ceil((alto - mn) / m - 1e-9) * m : Math.ceil(alto / m - 1e-9) * m)
    if (fijoMax != null) mn = mx - Math.ceil((mx - bajo) / m - 1e-9) * m
    paso = m
    if (Math.round((mx - mn) / m) <= pasos) break
  }
  if (mx <= mn) mx = mn + paso
  const ticks = []
  for (let v = mn; v <= mx + paso / 2; v += paso) ticks.push(+v.toFixed(6))
  return { mn, mx, ticks }
}

export function TrendChart({ data: crudos = [], unit = '', threshold: umbral, min, max, height = 200, activeIndex, decimals = 1, tooltip = true }) {
  const data = crudos.filter((d) => finito(d?.value) != null)
  const threshold = { min: finito(umbral?.min), max: finito(umbral?.max) }
  const { c } = useTema()
  const id = useId().replace(/:/g, '')
  const [W, setW] = useState(0)
  const listo = useTrasTransicion()
  const [hover, setHover] = useState(activeIndex ?? data.length - 1)
  const H = height
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 26
  const vals = data.map((d) => d.value)
  const todos = vals.concat([threshold.max, threshold.min].filter((v) => v != null))
  const { mn, mx, ticks } = escalaBonita(Math.min(...todos), Math.max(...todos), 4, min, max)
  const iw = Math.max(10, W - padL - padR)
  const ih = H - padT - padB
  const X = (i) => padL + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2)
  const Y = (v) => padT + ih - ((v - mn) / (mx - mn || 1)) * ih
  const pts = data.map((d, i) => [+X(i).toFixed(1), +Y(d.value).toFixed(1)])
  const linea = suave(pts)
  const hi = Math.max(0, Math.min(data.length - 1, hover))
  const cur = data[hi]
  const cada = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 56))))
  const estado = (v) =>
    (threshold.max != null && v > threshold.max) || (threshold.min != null && v < threshold.min) ? 'critical' : 'normal'
  const mover = (x) => {
    const i = Math.round(((x - padL) / iw) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const ejes = { fill: c.textMuted, fontSize: 10, fontFamily: font[500] }
  // Etiquetas de umbral por fuera de su línea (Máx arriba, Mín abajo), salvo que así se salgan del
  // área de la gráfica (p. ej. un umbral en el borde de la escala): entonces van por dentro.
  const yEtiqueta = (k) => {
    const y = Y(threshold[k])
    if (k === 'max') return y - 22 < 0 ? y + 4 : y - 22
    return y + 22 > padT + ih ? y - 22 : y + 4
  }
  const tipX = cur ? X(hi) : 0
  const izquierda = tipX > W - 140

  return (
    <View
      style={{ height: H }}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => mover(e.nativeEvent.locationX)}
      onResponderMove={(e) => mover(e.nativeEvent.locationX)}
    >
      {data.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border }}>
          <T size={12} color={c.textSecondary}>
            Sin lecturas en este periodo.
          </T>
        </View>
      )}
      {listo && W > 0 && data.length > 0 && (
        <Svg width={W} height={H} pointerEvents="none">
          <Defs>
            <LinearGradient id={`ta${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.chartArea} stopOpacity={0.32} />
              <Stop offset="1" stopColor={c.chartArea} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((tv, i) => (
            <G key={`g${i}`}>
              <Line x1={padL} x2={W - padR} y1={Y(tv)} y2={Y(tv)} stroke={c.chartGrid} strokeDasharray="2 4" />
              <SvgText x={padL - 8} y={Y(tv) + 4} textAnchor="end" {...ejes}>
                {fmt(tv, 0)}
              </SvgText>
            </G>
          ))}
          {data.map((d, i) =>
            i % cada === 0 && d.label ? (
              <SvgText key={`x${i}`} x={X(i)} y={H - 6} textAnchor="middle" {...ejes}>
                {d.label}
              </SvgText>
            ) : null,
          )}
          {[
            ['max', c.danger, c.dangerSoft, 'Máx'],
            ['min', c.warning, c.warningSoft, 'Mín'],
          ].map(([k, linea_, fondo, txt]) =>
            threshold[k] != null ? (
              <G key={k}>
                <Line x1={padL} x2={W - padR} y1={Y(threshold[k])} y2={Y(threshold[k])} stroke={linea_} strokeWidth={1.5} strokeDasharray="6 5" />
                <Rect x={W - padR - 86} y={yEtiqueta(k)} width={86} height={18} rx={9} fill={fondo} />
                <SvgText x={W - padR - 43} y={yEtiqueta(k) + 13} textAnchor="middle" fill={linea_} fontSize={10} fontFamily={font[700]}>
                  {`${txt} ${fmt(threshold[k])} ${unit}`}
                </SvgText>
              </G>
            ) : null,
          )}
          <Path d={`${linea} L${pts[pts.length - 1][0]} ${padT + ih} L${pts[0][0]} ${padT + ih} Z`} fill={`url(#ta${id})`} />
          <Path d={linea} fill="none" stroke={c.chartLine} strokeWidth={3} strokeLinecap="round" />
          {cur && (
            <>
              <Line x1={tipX} x2={tipX} y1={padT} y2={padT + ih} stroke={c.textMuted} strokeDasharray="3 3" />
              <Circle cx={tipX} cy={Y(cur.value)} r={7} fill={c.chartLine} opacity={0.2} />
              <Circle cx={tipX} cy={Y(cur.value)} r={4.5} fill={c.surface} stroke={c.chartLine} strokeWidth={3} />
            </>
          )}
        </Svg>
      )}
      {W > 0 && cur && tooltip && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: Math.max(0, Y(cur.value) - 40),
            left: izquierda ? undefined : tipX + 12,
            right: izquierda ? W - tipX + 12 : undefined,
            gap: 2,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 12,
            backgroundColor: c.surfaceElevated,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}
        >
          <T size={11} color={c.textMuted}>
            {cur.time ?? cur.label}
          </T>
          <T peso={700} size={17} num>
            {fmt(cur.value, decimals)}
            <T size={11} color={c.textMuted}>{` ${unit}`}</T>
          </T>
          <StatusBadge status={STATUS[estado(cur.value)] ? estado(cur.value) : 'normal'} />
        </View>
      )}
    </View>
  )
}
