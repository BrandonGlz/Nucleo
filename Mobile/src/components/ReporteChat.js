import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useTema } from '../context/TemaContext'
import { abrirPdf, verEnWeb } from '../services/reportes'
import { VARIABLE } from '../utils/convertir'
import { Icon, T } from './ui'

const fecha = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
const cifra = (v, unidad) => (v == null ? '—' : Number(v).toFixed(unidad === 'ppm' ? 0 : 1))

// Resumen del reporte que generó Núcleo AI, dentro del chat: cifras clave, rango por variable y el
// inicio del análisis, con el PDF y el enlace al reporte completo en la web.
export function ReporteChat({ r }) {
  const { c } = useTema()
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState(false)
  const pdf = async () => {
    setBajando(true)
    setError(false)
    try {
      await abrirPdf(r.num)
    } catch {
      setError(true)
    }
    setBajando(false)
  }
  const borde = { borderColor: c.border }
  return (
    <View style={[s.tarjeta, borde, { backgroundColor: c.surface }]}>
      <View style={s.fila}>
        <View style={[s.icono, { backgroundColor: c.surfaceMuted }]}>
          <Icon name="file-text" size={18} color={c.textPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <T peso={700} size={15} lh={20}>
            {r.titulo}
          </T>
          <T size={12} color={c.textMuted}>
            {`${fecha(r.periodo_inicio)} – ${fecha(r.periodo_fin)} · Folio R-${String(r.num).padStart(4, '0')}`}
          </T>
        </View>
      </View>
      <View style={[s.cifras, borde]}>
        {[
          ['Lecturas', r.lecturas.toLocaleString('es-MX')],
          ['Alertas', String(r.alertas), r.alertas ? c.warning : undefined],
          ['Días', String(r.dias)],
        ].map(([etiqueta, valor, color], i) => (
          <View key={etiqueta} style={[s.cifra, i > 0 && [s.separador, borde]]}>
            <T mayus size={10} color={c.textMuted}>
              {etiqueta}
            </T>
            <T peso={700} size={18} num color={color}>
              {valor}
            </T>
          </View>
        ))}
      </View>
      {r.peligro > 0 && (
        <T size={12} peso={600} color={c.danger}>
          {`${r.peligro} ${r.peligro === 1 ? 'alerta' : 'alertas'} de peligro`}
        </T>
      )}
      {r.variables.map((v) => {
        const ancho = v.maximo - v.minimo
        const pos = ancho > 0 ? Math.min(100, Math.max(0, ((v.promedio - v.minimo) / ancho) * 100)) : 50
        return (
          <View key={v.variable} style={[s.variable, borde]}>
            <View style={s.entre}>
              <View style={[s.fila, { gap: 6 }]}>
                <Icon name={VARIABLE[v.variable]?.icono ?? 'activity'} size={14} color={c.textSecondary} />
                <T peso={600} size={13}>
                  {VARIABLE[v.variable]?.etiqueta ?? v.nombre}
                </T>
              </View>
              <T size={12} peso={600} color={v.alertas ? c.warning : c.textMuted}>
                {v.alertas ? `${v.alertas} alertas` : 'Sin alertas'}
              </T>
            </View>
            <T peso={700} size={20} num>
              {cifra(v.promedio, v.unidad)}
              <T size={12} peso={600} color={c.textMuted}>{` ${v.unidad} promedio`}</T>
            </T>
            <View style={[s.rango, { backgroundColor: c.textPrimary }]}>
              <View style={[s.punto, { left: `${pos}%`, borderColor: c.textPrimary, backgroundColor: c.surface }]} />
            </View>
            <View style={s.entre}>
              <T size={11} color={c.textMuted}>{`Mín ${cifra(v.minimo, v.unidad)}`}</T>
              <T size={11} color={c.textMuted}>{`Máx ${cifra(v.maximo, v.unidad)}`}</T>
            </View>
          </View>
        )
      })}
      {!!r.resumen && (
        <T size={13} lh={19} color={c.textSecondary}>
          {r.resumen}
        </T>
      )}
      <View style={[s.fila, { flexWrap: 'wrap', gap: 8 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={pdf}
          disabled={bajando}
          style={({ pressed }) => [s.boton, { backgroundColor: c.accent }, pressed && { opacity: 0.8 }]}
        >
          {bajando ? <ActivityIndicator size="small" color={c.accentContrast} /> : <Icon name="download" size={16} color={c.accentContrast} />}
          <T peso={700} size={13} color={c.accentContrast}>
            {bajando ? 'Descargando…' : 'Ver PDF'}
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => verEnWeb(r.num)}
          style={({ pressed }) => [s.boton, s.secundario, borde, pressed && { opacity: 0.7 }]}
        >
          <Icon name="external-link" size={16} color={c.textPrimary} />
          <T peso={700} size={13}>
            Ver en la web
          </T>
        </Pressable>
      </View>
      {error && (
        <T size={12} color={c.danger}>
          No se pudo abrir el PDF. Intenta de nuevo.
        </T>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  tarjeta: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  icono: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cifras: { flexDirection: 'row', borderWidth: 1, borderRadius: 12 },
  cifra: { flex: 1, gap: 2, paddingVertical: 8, paddingHorizontal: 10 },
  separador: { borderLeftWidth: 1 },
  variable: { gap: 4, padding: 12, borderRadius: 12, borderWidth: 1 },
  rango: { height: 2, marginTop: 8, marginBottom: 6 },
  punto: { position: 'absolute', top: -4, width: 10, height: 10, marginLeft: -5, borderRadius: 5, borderWidth: 2 },
  boton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999 },
  secundario: { borderWidth: 1 },
})
