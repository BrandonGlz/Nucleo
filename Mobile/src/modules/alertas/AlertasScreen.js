import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Badge, Chip, Icon, IconCircle, Input, Skeleton, StatusBadge, T } from '../../components/ui'
import { useAnimaciones } from '../../context/PreferenciasContext'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { pendientesDe, useOperador } from '../../hooks/useOperador'
import * as alertasApi from '../../services/alertas'
import { ESTADO_ALERTA, NIVEL_ALERTA, tituloAlerta, valorAlerta, VARIABLE } from '../../utils/convertir'
import { diaCorto, esAyer, esHoy, fechaLarga } from '../../utils/formato'
import { colors, marca } from '../../theme'

const FILTROS = [
  ['todas', 'Todas', () => true],
  ['pendientes', 'Pendientes', (a) => a.estado === 'PENDIENTE'],
  ['atendidas', 'Atendidas', (a) => a.estado === 'ATENDIDA'],
]
// Atienden y descartan alertas el administrador y el supervisor (como en la web).
export const puedeResolver = (u) => u?.rol === 'ADMIN' || u?.rol === 'SUPER'
const grupoDe = (iso) => (esHoy(iso) ? 'Hoy' : esAyer(iso) ? 'Ayer' : fechaLarga(iso))
const UMBRAL = 96

// Pregunta y resuelve la alerta; al terminar refresca los datos.
export function confirmarResolver(a, accion, alTerminar) {
  const atender = accion === 'atender'
  Alert.alert(
    atender ? '¿Atender la alerta?' : '¿Descartar la alerta?',
    `${tituloAlerta(a)} · ${a.dispositivo_nombre}`,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: atender ? 'Atender' : 'Descartar',
        style: atender ? 'default' : 'destructive',
        onPress: () =>
          alertasApi
            .resolver(a.num, accion)
            .then(alTerminar)
            .catch(() => Alert.alert('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.')),
      },
    ],
  )
}

// Tarjeta que se desliza: a la izquierda «Atender», a la derecha «Descartar». Sin animaciones o
// sin permiso queda fija (el detalle de la alerta tiene los mismos botones).
function Deslizable({ activo, alResolver, children }) {
  const { c } = useTema()
  const animar = useAnimaciones()
  const [x] = useState(() => new Animated.Value(0))
  const volver = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start()
  const resolverRef = useRef(alResolver)
  useEffect(() => {
    resolverRef.current = alResolver
  })
  // El ref solo se lee dentro de los callbacks del gesto, no al dibujar.
  // oxlint-disable-next-line react/refs
  const [gesto] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(-140, Math.min(140, g.dx))),
      onPanResponderRelease: (_e, g) => {
        volver()
        if (g.dx <= -UMBRAL) resolverRef.current('atender')
        else if (g.dx >= UMBRAL) resolverRef.current('descartar')
      },
      onPanResponderTerminate: volver,
    }),
  )
  if (!activo) return children
  const fondo = x.interpolate({ inputRange: [-1, 0, 1], outputRange: [1, 0, 0], extrapolate: 'clamp' })
  return (
    <View style={s.deslizable}>
      <View style={[StyleSheet.absoluteFill, s.acciones]}>
        <View style={[s.accion, { backgroundColor: c.offlineSoft, justifyContent: 'flex-start', paddingLeft: 20 }]}>
          <Icon name="circle-x" size={18} color={c.offline} />
          <T peso={700} size={12} color={c.offline}>
            Descartar
          </T>
        </View>
        <Animated.View style={[s.accion, { backgroundColor: c.success, justifyContent: 'flex-end', paddingRight: 20, opacity: animar ? fondo : 1 }]}>
          <T peso={700} size={12} color="#FFFFFF">
            Atender
          </T>
          <Icon name="check" size={18} color="#FFFFFF" />
        </Animated.View>
      </View>
      <Animated.View {...gesto.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  )
}

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
            {diaCorto(a.fecha_hora)}
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

// Alertas: el operador ve las de su dispositivo; las demás cuentas, todas las de su alcance (como en
// la web). El administrador y el supervisor las atienden o descartan deslizando la tarjeta.
export function AlertasScreen({ navigation }) {
  const { c } = useTema()
  const { usuario } = useSesion()
  const oper = usuario.rol === 'OPER'
  const { estado, datos: op, reintentar, refrescar } = useOperador()
  const [filtro, setFiltro] = useState('todas')
  const [buscar, setBuscar] = useState('')
  const resolver = puedeResolver(usuario)
  const alertas = [...(op?.alertas ?? [])].sort((x, y) => (x.fecha_hora < y.fecha_hora ? 1 : -1))
  const criticas = alertas.filter((a) => a.estado === 'PENDIENTE' && a.nivel === 'PELIGRO').length
  const advertencias = alertas.filter((a) => a.estado === 'PENDIENTE' && a.nivel === 'ADVERTENCIA').length
  const pendientes = pendientesDe(op).length
  const atendidas = alertas.filter((a) => a.estado === 'ATENDIDA').length
  const descartadas = alertas.filter((a) => a.estado === 'DESCARTADA').length
  const vacio = estado === 'listo' && alertas.length === 0
  const q = buscar.trim().toLowerCase()
  const visibles = alertas
    .filter(FILTROS.find(([k]) => k === filtro)[2])
    .filter((a) => !q || `${tituloAlerta(a)} ${a.dispositivo_nombre} ${VARIABLE[a.variable]?.etiqueta ?? ''}`.toLowerCase().includes(q))
  const grupos = []
  for (const a of visibles) {
    const g = grupoDe(a.fecha_hora)
    if (grupos.at(-1)?.g !== g) grupos.push({ g, items: [] })
    grupos.at(-1).items.push(a)
  }

  const zona = (
    <>
      <View style={[s.entre, { alignItems: 'flex-end' }]}>
        <T peso={700} size={34} lh={40} style={{ letterSpacing: -1.2 }}>
          Alertas
        </T>
        <T size={12} color={colors.dark.textMuted} style={{ paddingBottom: 8 }}>
          {!oper ? 'Todos tus dispositivos' : op?.dispositivo ? `${op.dispositivo.nombre} · ${op.area?.nombre ?? ''}` : ' '}
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
      {estado !== 'cargando' && !vacio && (
        <View style={s.gravedad}>
          {[
            [criticas, criticas === 1 ? 'crítica' : 'críticas', colors.dark.danger],
            [advertencias, advertencias === 1 ? 'advertencia' : 'advertencias', colors.dark.warning],
          ].map(([n, etiqueta, color]) => (
            <View key={etiqueta} style={s.pildora}>
              <View style={[s.punto, { backgroundColor: color }]} />
              <T peso={600} size={12}>{`${n} ${etiqueta}`}</T>
            </View>
          ))}
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
          {!vacio && estado !== 'cargando' && (
            <Input icon="search" placeholder="Buscar por variable o dispositivo" value={buscar} onChangeText={setBuscar} accessibilityLabel="Buscar alertas" />
          )}
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
                {grupos.map(({ g, items }) => (
                  <View key={g} style={{ gap: 10 }}>
                    <T mayus color={c.textMuted} style={{ paddingTop: 4 }}>
                      {g}
                    </T>
                    {items.map((a, i) => (
                      <Aparece key={`${filtro}-${a.num}`} indice={i}>
                        <Deslizable activo={resolver && a.estado === 'PENDIENTE'} alResolver={(accion) => confirmarResolver(a, accion, refrescar)}>
                          <TarjetaAlerta a={a} onPress={() => navigation.navigate('DetalleAlerta', { num: a.num })} />
                        </Deslizable>
                      </Aparece>
                    ))}
                  </View>
                ))}
                {!visibles.length && (
                  <T size={14} color={c.textMuted} style={{ textAlign: 'center', paddingVertical: 24 }}>
                    {q ? 'Ninguna alerta coincide con la búsqueda.' : 'No hay alertas con este filtro.'}
                  </T>
                )}
              </View>
              <T size={13} lh={20} color={c.textMuted} style={{ textAlign: 'center', paddingHorizontal: 16 }}>
                {resolver
                  ? 'Desliza una alerta pendiente a la izquierda para atenderla o a la derecha para descartarla.'
                  : oper
                    ? 'Tu supervisor atiende las alertas. Aquí puedes consultarlas.'
                    : 'Los supervisores atienden las alertas. Aquí puedes consultarlas.'}
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
  gravedad: { flexDirection: 'row', gap: 8 },
  pildora: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(243,245,242,0.08)' },
  punto: { width: 8, height: 8, borderRadius: 4 },
  deslizable: { borderRadius: 22, overflow: 'hidden' },
  acciones: { flexDirection: 'row', justifyContent: 'space-between' },
  accion: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
})
