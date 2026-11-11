// Piezas de las respuestas de Nico AI que no son texto: una gráfica suelta y una comparativa.
// Usan los mismos datos que la web (apps/reportes/graficas.py).
import { StyleSheet, View } from 'react-native'
import { Icon, T, TrendChart } from '../../components/ui'
import { useTema } from '../../context/TemaContext'

const ORDEN = ['TEMP', 'HUM', 'AIRE']
const NOMBRES = { serie: 'Gráfica del periodo', alertas: 'Alertas por variable', cifras: 'Cifras clave', general: 'Resumen del dispositivo' }
const VAR = { TEMP: 'Temperatura', HUM: 'Humedad', AIRE: 'Calidad del aire' }
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const dec = (unidad) => (unidad === 'ppm' || !unidad ? 0 : 1)
const fmt = (v, unidad) => (v == null ? '—' : `${Number(v).toFixed(dec(unidad))}${unidad ? ` ${unidad}` : ''}`)
const fecha = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const etiqueta = (iso, porHora) => {
  const f = new Date(iso)
  return porHora ? `${String(f.getHours()).padStart(2, '0')}:00` : `${f.getDate()}/${f.getMonth() + 1}`
}

function Cabeza({ icono, titulo, detalle }) {
  const { c } = useTema()
  return (
    <View style={[s.cabeza, { borderColor: c.border }]}>
      <View style={[s.icono, { backgroundColor: c.surfaceMuted }]}>
        <Icon name={icono} size={14} color={c.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T peso={700} size={14}>
          {titulo}
        </T>
        {detalle ? (
          <T size={11} color={c.textMuted}>
            {detalle}
          </T>
        ) : null}
      </View>
    </View>
  )
}

function Serie({ cifras, variable }) {
  const { c } = useTema()
  const info = cifras.variables?.[variable]
  const puntos = cifras.series?.[variable] ?? []
  if (!info || puntos.length < 2) return null
  const porHora = cifras.intervalo_serie === 'hora'
  const cada = Math.max(1, Math.ceil(puntos.length / 6))
  return (
    <View style={{ gap: 4 }}>
      <T peso={600} size={13} color={c.textSecondary}>
        {`${VAR[variable] ?? info.nombre} promedio · ${info.unidad}`}
      </T>
      <TrendChart
        data={puntos.map((p, i) => ({
          label: i % cada === 0 ? etiqueta(p.t, porHora) : '',
          time: etiqueta(p.t, porHora),
          value: Number(p.promedio),
        }))}
        unit={info.unidad}
        decimals={dec(info.unidad)}
        height={150}
      />
    </View>
  )
}

function Barras({ filas, unidad, color }) {
  const { c } = useTema()
  const max = Math.max(1, ...filas.map(([, v]) => Number(v) || 0))
  return (
    <View style={{ gap: 8 }}>
      {filas.map(([nombre, valor]) => (
        <View key={nombre} style={{ gap: 3 }}>
          <View style={s.fila}>
            <T size={12} style={{ flex: 1 }}>
              {nombre}
            </T>
            <T size={12} peso={600}>
              {fmt(valor, unidad)}
            </T>
          </View>
          <View style={[s.pista, { backgroundColor: c.surfaceMuted }]}>
            <View style={[s.barra, { width: `${(Number(valor) / max) * 100}%`, backgroundColor: color ?? c.accent }]} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function GraficaChat({ g }) {
  const { c } = useTema()
  const cifras = g.cifras ?? {}
  const variables = ORDEN.filter((v) => cifras.variables?.[v])
  let cuerpo
  if (g.elemento === 'alertas') {
    const por = cifras.alertas?.por_variable ?? {}
    cuerpo = <Barras filas={ORDEN.filter((v) => v in por).map((v) => [VAR[v], por[v]])} unidad="" color={c.danger} />
  } else if (g.elemento === 'cifras') {
    cuerpo = variables.map((v) => {
      const i = cifras.variables[v]
      return (
        <View key={v} style={s.fila}>
          <T size={13} style={{ flex: 1 }}>
            {VAR[v]}
          </T>
          <T size={13} peso={600}>{`${fmt(i.promedio, i.unidad)}  ·  ${fmt(i.minimo, i.unidad)} – ${fmt(i.maximo, i.unidad)}`}</T>
        </View>
      )
    })
  } else {
    cuerpo = (g.elemento === 'general' ? variables : [g.variable]).map((v) => <Serie key={v} cifras={cifras} variable={v} />)
  }
  return (
    <View style={[s.tarjeta, { borderColor: c.border, backgroundColor: c.background }]}>
      <Cabeza
        icono={g.elemento === 'alertas' ? 'bell' : g.elemento === 'cifras' ? 'layout-grid' : 'activity'}
        titulo={NOMBRES[g.elemento]}
        detalle={`${g.donde} · ${fecha(g.periodo_inicio)} – ${fecha(g.periodo_fin)}`}
      />
      <View style={s.cuerpo}>{cuerpo}</View>
    </View>
  )
}

function Cambio({ a, b, unidad }) {
  const { c } = useTema()
  if (a == null || b == null) return <T size={12} color={c.textMuted}>—</T>
  const d = a - b
  if (Math.abs(d) < 0.05) return <T size={12} color={c.textMuted}>igual</T>
  return (
    <View style={[s.cambio, { backgroundColor: d > 0 ? c.warningSoft : c.accentSoft }]}>
      <Icon name={d > 0 ? 'arrow-up-right' : 'arrow-down-right'} size={12} color={d > 0 ? c.warning : c.accent} />
      <T size={11} peso={700} color={d > 0 ? c.warning : c.accent}>
        {fmt(Math.abs(d), unidad)}
      </T>
    </View>
  )
}

export function ComparativaChat({ c: comp }) {
  const { c } = useTema()
  if (comp.tipo === 'dispositivos')
    return (
      <View style={[s.tarjeta, { borderColor: c.border, backgroundColor: c.background }]}>
        <Cabeza icono="cpu" titulo={`Dispositivos de ${comp.donde}`} detalle={comp.descripcion} />
        <View style={s.cuerpo}>
          {comp.filas.map((f) => (
            <View key={f.variable} style={{ gap: 6 }}>
              <T peso={600} size={13} color={c.textSecondary}>{`${mayuscula(f.nombre)} promedio`}</T>
              <Barras filas={f.puntos} unidad={f.unidad} />
            </View>
          ))}
          {comp.alertas.length > 0 && (
            <View style={{ gap: 6 }}>
              <T peso={600} size={13} color={c.textSecondary}>
                Alertas
              </T>
              <Barras filas={comp.alertas} unidad="" color={c.danger} />
            </View>
          )}
        </View>
      </View>
    )
  return (
    <View style={[s.tarjeta, { borderColor: c.border, backgroundColor: c.background }]}>
      <Cabeza icono="activity" titulo={`Comparativa · ${comp.donde}`} detalle={`${mayuscula(comp.columnas[0])} contra ${comp.columnas[1]}`} />
      <View style={s.cuerpo}>
        {[...comp.filas.map((f) => ({ k: f.variable, n: mayuscula(f.nombre), a: f.a.promedio, b: f.b.promedio, u: f.unidad })), { k: 'al', n: 'Alertas', a: comp.alertas[0], b: comp.alertas[1], u: '' }].map((f) => (
          <View key={f.k} style={[s.fila, { gap: 8 }]}>
            <T size={13} peso={600} style={{ flex: 1 }}>
              {f.n}
            </T>
            <T size={12}>{fmt(f.a, f.u)}</T>
            <T size={12} color={c.textMuted}>{`vs ${fmt(f.b, f.u)}`}</T>
            <Cambio a={f.a} b={f.b} unidad={f.u} />
          </View>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1 },
  icono: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cuerpo: { padding: 12, gap: 14 },
  fila: { flexDirection: 'row', alignItems: 'center' },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barra: { height: 8, borderRadius: 4 },
  cambio: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
})
