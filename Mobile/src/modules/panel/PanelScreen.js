import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { BarraRango } from '../../components/BarraRango'
import { SelectorDispositivo } from '../../components/SelectorDispositivo'
import { BarraCrece, PuntoVivo, useCuenta } from '../../components/Movimiento'
import { Pantalla } from '../../components/Pantalla'
import { Avatar, Icon, IconButton, Skeleton, Sparkline, T, Tabs } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useAvisos } from '../../hooks/useAvisos'
import { fuenteFoto } from '../../services/auth'
import { useDatos } from '../../hooks/useDatos'
import { lecturaDe, umbralDe, useOperador } from '../../hooks/useOperador'
import { ESTADO_FORZADO } from '../../services/mock/handlers'
import { USAR_MOCKS } from '../../services/config'
import * as lecturasApi from '../../services/lecturas'
import { enLinea, ESTADO_DISPOSITIVO, escala, nivelLectura, posicion, UNIDAD, VARIABLE } from '../../utils/convertir'
import { cuando, diaRelativo, esAyer, esHoy, fechaCorta, haceCuanto, hoyTexto, num } from '../../utils/formato'
import { colors, marca } from '../../theme'

const TONO_ZONA = { normal: marca.verde, warning: colors.dark.warning, critical: colors.dark.danger }
const TEXTO_NIVEL = { normal: 'En rango', warning: 'Cerca del límite', critical: 'Fuera de rango' }

// Nombre del dispositivo sobre la cifra grande, con su punto en vivo. Con varios dispositivos
// (administrador, supervisor, analista) tocarlo abre el selector; el estado va en la franja de abajo.
function Equipo({ punto, icono, children }) {
  const { c } = useTema()
  const { datos: op, elegir } = useOperador()
  const varios = (op?.dispositivos?.length ?? 0) > 1
  const contenido = (abrir) => (
    <Pressable
      onPress={abrir}
      disabled={!abrir}
      accessibilityRole={abrir ? 'button' : undefined}
      accessibilityLabel={abrir ? `${children}. Cambiar de dispositivo` : undefined}
      hitSlop={8}
      style={({ pressed }) => [s.fila6, { alignSelf: 'flex-start' }, pressed && { opacity: 0.7 }]}
    >
      {icono ? <Icon name={icono} size={13} color={c.textMuted} /> : <PuntoVivo color={punto} />}
      <T mayus color={c.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {children}
      </T>
      {abrir && <Icon name="chevron-down" size={14} color={c.textMuted} />}
    </Pressable>
  )
  if (!varios) return contenido(null)
  return (
    <SelectorDispositivo dispositivos={op.dispositivos} valor={op.dispositivo?.num} onElegir={elegir}>
      {contenido}
    </SelectorDispositivo>
  )
}

function ZonaPanel({ usuario, op, estado, sinConexion, onAvisos }) {
  const { c } = useTema()
  const { sinLeer } = useAvisos()
  const temp = useCuenta(lecturaDe(op, 'TEMP')?.valor)
  const d = op?.dispositivo
  const l = lecturaDe(op, 'TEMP')
  const u = umbralDe(op, 'TEMP')
  const cabeza = (
    <View style={s.fila12}>
      <Avatar name={`${usuario.nombre} ${usuario.primer_apellido}`} size={40} foto={fuenteFoto(usuario.foto_url)} />
      <View style={{ flex: 1 }}>
        <T size={12} color={c.textMuted}>
          {hoyTexto()}
        </T>
        <T peso={700} size={20} lh={26} style={{ letterSpacing: -0.4 }}>
          Hola, {usuario.nombre}
        </T>
      </View>
      {usuario.organizacion ? <IconButton icon="bell" label="Notificaciones" badge={sinLeer || undefined} inverse onPress={onAvisos} /> : null}
    </View>
  )
  if (estado === 'error' || !d) {
    return (
      <>
        {cabeza}
        <View style={{ gap: 4 }}>
          <T mayus color={c.textMuted}>
            {estado === 'error' ? 'Sin datos' : estado === 'cargando' ? 'Conectando…' : 'Sin dispositivo'}
          </T>
          <T peso={800} size={88} lh={90} style={[s.gigante, { color: 'rgba(243,245,242,0.16)' }]}>
            --.-
          </T>
        </View>
        <BarraRango />
      </>
    )
  }
  if (sinConexion) {
    return (
      <>
        {cabeza}
        <View style={{ gap: 4 }}>
          <Equipo icono="wifi-off">{`${d.nombre} · temperatura`}</Equipo>
          <T peso={800} size={88} lh={90} num style={[s.gigante, { color: 'rgba(243,245,242,0.42)' }]}>
            {num(l?.valor)}
            <T peso={800} size={32} color="rgba(243,245,242,0.42)">{` ${UNIDAD.TEMP}`}</T>
          </T>
        </View>
        <T size={13} lh={20} color={c.textSecondary} style={{ maxWidth: 300 }}>
          El dispositivo sigue alertando con LED y buzzer aunque no llegue a la plataforma.
        </T>
      </>
    )
  }
  const calentando = d.estado_dispositivo === 'CALENT'
  const [min, max] = escala(u, 'TEMP')
  const nivel = nivelLectura(l?.valor, u)
  const color = TONO_ZONA[nivel]
  return (
    <>
      {cabeza}
      <View style={{ gap: 4 }}>
        {/* Recién encendido, el sensor de aire se estabiliza unos 20 min: el punto va en ámbar. */}
        <Equipo punto={calentando ? colors.dark.warning : marca.verde}>{`${d.nombre} · temperatura en vivo`}</Equipo>
        <T peso={800} size={88} lh={90} num style={s.gigante}>
          {temp}
          <T peso={800} size={32} color={color} style={{ letterSpacing: -0.6 }}>{` ${UNIDAD.TEMP}`}</T>
        </T>
      </View>
      <View style={{ gap: 8 }}>
        <BarraRango
          desde={posicion(u.advertencia_min, min, max)}
          ancho={posicion(u.advertencia_max, min, max) - posicion(u.advertencia_min, min, max)}
          marca={posicion(l?.valor, min, max)}
        />
        <View style={s.entre}>
          <T size={12} num color={c.textMuted}>{`${min} °C`}</T>
          <T peso={600} size={12} num color={color}>
            {`${TEXTO_NIVEL[nivel]} · ${Number(u.advertencia_min)} – ${Number(u.advertencia_max)} °C`}
          </T>
          <T size={12} num color={c.textMuted}>{`${max} °C`}</T>
        </View>
      </View>
    </>
  )
}

// Mosaico de una variable: verde (humedad), tinta (aire) o apagado sin conexión.
function Mosaico({ variable, lectura, serie, tipo, sinConexion, desde, onPress }) {
  const { c, oscuro } = useTema()
  const info = VARIABLE[variable]
  const verde = tipo === 'verde' && !sinConexion
  const tinta = tipo === 'tinta' && !sinConexion
  const tenue = tinta ? colors.dark.textMuted : c.textMuted
  const contenido = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.etiqueta}: ver detalle`}
      style={({ pressed }) => [
        s.mosaico,
        { backgroundColor: verde ? marca.verde : tinta ? (oscuro ? '#1E2120' : marca.tinta) : c.surface, minHeight: sinConexion ? 132 : 140 },
        tinta && oscuro && { borderWidth: 1, borderColor: 'rgba(243,245,242,0.06)' },
        pressed && { opacity: 0.9 },
      ]}
    >
      {!sinConexion && <View style={[s.anilloMini, { borderColor: verde ? 'rgba(18,20,19,0.12)' : 'rgba(243,245,242,0.08)' }]} />}
      <View style={s.fila6}>
        <Icon name={info.icono} size={14} color={verde ? marca.tinta : tenue} />
        <T mayus color={verde ? marca.tinta : tenue}>
          {info.corta}
        </T>
      </View>
      <T peso={800} size={42} lh={46} num color={sinConexion ? c.textMuted : verde ? marca.tinta : undefined} style={{ letterSpacing: -1.8 }}>
        {num(lectura?.valor, info.decimales)}
        <T peso={800} size={variable === 'AIRE' ? 16 : 18} color={verde ? marca.tinta : tenue}>
          {variable === 'AIRE' ? ` ${UNIDAD[variable]}` : UNIDAD[variable]}
        </T>
      </T>
      <View style={{ marginTop: 'auto' }}>
        {sinConexion ? (
          <View style={s.fila6}>
            <Icon name="wifi-off" size={14} color={c.offline} />
            <T peso={600} size={12} color={c.offline}>
              {haceCuanto(desde).replace(/^hace/, 'Hace')}
            </T>
          </View>
        ) : (
          <Sparkline data={serie} width={128} height={36} color={verde ? marca.tinta : marca.verde} />
        )}
      </View>
    </Pressable>
  )
  if (tinta) return <TemaFijo tema="dark">{contenido}</TemaFijo>
  if (verde) return <TemaFijo tema="light">{contenido}</TemaFijo>
  return contenido
}

// Barras de temperatura: últimas 24 h (por hora) o últimos 7 días (por día). Sin datos recientes,
// las 24 h que terminan en la última lectura guardada (ultima), como en la web.
function BarrasTemp({ serie, ultima, dispositivo, onPress }) {
  const { c } = useTema()
  const [rango, setRango] = useState('24h')
  const semana = useDatos(
    () => (rango === '7d' ? lecturasApi.serie(dispositivo, 'TEMP', { intervalo: 'dia', desde: new Date(Date.now() - 7 * 864e5).toISOString() }) : Promise.resolve(null)),
    [rango, dispositivo],
  )
  // Solo promedios numéricos: un NaN deja la barra sin altura (o cierra la app en Android).
  const puntos = (rango === '7d' ? (semana.datos ?? []) : serie).filter((p) => Number.isFinite(Number(p?.promedio)))
  const valores = puntos.map((p) => Number(p.promedio))
  // Con pocos puntos las barras no se estiran a todo el ancho (un bloque claro enorme): se dejan
  // huecos tenues a la izquierda hasta completar las 24 horas o los 7 días.
  const ranuras = rango === '7d' ? 7 : 24
  const huecos = Math.max(0, ranuras - valores.length)
  const pocos = valores.length < 2
  const mn = valores.length ? Math.min(...valores) : 0
  const mx = valores.length ? Math.max(...valores) : 1
  // «hasta ayer» u «hasta el 21 nov», igual que el eje (que ya dice «Ayer 17:00»)
  const hasta = !ultima ? '' : esHoy(ultima) ? ' hasta hoy' : esAyer(ultima) ? ' hasta ayer' : ` hasta el ${fechaCorta(ultima)}`
  const titulo = rango === '7d' ? 'Temperatura · 7 días' : `Temperatura · 24 h${hasta}`
  return (
    <View style={[s.tarjeta, { backgroundColor: c.surface, gap: 10 }]}>
      <View style={s.entre}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${titulo}: ver detalle`} style={[s.fila6, { flexShrink: 1 }]}>
          <T peso={700} size={15} numberOfLines={1} style={{ flexShrink: 1 }}>
            {titulo}
          </T>
          <Icon name="chevron-right" size={16} color={c.textSecondary} />
        </Pressable>
        <Tabs
          items={[
            { id: '24h', label: '24 h' },
            { id: '7d', label: '7 días' },
          ]}
          value={rango}
          onChange={setRango}
          compacto
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: rango === '7d' ? 8 : 3, height: 52 }}>
        {rango === '7d' && !semana.datos ? (
          <Skeleton height={52} style={{ borderRadius: 8 }} />
        ) : pocos ? (
          <View style={[s.vacioGrafica, { borderColor: c.border }]}>
            <Icon name="chart-line" size={16} color={c.textMuted} />
            <T size={12} color={c.textSecondary} style={{ flexShrink: 1 }}>
              {valores.length
                ? `Solo una lectura (${num(valores[0], 1)} °C): aún no hay tendencia.`
                : 'Sin lecturas en este periodo.'}
            </T>
          </View>
        ) : (
          <>
            {Array.from({ length: huecos }, (_, i) => (
              <View key={`h${i}`} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.chartGrid }} />
            ))}
            {valores.map((v, i) => (
              <BarraCrece
                key={`${rango}-${i}`}
                indice={i}
                style={{
                  flex: 1, borderRadius: 4, backgroundColor: c.grafica,
                  height: Math.round(8 + ((v - mn) / (mx - mn || 1)) * 44),
                  // Rampa por posición relativa: igual con 3 barras que con 24; la última, opaca.
                  opacity: i === valores.length - 1 ? 1 : 0.2 + 0.55 * (i / (valores.length - 1)),
                }}
              />
            ))}
          </>
        )}
      </View>
      {!pocos && (
        <View style={s.entre}>
          <T size={11} color={c.textMuted}>{rango === '7d' ? diaRelativo(puntos[0].periodo) : cuando(puntos[0].periodo)}</T>
          <T size={11} num color={c.textMuted}>{`Mín ${mn.toFixed(1)} · Máx ${mx.toFixed(1)} °C`}</T>
          {/* El extremo derecho es la última barra: su día real («Hoy», «Ayer» o la fecha), no siempre «Hoy». */}
          <T size={11} color={c.textMuted}>
            {rango === '7d' ? diaRelativo(puntos.at(-1).periodo) : cuando(puntos.at(-1).periodo)}
          </T>
        </View>
      )}
    </View>
  )
}

// Estado del equipo en una franja (arriba de humedad y aire): conexión, lectura y batería. Cada
// celda va en columna (ícono y etiqueta arriba, valor abajo) para que los valores no se corten.
function EstadoEquipo({ d }) {
  const { c } = useTema()
  const est = ESTADO_DISPOSITIVO[d.estado_dispositivo]
  const vivo = enLinea(d)
  const baja = d.nivel_bateria != null && d.nivel_bateria < 20
  const celdas = [
    { k: 'Estado', v: est?.label ?? d.estado_dispositivo, icono: vivo ? 'signal' : 'wifi-off', color: vivo ? c.success : c.offline },
    {
      k: 'Lectura',
      v: vivo ? `cada ${d.intervalo_muestreo_seg} s` : haceCuanto(d.ultima_conexion).replace(/^hace/, 'Hace'),
      icono: 'clock',
      color: c.textMuted,
    },
    { k: 'Batería', v: d.nivel_bateria == null ? '—' : `${d.nivel_bateria} %`, icono: baja ? 'battery-low' : 'battery-full', color: baja ? c.danger : c.textMuted },
  ]
  return (
    <View style={[s.tarjeta, s.equipo, { backgroundColor: c.surface }]}>
      {celdas.map((x, i) => (
        <View key={x.k} style={[s.celda, i > 0 && { borderLeftWidth: 1, borderLeftColor: c.border, paddingLeft: 12 }]}>
          <View style={s.fila6}>
            <Icon name={x.icono} size={13} color={x.color} />
            <T size={11} color={c.textMuted}>
              {x.k}
            </T>
          </View>
          <T peso={700} size={14} numberOfLines={1} color={x.k === 'Batería' && baja ? c.danger : undefined}>
            {x.v}
          </T>
        </View>
      ))}
    </View>
  )
}

// Panel: el dispositivo en vivo arriba; abajo la franja de estado (conexión, lectura, batería),
// humedad, aire y la temperatura de 24 h o 7 días. La campana abre el centro de avisos.
export function PanelScreen({ navigation }) {
  const { usuario } = useSesion()
  const { estado, datos: op, reintentar } = useOperador()
  const d = op?.dispositivo
  const series = useDatos(
    () => (d ? Promise.all(['TEMP', 'HUM', 'AIRE'].map((v) => lecturasApi.serieConDatos(d.num, v))) : new Promise(() => {})),
    [d?.num, d?.ultima_conexion],
  )
  const sinConexion = (USAR_MOCKS && ESTADO_FORZADO === 'sinConexion') || (d && !enLinea(d))
  const cargando = (estado === 'cargando' && !op) || (!!d && !sinConexion && series.estado === 'cargando' && !series.datos)
  const [sT, sH, sA] = series.datos ?? []
  const ver = (variable) => navigation.navigate('Variable', { variable })

  return (
    <Pantalla
      zona={<ZonaPanel usuario={usuario} op={op} estado={estado} sinConexion={sinConexion} onAvisos={() => navigation.navigate('Notificaciones')} />}
      recargando={false}
      onRecargar={reintentar}
      compacta
    >
      {estado === 'error' ? (
        <EstadoError onReintentar={reintentar} />
      ) : !cargando && !d ? (
        <EstadoVacio
          titulo="Sin dispositivos"
          mensaje={
            usuario.organizacion
              ? 'Tu cuenta aún no tiene dispositivos a la vista. Pide al administrador que te asigne uno o que registre los de tu área.'
              : 'La cuenta de plataforma administra las organizaciones desde la web; no tiene dispositivos propios.'
          }
        />
      ) : cargando ? (
        <>
          <Skeleton height={64} style={{ borderRadius: 28 }} />
          <View style={s.dos}>
            <Skeleton height={140} style={{ flex: 1, borderRadius: 28 }} />
            <Skeleton height={140} style={{ flex: 1, borderRadius: 28 }} />
          </View>
          <Skeleton height={64} style={{ borderRadius: 28 }} />
        </>
      ) : (
        <>
          <EstadoEquipo d={d} />
          <View style={s.dos}>
            <Mosaico variable="HUM" tipo="verde" lectura={lecturaDe(op, 'HUM')} serie={(sH?.puntos ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('HUM')} />
            <Mosaico variable="AIRE" tipo="tinta" lectura={lecturaDe(op, 'AIRE')} serie={(sA?.puntos ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('AIRE')} />
          </View>
          {series.datos && <BarrasTemp serie={sT?.puntos ?? []} ultima={sT?.ultima} dispositivo={d.num} onPress={() => ver('TEMP')} />}
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  gigante: { letterSpacing: -4.6, includeFontPadding: false },
  dos: { flexDirection: 'row', gap: 12 },
  mosaico: { flex: 1, gap: 4, padding: 16, borderRadius: 28, overflow: 'hidden' },
  anilloMini: { position: 'absolute', right: -70, top: -70, width: 160, height: 160, borderRadius: 80, borderWidth: 2 },
  tarjeta: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 28 },
  equipo: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  celda: { flex: 1, minWidth: 0, gap: 3 },
  vacioGrafica: {
    flex: 1, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
  },
})
