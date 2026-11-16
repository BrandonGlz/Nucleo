import { useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { SelectorDispositivo } from '../../components/SelectorDispositivo'
import { Card, Chip, Icon, Skeleton, T, Tabs, TrendChart } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { umbralDe, useOperador } from '../../hooks/useOperador'
import * as lecturasApi from '../../services/lecturas'
import { UNIDAD, VARIABLE } from '../../utils/convertir'
import { cuando, fechaCorta, hora } from '../../utils/formato'
import { colors, marca } from '../../theme'

const HORA = 3600 * 1000
// Rango → desde cuándo y con qué agrupación (como el Histórico de la web).
const RANGOS = [
  { id: '24h', label: '24 h', ms: 24 * HORA, intervalo: 'hora' },
  { id: '7d', label: '7 días', ms: 7 * 24 * HORA, intervalo: 'hora' },
  { id: '30d', label: '30 días', ms: 30 * 24 * HORA, intervalo: 'dia' },
]
const VARIABLES = ['TEMP', 'HUM', 'AIRE']

// Histórico: una variable del dispositivo a la vista en 24 h, 7 o 30 días, con su umbral, el promedio,
// mínimo, máximo y tiempo en rango (en una fila, sin scroll) y el CSV para compartir.
export function HistoricoScreen() {
  const { c } = useTema()
  const { estado: estadoOp, datos: op, elegir } = useOperador()
  const d = op?.dispositivo
  const [variable, setVariable] = useState('TEMP')
  const [rangoId, setRangoId] = useState('24h')
  const [exportando, setExportando] = useState(false)
  const rango = RANGOS.find((x) => x.id === rangoId)
  const u = umbralDe(op, variable)
  const info = VARIABLE[variable]
  const unidad = UNIDAD[variable]
  const dec = info.decimales
  const serie = useDatos(
    () =>
      d
        ? lecturasApi.serie(d.num, variable, { intervalo: rango.intervalo, desde: new Date(Date.now() - rango.ms).toISOString() })
        : new Promise(() => {}),
    [d?.num, variable, rangoId],
  )
  const puntos = serie.datos
  const valores = (puntos ?? []).map((p) => Number(p.promedio))
  const minimo = puntos?.length ? Math.min(...puntos.map((p) => Number(p.minimo ?? p.promedio))) : null
  const maximo = puntos?.length ? Math.max(...puntos.map((p) => Number(p.maximo ?? p.promedio))) : null
  const prom = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null
  const enRango = (v) => (u?.advertencia_min == null || v >= Number(u.advertencia_min)) && (u?.advertencia_max == null || v <= Number(u.advertencia_max))
  const dentro = valores.length > 0 && u ? Math.round((valores.filter(enRango).length / valores.length) * 100) : null
  const varios = (op?.dispositivos?.length ?? 0) > 1

  const compartir = async () => {
    setExportando(true)
    try {
      await lecturasApi.compartirCsv(d.num, variable, new Date(Date.now() - rango.ms).toISOString())
    } catch (e) {
      Alert.alert('No se pudo exportar', e.message)
    } finally {
      setExportando(false)
    }
  }

  const zona = (
    <>
      <View style={s.entre}>
        <T peso={700} size={34} lh={40} style={{ letterSpacing: -1.2 }}>
          Histórico
        </T>
        {d && (
          <Pressable
            onPress={compartir}
            disabled={exportando}
            accessibilityRole="button"
            accessibilityLabel="Compartir las lecturas en CSV"
            style={({ pressed }) => [s.csv, (pressed || exportando) && { opacity: 0.6 }]}
          >
            <Icon name="share-2" size={15} color={marca.claro} />
            <T peso={600} size={12}>
              {exportando ? 'Preparando…' : 'CSV'}
            </T>
          </Pressable>
        )}
      </View>
      {varios ? (
        <SelectorDispositivo dispositivos={op.dispositivos} valor={d?.num} onElegir={elegir} etiqueta="Dispositivo" />
      ) : (
        <T size={12} color={colors.dark.textMuted}>
          {d ? `${d.nombre} · ${op.area?.nombre ?? ''}` : ' '}
        </T>
      )}
      <Tabs items={VARIABLES.map((v) => ({ id: v, label: VARIABLE[v].corta }))} value={variable} onChange={setVariable} lleno />
    </>
  )

  if (estadoOp !== 'cargando' && !d) {
    return (
      <Pantalla zona={zona}>
        <EstadoVacio titulo="Sin dispositivos" mensaje="Tu cuenta aún no tiene dispositivos a la vista." />
      </Pantalla>
    )
  }

  return (
    <Pantalla zona={zona} onRecargar={serie.reintentar}>
      <View style={s.chips}>
        {RANGOS.map((r) => (
          <Chip key={r.id} selected={rangoId === r.id} onPress={() => setRangoId(r.id)}>
            {r.label}
          </Chip>
        ))}
      </View>
      {serie.estado === 'error' ? (
        <EstadoError onReintentar={serie.reintentar} />
      ) : (
        <>
          <Card padding="sm">
            <View style={[s.entre, { paddingHorizontal: 4, paddingBottom: 8, alignItems: 'baseline' }]}>
              <T peso={800} size={26} lh={30} num style={{ letterSpacing: -0.8 }}>
                {prom == null ? '—' : prom.toFixed(dec)}
                <T peso={600} size={13} color={c.textMuted}>{` ${unidad} promedio`}</T>
              </T>
              {puntos?.length ? (
                <T size={12} color={c.textMuted}>
                  {`${fechaCorta(puntos[0].periodo)} – ${fechaCorta(puntos.at(-1).periodo)}`}
                </T>
              ) : null}
            </View>
            {puntos && !puntos.length ? (
              <T size={14} color={c.textMuted} style={{ textAlign: 'center', paddingVertical: 60 }}>
                Sin lecturas en este periodo.
              </T>
            ) : puntos ? (
              <TrendChart
                data={puntos.map((p, i) => ({
                  label: i % Math.max(1, Math.ceil(puntos.length / 5)) === 0 ? (rango.intervalo === 'dia' || rangoId === '7d' ? fechaCorta(p.periodo) : hora(p.periodo)) : '',
                  time: cuando(p.periodo),
                  value: Number(p.promedio),
                }))}
                unit={unidad}
                decimals={dec}
                threshold={u ? { min: variable === 'AIRE' ? undefined : Number(u.peligro_min), max: Number(u.peligro_max) } : undefined}
                height={200}
              />
            ) : (
              <Skeleton height={200} />
            )}
          </Card>
          <View style={s.tres}>
            {[
              { k: 'Mínimo', v: minimo == null ? null : minimo.toFixed(dec), bg: c.surface, et: c.textMuted },
              { k: 'Máximo', v: maximo == null ? null : maximo.toFixed(dec), bg: c.surface, et: c.textMuted, alto: u && maximo > Number(u.advertencia_max) },
              {
                k: 'En rango',
                v: dentro == null ? null : `${dentro} %`,
                bg: dentro != null && dentro < 90 ? c.warningSoft : c.accentSoft,
                et: dentro != null && dentro < 90 ? c.warning : c.success,
              },
            ].map((x) => (
              <View
                key={x.k}
                style={[s.cifra, { backgroundColor: x.bg }]}
                accessibilityLabel={x.k === 'En rango' && u ? `${x.v ?? '—'} del tiempo dentro del umbral ${Number(u.advertencia_min ?? 0)} – ${Number(u.advertencia_max)} ${unidad}` : undefined}
              >
                <T size={11} peso={600} color={x.et}>
                  {x.k}
                </T>
                {x.v == null && !puntos ? (
                  <Skeleton height={22} width={56} />
                ) : (
                  <T peso={800} size={20} lh={26} num color={x.alto ? c.danger : c.textPrimary}>
                    {x.v ?? '—'}
                  </T>
                )}
              </View>
            ))}
          </View>
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  csv: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(243,245,242,0.08)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tres: { flexDirection: 'row', gap: 10 },
  cifra: { flex: 1, gap: 2, padding: 14, borderRadius: 20 },
})
