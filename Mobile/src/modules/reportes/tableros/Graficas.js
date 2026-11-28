import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg'
import { useTema } from '../../../context/TemaContext'
import { font } from '../../../theme'
import { T } from '../../../components/ui'
import { escalaBonita } from '../../../components/ui/Graficas'
import { atenuado, colorSerie, colorTono, esSeleccion, etiquetaPunto, formatear, semaforoDe, tonoDe } from './datos'

function useAncho() {
  const [ancho, setAncho] = useState(0)
  const alMedir = (e) => setAncho(Math.round(e.nativeEvent.layout.width))
  return [ancho, alMedir]
}

// Leyenda de series o áreas: cada elemento con dimensión se puede tocar para filtrar.
function Leyenda({ items, seleccion, alSeleccionar }) {
  const { c } = useTema()
  if (!items.length) return null
  return (
    <View style={s.leyenda}>
      {items.map((item) => {
        const activo = esSeleccion(seleccion, item.dimension, item.valor)
        const clic = Boolean(alSeleccionar && item.dimension && item.valor != null)
        const contenido = (
          <>
            <View style={[s.punto, { backgroundColor: item.color }]} />
            <T size={11} lh={15} color={activo ? c.textPrimary : c.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }} peso={activo ? 700 : 500}>
              {item.nombre}
            </T>
          </>
        )
        return clic ? (
          <Pressable
            key={`${item.dimension}-${item.valor}`}
            onPress={() => alSeleccionar({ dimension: item.dimension, valor: item.valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`Filtrar por ${item.nombre}`}
            style={({ pressed }) => [s.itemLeyenda, { opacity: atenuado(seleccion, item.dimension, item.valor) }, pressed && { opacity: 0.6 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${item.dimension}-${item.valor}`} style={s.itemLeyenda}>{contenido}</View>
        )
      })}
    </View>
  )
}

// Serie de tiempo con una o varias líneas, comparativa punteada y umbrales. La leyenda filtra
// cuando la serie representa un área o un dispositivo.
export function Lineas({ series = [], previo = [], umbrales, unidad = '', intervalo = '1h', alto = 150, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const [ancho, medir] = useAncho()
  if (!series.length) return null
  const H = alto
  const padL = 34
  const padR = 8
  const padT = 8
  const padB = 18
  const iw = Math.max(20, ancho - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const valores = series.flatMap((serie) => (serie.puntos || []).map((p) => Number(p.y))).concat((previo || []).map((p) => Number(p.y)))
  if (umbrales) valores.push(umbrales.advertencia_min, umbrales.advertencia_max)
  const numeros = valores.filter((v) => Number.isFinite(v))
  if (!numeros.length) return null
  const { mn, mx, ticks } = escalaBonita(Math.min(...numeros), Math.max(...numeros), 3)
  const Y = (v) => padT + ih - ((Number(v) - mn) / (mx - mn || 1)) * ih
  const puntosDe = (puntos) => {
    const total = puntos?.length || 0
    return (puntos || []).map((p, i) => [
      +(padL + (total > 1 ? (i / (total - 1)) * iw : iw / 2)).toFixed(1),
      +Y(p.y).toFixed(1),
    ])
  }
  const ruta = (puntos) => puntos.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
  const seriesConPuntos = series.map((serie, i) => ({ ...serie, color: colorSerie(c, i), puntos: puntosDe(serie.puntos) }))
  const previos = puntosDe(previo)
  const primera = series[0]?.puntos || []
  const marcasX = primera.length > 1 ? [0, Math.floor((primera.length - 1) / 2), primera.length - 1] : [0]
  const ejes = { fill: c.textMuted, fontSize: 11, fontFamily: font[500] }
  return (
    <View>
      <View style={{ height: H }} onLayout={medir}>
        {ancho > 0 ? (
          <Svg width={ancho} height={H}>
            {ticks.map((tv, i) => (
              <G key={`t${i}`}>
                <Line x1={padL} x2={ancho - padR} y1={Y(tv)} y2={Y(tv)} stroke={c.chartGrid} strokeDasharray="2 4" />
                <SvgText x={padL - 6} y={Y(tv) + 3} textAnchor="end" {...ejes}>{formatear(tv, 0)}</SvgText>
              </G>
            ))}
            {marcasX.map((i) => (
              <SvgText key={`x${i}`} x={padL + (primera.length > 1 ? (i / (primera.length - 1)) * iw : iw / 2)} y={H - 4} textAnchor={i === 0 ? 'start' : i === primera.length - 1 ? 'end' : 'middle'} {...ejes}>
                {etiquetaPunto(primera[i]?.x, intervalo)}
              </SvgText>
            ))}
            {umbrales ? (
              <>
                <Line x1={padL} x2={ancho - padR} y1={Y(umbrales.advertencia_max)} y2={Y(umbrales.advertencia_max)} stroke={c.chartWarn} strokeWidth={1.2} strokeDasharray="5 4" />
                <Line x1={padL} x2={ancho - padR} y1={Y(umbrales.advertencia_min)} y2={Y(umbrales.advertencia_min)} stroke={c.chartWarn} strokeWidth={1.2} strokeDasharray="5 4" />
              </>
            ) : null}
            {previos.length > 1 ? <Path d={ruta(previos)} fill="none" stroke={c.textMuted} strokeWidth={1.2} strokeDasharray="4 4" opacity={0.55} /> : null}
            {seriesConPuntos.map((serie, i) => (
              <Path
                key={`s${i}`}
                d={ruta(serie.puntos)}
                fill="none"
                stroke={serie.color}
                strokeWidth={serie.dimension ? 2.4 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={atenuado(seleccion, serie.dimension, serie.dimension_valor)}
              />
            ))}
          </Svg>
        ) : null}
      </View>
      <Leyenda
        items={series.filter((serie) => serie.nombre).map((serie, i) => ({ nombre: serie.nombre, dimension: serie.dimension, valor: serie.dimension_valor, color: colorSerie(c, i) }))}
        seleccion={seleccion}
        alSeleccionar={alSeleccionar}
      />
      {unidad ? <T size={10} color={c.textMuted} style={{ textAlign: 'right' }}>{unidad}</T> : null}
    </View>
  )
}

function arcoMedidor(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// Medio aro con el valor y la marca de la meta.
export function MedidorAro({ valor, min = 0, max = 100, meta, textoMeta, unidad = '', decimales = 1, estado, alto = 118 }) {
  const { c } = useTema()
  const color = colorTono(c, semaforoDe(estado))
  const fraccion = valor == null ? 0 : Math.max(0, Math.min(1, (Number(valor) - min) / (max - min || 1)))
  const marca = meta == null ? null : Math.max(0, Math.min(1, (Number(meta) - min) / (max - min || 1)))
  const cx = 100
  const cy = 88
  const r = 70
  const anchoTrazo = 13
  const angulo = 180 + marca * 180
  const cos = Math.cos((angulo * Math.PI) / 180)
  const sin = Math.sin((angulo * Math.PI) / 180)
  return (
    <View style={{ height: alto }}>
      <Svg width="100%" height={alto} viewBox="0 0 200 112" preserveAspectRatio="xMidYMid meet">
        <Path d={arcoMedidor(cx, cy, r, 180, 360)} stroke={c.chartGrid} strokeWidth={anchoTrazo} fill="none" strokeLinecap="round" />
        {fraccion > 0 ? <Path d={arcoMedidor(cx, cy, r, 180, 180 + Math.max(1, fraccion * 180))} stroke={color} strokeWidth={anchoTrazo} fill="none" strokeLinecap="round" /> : null}
        {marca != null ? (
          <Line
            x1={cx + (r - anchoTrazo / 2 + 1) * cos}
            y1={cy + (r - anchoTrazo / 2 + 1) * sin}
            x2={cx + (r + anchoTrazo / 2 - 1) * cos}
            y2={cy + (r + anchoTrazo / 2 - 1) * sin}
            stroke={c.textMuted}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ) : null}
        <SvgText x={cx} y={72} textAnchor="middle" fontSize={27} fontFamily={font[800]} fill={c.textPrimary}>
          {valor == null ? '—' : formatear(valor, decimales)}
          {unidad ? <TSpan fontSize={12} fontFamily={font[600]} fill={c.textMuted}>{` ${unidad}`}</TSpan> : null}
        </SvgText>
        {textoMeta ? <SvgText x={cx} y={104} textAnchor="middle" fontSize={10} fontFamily={font[500]} fill={c.textMuted}>{textoMeta}</SvgText> : null}
      </Svg>
    </View>
  )
}

function arcoDona(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

// Dona con el total al centro. Cada sector y su renglón de leyenda aplican el filtro cruzado.
export function Dona({ sectores = [], total = 0, por = 'estado', seleccion, alSeleccionar }) {
  const { c } = useTema()
  const suma = sectores.reduce((s, sector) => s + Number(sector.valor || 0), 0) || total || 1
  const partes = sectores.reduce((lista, sector, i) => {
    const barrido = (Number(sector.valor || 0) / suma) * 360
    const desde = lista.length ? lista[lista.length - 1].hasta : -90
    const tono = por === 'variable' ? null : tonoDe(sector.dimension_valor) || tonoDe(sector.etiqueta)
    lista.push({
      ...sector,
      color: tono ? colorTono(c, tono) : colorSerie(c, i),
      desde,
      hasta: desde + Math.max(0.2, barrido),
    })
    return lista
  }, [])
  return (
    <View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 168, height: 168 }}>
          <Svg width={168} height={168} viewBox="0 0 168 168">
            <Circle cx={84} cy={84} r={58} stroke={c.chartGrid} strokeWidth={24} fill="none" />
            {partes.map((parte, i) => (
              <Path
                key={`${parte.etiqueta}-${i}`}
                d={arcoDona(84, 84, 58, parte.desde, parte.hasta)}
                stroke={parte.color}
                strokeWidth={24}
                fill="none"
                opacity={atenuado(seleccion, parte.dimension, parte.dimension_valor)}
              />
            ))}
            <SvgText x={84} y={80} textAnchor="middle" fontSize={26} fontFamily={font[800]} fill={c.textPrimary}>{formatear(total, 0)}</SvgText>
            <SvgText x={84} y={98} textAnchor="middle" fontSize={10} fontFamily={font[500]} fill={c.textMuted}>Total</SvgText>
          </Svg>
          {alSeleccionar
            ? partes.map((parte, i) => {
                const medio = ((parte.desde + parte.hasta) / 2) * (Math.PI / 180)
                if (!parte.dimension) return null
                return (
                  <Pressable
                    key={`sector-${i}`}
                    onPress={() => alSeleccionar({ dimension: parte.dimension, valor: parte.dimension_valor })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: esSeleccion(seleccion, parte.dimension, parte.dimension_valor) }}
                    accessibilityLabel={`Filtrar por ${parte.etiqueta}`}
                    style={{ position: 'absolute', left: 84 + 58 * Math.cos(medio) - 13, top: 84 + 58 * Math.sin(medio) - 13, width: 26, height: 26, borderRadius: 13 }}
                  />
                )
              })
            : null}
        </View>
      </View>
      <View style={{ gap: 2 }}>
        {partes.map((parte, i) => {
          const activo = esSeleccion(seleccion, parte.dimension, parte.dimension_valor)
          const clic = Boolean(alSeleccionar && parte.dimension)
          const contenido = (
            <>
              <View style={[s.punto, { backgroundColor: parte.color }]} />
              <T size={12} lh={16} numberOfLines={1} style={{ flex: 1 }} color={activo ? c.textPrimary : c.textSecondary} peso={activo ? 700 : 500}>{parte.etiqueta}</T>
              <T size={12} num color={c.textSecondary}>{formatear(parte.valor, 0)}</T>
              <T size={11} num color={c.textMuted}>{`${formatear(parte.porcentaje, 1)} %`}</T>
            </>
          )
          return clic ? (
            <Pressable
              key={`${parte.etiqueta}-${i}`}
              onPress={() => alSeleccionar({ dimension: parte.dimension, valor: parte.dimension_valor })}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={`Filtrar por ${parte.etiqueta}`}
              style={({ pressed }) => [s.filaLeyenda, { opacity: atenuado(seleccion, parte.dimension, parte.dimension_valor) }, pressed && { opacity: 0.6 }]}
            >
              {contenido}
            </Pressable>
          ) : (
            <View key={`${parte.etiqueta}-${i}`} style={s.filaLeyenda}>{contenido}</View>
          )
        })}
      </View>
    </View>
  )
}

// Distribución en cubetas con las líneas de umbral cuando la tarjeta las conoce.
export function Histograma({ cubetas = [], decimales = 1, umbrales }) {
  const { c } = useTema()
  const [ancho, medir] = useAncho()
  if (!cubetas.length) return null
  const H = 136
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 18
  const iw = Math.max(20, ancho - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const max = Math.max(...cubetas.map((cubeta) => Number(cubeta.valor || 0)), 1) * 1.1
  const anchoBarra = iw / (cubetas.length || 1)
  const primero = Number(cubetas[0]?.desde)
  const ultimo = Number(cubetas[cubetas.length - 1]?.hasta)
  const X = (v) => padL + ((v - primero) / (ultimo - primero || 1)) * iw
  const marcas = cubetas.length > 2 ? [0, Math.floor(cubetas.length / 2), cubetas.length - 1] : [0]
  const lineas = umbrales ? [umbrales.peligro_min, umbrales.advertencia_min, umbrales.advertencia_max, umbrales.peligro_max].filter((v) => v != null) : []
  return (
    <View style={{ height: H }} onLayout={medir}>
      {ancho > 0 ? (
        <Svg width={ancho} height={H}>
          {[0, 0.5, 1].map((f, i) => (
            <Line key={`g${i}`} x1={padL} x2={ancho - padR} y1={padT + ih - f * ih} y2={padT + ih - f * ih} stroke={c.chartGrid} strokeDasharray="2 4" />
          ))}
          {cubetas.map((cubeta, i) => {
            const alto = Math.max(1, (Number(cubeta.valor || 0) / max) * ih)
            return (
              <Rect
                key={i}
                x={padL + i * anchoBarra + Math.min(1, anchoBarra * 0.08)}
                y={padT + ih - alto}
                width={Math.max(1, anchoBarra * 0.84)}
                height={alto}
                rx={Math.min(3, anchoBarra / 4)}
                fill={c.chartLine}
                opacity={0.85}
              />
            )
          })}
          {lineas.map((v, i) => (
            <Line key={`u${i}`} x1={X(v)} x2={X(v)} y1={padT} y2={padT + ih} stroke={c.chartWarn} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
          ))}
          {marcas.map((i) => (
            <SvgText key={`x${i}`} x={padL + i * anchoBarra + anchoBarra / 2} y={H - 4} textAnchor="middle" fontSize={11} fontFamily={font[500]} fill={c.textMuted}>
              {formatear(cubetas[i]?.desde, decimales)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  )
}

// Mapa de calor compacto: 7 días × 24 horas, con la escala de la consulta.
export function MapaCalor({ valores = [], dias = [], alertas = false }) {
  const { c } = useTema()
  const numeros = valores.flat().filter((v) => v != null)
  const min = Math.min(...numeros)
  const max = Math.max(...numeros)
  const color = alertas ? c.chartWarn : c.chartArea
  const rango = max - min || 1
  const opacidad = (v) => {
    if (v == null) return 0.05
    const f = (Number(v) - min) / rango
    return 0.12 + f * 0.8
  }
  const horas = [0, 6, 12, 18, 23]
  return (
    <View style={{ gap: 3 }}>
      {valores.map((fila, d) => (
        <View key={d} style={s.filaCalor}>
          <T size={11} color={c.textMuted} numberOfLines={1} style={{ width: 30 }}>{(dias[d] || '').slice(0, 3)}</T>
          <View style={{ flex: 1, flexDirection: 'row', gap: 1.5 }}>
            {fila.map((v, h) => (
              <View key={h} style={{ flex: 1, height: 9, borderRadius: 2, backgroundColor: color, opacity: opacidad(v) }} />
            ))}
          </View>
        </View>
      ))}
      <View style={s.filaCalor}>
        <View style={{ width: 30 }} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {horas.map((h) => (
            <T key={h} size={11} color={c.textMuted} numberOfLines={1} style={{ flex: h === 23 ? 0 : 1, textAlign: h === 0 ? 'left' : 'center' }}>{`${h} h`}</T>
          ))}
        </View>
      </View>
    </View>
  )
}

// Dispersión: un punto por hora y dispositivo, coloreado por área. Tocar un punto (o su área en
// la leyenda) aplica el filtro cruzado de área.
export function Dispersion({ puntos = [], infoX, infoY, alto = 190, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const [ancho, medir] = useAncho()
  const H = alto
  const padL = 34
  const padR = 10
  const padT = 14
  const padB = 24
  const iw = Math.max(20, ancho - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const maxPuntos = 400
  const paso = Math.max(1, Math.ceil(puntos.length / maxPuntos))
  const muestra = puntos.filter((_, i) => i % paso === 0)
  const xs = muestra.map((p) => Number(p.x)).filter(Number.isFinite)
  const ys = muestra.map((p) => Number(p.y)).filter(Number.isFinite)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const X = (v) => padL + ((Number(v) - x0) / (x1 - x0 || 1)) * iw
  const Y = (v) => padT + ih - ((Number(v) - y0) / (y1 - y0 || 1)) * ih
  // El servidor marca cada punto con su dispositivo; la gráfica colorea y filtra por su área,
  // como la web (`area_num`).
  const areaDe = (p) => p.area_num ?? (p.dimension === 'area' ? p.dimension_valor : null)
  const areas = [...new Map(muestra.filter((p) => areaDe(p) != null).map((p) => [String(areaDe(p)), { nombre: p.area || `Área ${areaDe(p)}`, valor: areaDe(p) }])).values()]
  const colorArea = (p) => {
    const i = Math.max(0, areas.findIndex((a) => String(a.valor) === String(areaDe(p))))
    return colorSerie(c, i)
  }
  const ejes = { fill: c.textMuted, fontSize: 11, fontFamily: font[500] }
  return (
    <View>
      <View style={{ height: H }} onLayout={medir}>
        {ancho > 0 ? (
          <Svg width={ancho} height={H}>
            <Line x1={padL} x2={ancho - padR} y1={padT + ih} y2={padT + ih} stroke={c.chartGrid} />
            <Line x1={padL} x2={padL} y1={padT} y2={padT + ih} stroke={c.chartGrid} />
            {[0, 0.5, 1].map((f, i) => (
              <G key={`y${i}`}>
                <SvgText x={padL - 5} y={padT + ih - f * ih + 3} textAnchor="end" {...ejes}>{formatear(y0 + (y1 - y0) * f, infoY?.decimales)}</SvgText>
              </G>
            ))}
            {[0, 1].map((f, i) => (
              <SvgText key={`x${i}`} x={padL + f * iw} y={H - 12} textAnchor={i ? 'end' : 'start'} {...ejes}>{formatear(x0 + (x1 - x0) * f, infoX?.decimales)}</SvgText>
            ))}
            <SvgText x={ancho - padR} y={H - 1} textAnchor="end" {...ejes}>{`${infoX?.nombre || 'X'} (${infoX?.unidad || ''})`}</SvgText>
            <SvgText x={padL} y={9} textAnchor="start" {...ejes}>{`${infoY?.nombre || 'Y'} (${infoY?.unidad || ''})`}</SvgText>
            {muestra.map((p, i) => (
              <Circle
                key={i}
                cx={X(p.x)}
                cy={Y(p.y)}
                r={3.4}
                fill={colorArea(p)}
                opacity={atenuado(seleccion, 'area', areaDe(p)) * 0.8}
              />
            ))}
          </Svg>
        ) : null}
        {ancho > 0 && alSeleccionar
          ? muestra.map((p, i) =>
              areaDe(p) == null ? null : (
                <Pressable
                  key={`toque-${i}`}
                  onPress={() => alSeleccionar({ dimension: 'area', valor: areaDe(p) })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: esSeleccion(seleccion, 'area', areaDe(p)) }}
                  accessibilityLabel={`Área ${p.area}: ${formatear(p.x, infoX?.decimales)} ${infoX?.unidad || ''}, ${formatear(p.y, infoY?.decimales)} ${infoY?.unidad || ''}`}
                  hitSlop={2}
                  style={{ position: 'absolute', left: X(p.x) - 9, top: Y(p.y) - 9, width: 18, height: 18, borderRadius: 9 }}
                />
              ),
            )
          : null}
      </View>
      <Leyenda items={areas.map((a) => ({ ...a, dimension: 'area', color: colorArea({ area_num: a.valor }) }))} seleccion={seleccion} alSeleccionar={alSeleccionar} />
    </View>
  )
}

const s = StyleSheet.create({
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 999 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  filaLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  filaCalor: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
