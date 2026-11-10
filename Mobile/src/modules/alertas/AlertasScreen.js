import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { Badge, Chip, Icon, IconCircle, Skeleton, StatusBadge, T } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { pendientesDe, useOperador } from '../../hooks/useOperador'
import { ESTADO_ALERTA, NIVEL_ALERTA, tituloAlerta, valorAlerta } from '../../utils/convertir'
import { esHoy, hora } from '../../utils/formato'
import { colors, marca } from '../../theme'

const FILTROS = [
  ['todas', 'Todas', () => true],
  ['pendientes', 'Pendientes', (a) => a.estado === 'PENDIENTE'],
  ['atendidas', 'Atendidas', (a) => a.estado === 'ATENDIDA'],
]
const limiteCruzado = (a) =>
  a.nivel === 'PELIGRO' ? `máx ${Number(a.peligro_max)} ${a.unidad}` : `máx ${Number(a.advertencia_max)} ${a.unidad}`

export function TarjetaAlerta({ a, onPress }) {
  const { c } = useTema()
  const nivel = NIVEL_ALERTA[a.nivel]
  const est = ESTADO_ALERTA[a.estado]
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [s.tarjeta, { backgroundColor: c.surface }, pressed && { opacity: 0.85 }]}
    >
      <View style={[s.franja, { backgroundColor: c[nivel.tone] }]} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={s.entre}>
          <T peso={700} size={15} lh={20} style={{ flex: 1 }}>
            {tituloAlerta(a)}
          </T>
          <T size={12} num color={c.textMuted}>
            {esHoy(a.fecha_hora) ? hora(a.fecha_hora) : 'Ayer'}
          </T>
        </View>
        <T size={13} lh={18} color={c.textSecondary}>
          {`${a.dispositivo_nombre} · ${valorAlerta(a)} (${limiteCruzado(a)})`}
        </T>
        <View style={s.badges}>
          <StatusBadge status={nivel.status} />
          <Badge tone={est.tone} icon={est.icon}>
            {est.label}
          </Badge>
        </View>
      </View>
    </Pressable>
  )
}

// Alertas del dispositivo del operador. Solo consulta: el supervisor las atiende.
export function AlertasScreen({ navigation }) {
  const { c } = useTema()
  const { estado, datos: op, reintentar } = useOperador()
  const [filtro, setFiltro] = useState('todas')
  const alertas = [...(op?.alertas ?? [])].sort((x, y) => (x.fecha_hora < y.fecha_hora ? 1 : -1))
  const pendientes = pendientesDe(op).length
  const atendidas = alertas.filter((a) => a.estado === 'ATENDIDA').length
  const descartadas = alertas.filter((a) => a.estado === 'DESCARTADA').length
  const vacio = estado === 'listo' && alertas.length === 0
  const visibles = alertas.filter(FILTROS.find(([k]) => k === filtro)[2])

  const zona = (
    <>
      <View style={[s.entre, { alignItems: 'flex-end' }]}>
        <T peso={700} size={34} lh={40} style={{ letterSpacing: -1.2 }}>
          Alertas
        </T>
        <T size={12} color={colors.dark.textMuted} style={{ paddingBottom: 8 }}>
          {op?.dispositivo ? `${op.dispositivo.nombre} · ${op.area?.nombre ?? ''}` : ' '}
        </T>
      </View>
      {estado === 'cargando' ? (
        <Skeleton height={96} width={180} />
      ) : vacio ? (
        <View style={[s.fila14, { paddingTop: 8, paddingBottom: 4 }]}>
          <View style={s.check}>
            <Icon name="circle-check" size={30} color={marca.tinta} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T peso={700} size={24} lh={30} style={{ letterSpacing: -0.5 }}>
              Todo en rango
            </T>
            <T size={13} color={colors.dark.textSecondary}>
              Sin alertas. Te avisaremos si algo cambia.
            </T>
          </View>
        </View>
      ) : (
        <View style={[s.fila14, { alignItems: 'flex-end' }]}>
          <T peso={800} size={112} lh={104} num color={marca.verde} style={{ letterSpacing: -6.7 }}>
            {pendientes}
          </T>
          <View style={{ gap: 2, paddingBottom: 12 }}>
            <T peso={700} size={20} lh={24}>
              {pendientes === 1 ? 'pendiente' : 'pendientes'}
            </T>
            <T size={13} color={colors.dark.textSecondary}>
              {`${atendidas} ${atendidas === 1 ? 'atendida' : 'atendidas'} · ${descartadas} ${descartadas === 1 ? 'descartada' : 'descartadas'}`}
            </T>
          </View>
        </View>
      )}
    </>
  )

  return (
    <Pantalla zona={zona} onRecargar={reintentar}>
      {estado === 'error' ? (
        <EstadoError onReintentar={reintentar} />
      ) : (
        <>
          <View style={s.chips}>
            {FILTROS.map(([k, etiqueta]) => (
              <Chip key={k} selected={filtro === k} count={k === 'todas' && estado === 'listo' && !vacio ? alertas.length : undefined} onPress={() => setFiltro(k)}>
                {etiqueta}
              </Chip>
            ))}
          </View>
          {estado === 'cargando' ? (
            [0, 1, 2].map((i) => <Skeleton key={i} height={110} style={{ borderRadius: 22 }} />)
          ) : vacio ? (
            <View style={[s.fila12, s.aviso, { backgroundColor: c.surface }]}>
              <IconCircle name="bell" size="sm" />
              <T size={14} lh={20} color={c.textSecondary} style={{ flex: 1 }}>
                Recibirás una notificación en cuanto una lectura salga de rango.
              </T>
            </View>
          ) : (
            <>
              <View style={{ gap: 10 }}>
                {visibles.map((a) => (
                  <TarjetaAlerta key={a.num} a={a} onPress={() => navigation.navigate('DetalleAlerta', { num: a.num })} />
                ))}
                {!visibles.length && (
                  <T size={14} color={c.textMuted} style={{ textAlign: 'center', paddingVertical: 24 }}>
                    No hay alertas con este filtro.
                  </T>
                )}
              </View>
              <T size={13} lh={20} color={c.textMuted} style={{ textAlign: 'center', paddingHorizontal: 16 }}>
                Tu supervisor atiende las alertas. Aquí puedes consultarlas.
              </T>
            </>
          )}
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  entre: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  fila14: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 64, height: 64, borderRadius: 32, backgroundColor: marca.verde, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tarjeta: { flexDirection: 'row', gap: 14, paddingVertical: 16, paddingRight: 16, paddingLeft: 14, borderRadius: 22 },
  franja: { width: 4, borderRadius: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  aviso: { padding: 16, borderRadius: 22 },
})
