import { StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { EstadoError } from '../../components/EstadoError'
import { Medidor } from '../../components/Medidor'
import { Pantalla } from '../../components/Pantalla'
import { Card, Icon, Skeleton, T, TrendChart } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { lecturaDe, umbralDe, useOperador } from '../../hooks/useOperador'
import * as lecturasApi from '../../services/lecturas'
import { enLinea, escala, nivelLectura, posicion, UNIDAD, VARIABLE } from '../../utils/convertir'
import { esHoy, hora, num } from '../../utils/formato'
import { colors, marca } from '../../theme'

const TONO = { normal: marca.verde, warning: colors.dark.warning, critical: colors.dark.danger }
const TEXTO = { normal: 'en rango', warning: 'cerca del límite', critical: 'fuera de rango' }

// Detalle de una variable del dispositivo asignado: medidor en vivo y últimas 24 h.
export function MedicionesScreen({ navigation, route }) {
  const variable = route.params?.variable ?? 'TEMP'
  const info = VARIABLE[variable]
  const unidad = UNIDAD[variable]
  const { c } = useTema()
  const { datos: op } = useOperador()
  const d = op?.dispositivo
  const l = lecturaDe(op, variable)
  const u = umbralDe(op, variable)
  const serie = useDatos(() => (d ? lecturasApi.serie(d.num, variable) : new Promise(() => {})), [d?.num, variable])
  const [min, max] = u ? escala(u, variable) : [0, 1]
  const nivel = nivelLectura(l?.valor, u)
  const vivo = d && enLinea(d)
  const valores = (serie.datos ?? []).map((p) => Number(p.promedio))
  const stat = (f) => (valores.length ? f(...valores) : null)
  const prom = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null
  const dec = info.decimales

  return (
    <Pantalla
      pestanas={false}
      deco="centro"
      zona={
        <>
          <Cabecera titulo={info.etiqueta} onVolver={() => navigation.goBack()} />
          <View style={{ alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <Medidor avance={posicion(l?.valor, min, max)} color={vivo ? TONO[nivel] : 'rgba(243,245,242,0.3)'}>
              <View style={s.fila6}>
                <View style={[s.punto, { backgroundColor: vivo ? colors.dark.success : colors.dark.offline }]} />
                <T peso={600} size={12} color={colors.dark.textSecondary}>
                  {vivo ? 'En vivo' : 'Sin conexión'}
                </T>
              </View>
              <T peso={800} size={variable === 'AIRE' ? 60 : 72} lh={76} num style={{ letterSpacing: -3.6 }}>
                {num(l?.valor, dec)}
              </T>
              <T peso={600} size={15} color={vivo ? TONO[nivel] : colors.dark.textMuted}>
                {`${unidad} · ${vivo ? TEXTO[nivel] : 'última lectura'}`}
              </T>
            </Medidor>
            <View style={[s.entre, { width: 200, marginTop: -28 }]}>
              <T size={12} color={colors.dark.textMuted}>{`${min}${variable === 'TEMP' ? '°' : ''}`}</T>
              <T size={12} color={colors.dark.textMuted}>{`${max}${variable === 'TEMP' ? '°' : ''}`}</T>
            </View>
            <T size={13} color={colors.dark.textSecondary} style={{ marginTop: 8, textAlign: 'center' }}>
              {d ? `${d.nombre} · ${op.area?.nombre ?? ''} · umbral ${Number(u?.advertencia_min)} – ${Number(u?.advertencia_max)} ${unidad}` : ' '}
            </T>
          </View>
        </>
      }
    >
      {serie.estado === 'error' ? (
        <EstadoError onReintentar={serie.reintentar} />
      ) : (
        <>
          <View style={s.tres}>
            {[
              ['Mín', stat(Math.min), c.surface, c.textPrimary, c.textMuted],
              ['Prom', prom, marca.verde, marca.tinta, 'rgba(18,20,19,0.6)'],
              ['Máx', stat(Math.max), marca.tinta, marca.claro, marca.tenue],
            ].map(([k, v, bg, fg, et]) => (
              <View key={k} style={[s.cifra, { backgroundColor: bg }]}>
                <T mayus color={et}>
                  {k}
                </T>
                {v == null ? (
                  <Skeleton height={24} width={60} />
                ) : (
                  <T peso={700} size={22} lh={28} num color={fg} style={{ letterSpacing: -0.4 }}>
                    {v.toFixed(dec)}
                    <T peso={600} size={12} color={fg} style={{ opacity: 0.6 }}>{` ${unidad}`}</T>
                  </T>
                )}
              </View>
            ))}
          </View>
          <Card padding="sm">
            <View style={[s.entre, { paddingHorizontal: 4, paddingBottom: 8, alignItems: 'baseline' }]}>
              <T peso={700} size={15}>
                Últimas 24 h
              </T>
              {serie.datos?.length ? (
                <T size={12} color={c.textMuted}>
                  {`${esHoy(serie.datos[0].periodo) ? 'Hoy' : 'Ayer'} ${hora(serie.datos[0].periodo)} – hoy ${hora(serie.datos.at(-1).periodo)}`}
                </T>
              ) : null}
            </View>
            {serie.datos ? (
              <TrendChart
                data={serie.datos.map((p, i) => ({
                  label: i % 6 === 0 ? hora(p.periodo) : '',
                  time: `${esHoy(p.periodo) ? 'Hoy' : 'Ayer'} · ${hora(p.periodo)}`,
                  value: Number(p.promedio),
                }))}
                unit={unidad}
                decimals={dec}
                threshold={u ? { min: variable === 'AIRE' ? undefined : Number(u.peligro_min), max: Number(u.peligro_max) } : undefined}
                height={190}
              />
            ) : (
              <Skeleton height={190} />
            )}
          </Card>
          <View style={[s.fila6, { justifyContent: 'center' }]}>
            <Icon name="sliders-horizontal" size={14} color={c.textMuted} />
            <T size={12} color={c.textMuted}>
              Umbral del dispositivo · solo lectura
            </T>
          </View>
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between' },
  punto: { width: 8, height: 8, borderRadius: 4 },
  tres: { flexDirection: 'row', gap: 10 },
  cifra: { flex: 1, gap: 2, padding: 14, borderRadius: 22 },
})
