import { StyleSheet, View } from 'react-native'
import { BarraRango } from '../../components/BarraRango'
import { Cabecera } from '../../components/Cabecera'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { ActivityFeed, Badge, Button, Card, Skeleton, StatusBadge, T, TrendChart } from '../../components/ui'
import { puedeResolver } from './AlertasScreen'
import { useResolver } from './HojaResolver'
import { useSesion } from '../../context/SesionContext'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { useOperador } from '../../hooks/useOperador'
import * as alertasApi from '../../services/alertas'
import * as lecturasApi from '../../services/lecturas'
import * as usuariosApi from '../../services/usuarios'
import { ESTADO_ALERTA, NIVEL_ALERTA, nombreCorto, pagina, tituloAlerta, VARIABLE } from '../../utils/convertir'
import { cuando, fechaCorta, hora, horaSeg, num } from '../../utils/formato'
import { colors, marca } from '../../theme'

async function cargarDetalle(num_) {
  const a = await alertasApi.detalle(num_)
  const desde = new Date(new Date(a.fecha_hora).getTime() - 20 * 60000).toISOString()
  const hasta = new Date(new Date(a.fecha_hora).getTime() + 15 * 60000).toISOString()
  const [serie, notificaciones, usuarios] = await Promise.all([
    lecturasApi.serie(a.dispositivo, a.variable, { intervalo: 'minuto', desde, hasta }),
    alertasApi.notificaciones().then(pagina),
    // Solo administradores y supervisores pueden listar usuarios; los demás ven «tu supervisor».
    a.atendida_por ? usuariosApi.lista().then(pagina).catch(() => []) : Promise.resolve([]),
  ])
  return {
    a, serie,
    notificaciones: notificaciones.filter((n) => n.alerta === a.num),
    quien: usuarios.find((u) => u.num === a.atendida_por),
  }
}

// Detalle de una alerta: valor que la disparó, curva alrededor del evento y línea de tiempo.
export function DetalleAlertaScreen({ navigation, route }) {
  const { c } = useTema()
  const { datos: op, refrescar: refrescarOp } = useOperador()
  const { usuario } = useSesion()
  const oper = usuario?.rol === 'OPER'
  const resolver = puedeResolver(usuario)
  const { estado, datos, reintentar, refrescar } = useDatos(() => cargarDetalle(route.params.num), [route.params.num])
  const { abrir: abrirResolver, hoja } = useResolver(() => (refrescar(), refrescarOp()))
  const a = datos?.a
  const volver = <Cabecera titulo="Alerta" onVolver={() => navigation.goBack()} />

  if (!a) {
    return (
      <Pantalla pestanas={false} deco="alerta" zona={<>{volver}<Skeleton height={180} style={{ opacity: 0.2 }} /></>}>
        {estado === 'error' ? <EstadoError onReintentar={reintentar} /> : <Skeleton height={170} style={{ borderRadius: 24 }} />}
      </Pantalla>
    )
  }

  const peligro = a.nivel === 'PELIGRO'
  const limite = Number(peligro ? a.peligro_max : a.advertencia_max)
  const valor = Number(a.lectura_valor)
  const color = peligro ? colors.dark.danger : colors.dark.warning
  const dec = VARIABLE[a.variable].decimales
  const tope = Math.max(valor, limite) * 1.25
  const est = ESTADO_ALERTA[a.estado]
  const notif = datos.notificaciones[0]
  const descartada = a.estado === 'DESCARTADA'
  // Quién la resolvió: de la lista de usuarios (si se puede listar) o el nombre que da la API.
  const quien = nombreCorto(datos.quien) || a.atendida_por_nombre || (oper ? 'tu supervisor' : 'el supervisor')
  const linea = [
    { level: peligro ? 'critical' : 'warning', title: 'Creada', meta: `Lectura de ${num(valor, dec)} ${a.unidad} a las ${horaSeg(a.lectura_fecha_hora)}`, time: hora(a.fecha_hora) },
    notif && {
      level: 'info', icon: 'bell', title: 'Notificada',
      meta: notif.canal === 'PUSH' ? 'Push a ti y a tu supervisor' : 'Por correo',
      time: hora(notif.fecha_envio),
    },
    a.estado === 'PENDIENTE'
      ? { level: 'info', icon: 'clock', title: 'Pendiente', meta: oper ? 'Tu supervisor la atenderá' : resolver ? 'Atiéndela o descártala aquí abajo' : 'La atiende el supervisor', time: '' }
      : {
          level: a.estado === 'ATENDIDA' ? 'normal' : 'offline', icon: a.estado === 'ATENDIDA' ? undefined : 'circle-x',
          title: `${a.estado === 'ATENDIDA' ? 'Atendida' : 'Descartada'} por ${quien}`,
          meta: a.fecha_atencion ? fechaCorta(a.fecha_atencion) : '', time: hora(a.fecha_atencion),
        },
  ].filter(Boolean)

  const zona = (
    <>
      {volver}
      <View style={s.badges}>
        <StatusBadge status={NIVEL_ALERTA[a.nivel].status} />
        <Badge tone={a.estado === 'PENDIENTE' ? 'accent' : est.tone} icon={est.icon}>
          {est.label}
        </Badge>
      </View>
      <View style={{ gap: 2 }}>
        <T peso={700} size={20} lh={26} style={{ letterSpacing: -0.4 }}>
          {tituloAlerta(a)}
        </T>
        <T size={13} color={colors.dark.textSecondary}>
          {`${a.dispositivo_nombre}${a.dispositivo === op?.dispositivo?.num && op?.area ? ` · ${op.area.nombre}` : ''} · ${cuando(a.fecha_hora)}`}
        </T>
      </View>
      <T peso={800} size={a.variable === 'AIRE' ? 88 : 104} lh={100} num style={{ letterSpacing: -5.5 }}>
        {num(valor, dec)}
        <T peso={800} size={30} color={color}>{` ${a.unidad}`}</T>
      </T>
      <View style={{ gap: 8 }}>
        <View>
          <BarraRango desde={0} ancho={valor / tope} color={color} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(limite / tope) * 100}%`, borderRadius: 99, backgroundColor: marca.verde }} />
          <View style={{ position: 'absolute', left: `${(limite / tope) * 100}%`, top: -6, width: 2, height: 22, borderRadius: 2, backgroundColor: marca.claro }} />
        </View>
        <View style={s.entre}>
          <T size={12} color={colors.dark.textMuted}>{`Máx ${limite} ${a.unidad}`}</T>
          <T peso={600} size={12} color={color}>{`+${num(valor - limite, dec)} sobre el máximo`}</T>
        </View>
      </View>
    </>
  )

  return (
    <Pantalla pestanas={false} deco="alerta" zona={zona}>
      <Card padding="sm">
        <TrendChart
          data={datos.serie.map((p, i) => ({ label: i % 2 ? '' : hora(p.periodo), time: cuando(p.periodo, ' · '), value: Number(p.promedio) }))}
          unit={a.unidad}
          decimals={dec}
          threshold={{ max: limite }}
          activeIndex={4}
          height={150}
        />
      </Card>
      {a.estado !== 'PENDIENTE' && (
        <View style={[s.nota, { backgroundColor: c.surface }]}>
          <T mayus color={c.textMuted}>
            {descartada ? 'Motivo del descarte' : 'Qué se hizo'}
          </T>
          <T size={15} lh={22} color={a.observaciones ? c.textPrimary : c.textMuted} style={!a.observaciones && { fontStyle: 'italic' }}>
            {a.observaciones || 'No se registró una nota.'}
          </T>
          <T size={12} num color={c.textMuted}>
            {`${descartada ? 'Descartada' : 'Atendida'} por ${quien}${a.fecha_atencion ? ` · ${fechaCorta(a.fecha_atencion)}, ${hora(a.fecha_atencion)}` : ''}`}
          </T>
        </View>
      )}
      <View style={[s.linea, { backgroundColor: c.surface }]}>
        <T mayus color={c.textMuted} style={{ paddingTop: 8 }}>
          Línea de tiempo
        </T>
        <ActivityFeed items={linea} />
      </View>
      {resolver && a.estado === 'PENDIENTE' && (
        <View style={s.botones}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" size="lg" icon="circle-x" block onPress={() => abrirResolver(a, 'descartar')}>
              Descartar
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button size="lg" icon="check" block onPress={() => abrirResolver(a, 'atender')}>
              Atender
            </Button>
          </View>
        </View>
      )}
      {hoja}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between' },
  botones: { flexDirection: 'row', gap: 10 },
  nota: { gap: 8, padding: 16, borderRadius: 24 },
  linea: { gap: 4, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 24 },
})
