import { useId, useState } from 'react'
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
export function TrendChart({ data = [], unit = '', threshold = {}, min, max, height = 200, activeIndex, decimals = 1, tooltip = true }) {
  const { c } = useTema()
  const id = useId().replace(/:/g, '')
  const [W, setW] = useState(0)
  const [hover, setHover] = useState(activeIndex ?? data.length - 1)
  const H = height
  const padL = 36
  const padR = 12
  const padT = 16
  const padB = 26
  const vals = data.map((d) => d.value)
  const todos = vals.concat([threshold.max, threshold.min].filter((v) => v != null))
  let mn = min ?? Math.floor(Math.min(...todos) - 1)
  let mx = max ?? Math.ceil(Math.max(...todos) + 1)
  if (max == null) mx = mn + Math.ceil((mx - mn) / 4) * 4
  const iw = Math.max(10, W - padL - padR)
  const ih = H - padT - padB
  const X = (i) => padL + (data.length > 1 ? (i / (data.length - 1)) * iw : iw / 2)
  const Y = (v) => padT + ih - ((v - mn) / (mx - mn || 1)) * ih
  const pts = data.map((d, i) => [+X(i).toFixed(1), +Y(d.value).toFixed(1)])
  const linea = suave(pts)
  const ticks = [0, 1, 2, 3, 4].map((t) => mn + ((mx - mn) * t) / 4)
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
      {W > 0 && data.length > 0 && (
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
            ['max', c.danger, c.dangerSoft, -22, 'Máx'],
            ['min', c.warning, c.warningSoft, 4, 'Mín'],
          ].map(([k, linea_, fondo, dy, txt]) =>
            threshold[k] != null ? (
              <G key={k}>
                <Line x1={padL} x2={W - padR} y1={Y(threshold[k])} y2={Y(threshold[k])} stroke={linea_} strokeWidth={1.5} strokeDasharray="6 5" />
                <Rect x={W - padR - 86} y={Y(threshold[k]) + dy} width={86} height={18} rx={9} fill={fondo} />
                <SvgText x={W - padR - 43} y={Y(threshold[k]) + dy + 13} textAnchor="middle" fill={linea_} fontSize={10} fontFamily={font[700]}>
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
