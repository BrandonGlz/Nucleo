import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { BarraRango } from '../../components/BarraRango'
import { SelectorDispositivo } from '../../components/SelectorDispositivo'
import { BarraCrece, PuntoVivo, useCuenta } from '../../components/Movimiento'
import { Pantalla } from '../../components/Pantalla'
import { Avatar, Battery, Icon, IconButton, IconCircle, Skeleton, Sparkline, T, Tabs } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useAvisos } from '../../hooks/useAvisos'
import { useDatos } from '../../hooks/useDatos'
import { lecturaDe, umbralDe, useOperador } from '../../hooks/useOperador'
import { ESTADO_FORZADO } from '../../services/mock/handlers'
import { USAR_MOCKS } from '../../services/config'
import * as lecturasApi from '../../services/lecturas'
import { enLinea, ESTADO_ALERTA, ESTADO_DISPOSITIVO, escala, NIVEL_ALERTA, nivelLectura, posicion, tituloAlerta, UNIDAD, valorAlerta, VARIABLE } from '../../utils/convertir'
import { cuando, diaCorto, fechaCorta, haceCuanto, hora, hoyTexto, num } from '../../utils/formato'
import { colors, marca } from '../../theme'

const TONO_ZONA = { normal: marca.verde, warning: colors.dark.warning, critical: colors.dark.danger }
const TEXTO_NIVEL = { normal: 'En rango', warning: 'Cerca del límite', critical: 'Fuera de rango' }

function Pastilla({ punto, icono, children, onPress }) {
  const contenido = (
    <>
      {icono ? <Icon name={icono} size={14} color={marca.claro} /> : <PuntoVivo color={punto} />}
      <T peso={600} size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
        {children}
      </T>
      {onPress && <Icon name="chevron-down" size={16} color={marca.claro} />}
    </>
  )
  if (!onPress) return <View style={s.pastilla}>{contenido}</View>
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${children}. Cambiar de dispositivo`}
      style={({ pressed }) => [s.pastilla, s.pastillaBoton, pressed && { opacity: 0.8 }]}
    >
      {contenido}
    </Pressable>
  )
}

// Pastilla del dispositivo con su batería a la derecha: todo el estado del equipo en una línea.
// Con varios dispositivos (administrador, supervisor, analista) la pastilla abre el selector.
function FilaEquipo({ punto, icono, children, bateria }) {
  const { datos: op, elegir } = useOperador()
  const varios = (op?.dispositivos?.length ?? 0) > 1
  return (
    <View style={s.entre}>
      <View style={{ flexShrink: 1 }}>
        {varios ? (
          <SelectorDispositivo dispositivos={op.dispositivos} valor={op.dispositivo?.num} onElegir={elegir}>
            {(abrir) => (
              <Pastilla punto={punto} icono={icono} onPress={abrir}>
                {children}
              </Pastilla>
            )}
          </SelectorDispositivo>
        ) : (
          <Pastilla punto={punto} icono={icono}>
            {children}
          </Pastilla>
        )}
      </View>
      {bateria != null && (
        <View style={[s.pastilla, { paddingLeft: 12 }]} accessibilityLabel={`Batería al ${bateria} %`}>
          <Battery level={bateria} />
        </View>
      )}
    </View>
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
      <Avatar name={`${usuario.nombre} ${usuario.primer_apellido}`} size={40} />
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
        <Pastilla punto={c.textMuted}>{estado === 'error' ? 'Sin datos' : estado === 'cargando' ? 'Conectando…' : 'Sin dispositivo'}</Pastilla>
        <View>
          <T mayus color={c.textMuted}>
            Temperatura
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
        <FilaEquipo icono="wifi-off" bateria={d.nivel_bateria}>
          {`${d.nombre} · sin conexión`}
        </FilaEquipo>
        <View>
          <T mayus color={c.textMuted}>
            Última lectura · {haceCuanto(d.ultima_conexion)}
          </T>
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
      {/* Recién encendido, el sensor de aire se estabiliza unos 20 min: se muestra «Calentando». */}
      <FilaEquipo punto={calentando ? colors.dark.warning : marca.verde} bateria={d.nivel_bateria}>
        {calentando
          ? `${d.nombre} · calentando · cada ${d.intervalo_muestreo_seg} s`
          : `${d.nombre} · ${op.area?.nombre ?? 'en línea'} · cada ${d.intervalo_muestreo_seg} s`}
      </FilaEquipo>
      <View>
        <T mayus color={c.textMuted}>
          Temperatura · en vivo
        </T>
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
  const puntos = rango === '7d' ? (semana.datos ?? []) : serie
  const valores = puntos.map((p) => Number(p.promedio))
  const mn = valores.length ? Math.min(...valores) : 0
  const mx = valores.length ? Math.max(...valores) : 1
  const titulo = rango === '7d' ? 'Temperatura · 7 días' : ultima ? `Temperatura · 24 h hasta el ${fechaCorta(ultima)}` : 'Temperatura · 24 h'
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
        {rango === '7d' && !semana.datos
          ? <Skeleton height={52} style={{ borderRadius: 8 }} />
          : valores.map((v, i) => (
              <BarraCrece
                key={`${rango}-${i}`}
                indice={i}
                style={{
                  flex: 1, borderRadius: 4, backgroundColor: c.grafica,
                  height: Math.round(8 + ((v - mn) / (mx - mn || 1)) * 44),
                  opacity: i === valores.length - 1 ? 1 : Math.min(0.85, 0.12 + i * (rango === '7d' ? 0.12 : 0.025)),
                }}
              />
            ))}
      </View>
      {valores.length > 0 && (
        <View style={s.entre}>
          <T size={11} color={c.textMuted}>{rango === '7d' ? fechaCorta(puntos[0].periodo) : cuando(puntos[0].periodo)}</T>
          <T size={11} num color={c.textMuted}>{`Mín ${mn.toFixed(1)} · Máx ${mx.toFixed(1)} °C`}</T>
          <T size={11} color={c.textMuted}>
            {rango === '7d' ? 'Hoy' : ultima ? hora(puntos.at(-1).periodo) : 'Ahora'}
          </T>
        </View>
      )}
    </View>
  )
}

// Estado del equipo en una fila: conexión, última lectura y batería.
function EstadoEquipo({ d }) {
  const { c } = useTema()
  const est = ESTADO_DISPOSITIVO[d.estado_dispositivo]
  const celdas = [
    { k: 'Estado', v: est?.label ?? d.estado_dispositivo, icono: enLinea(d) ? 'signal' : 'wifi-off', tono: enLinea(d) ? 'success' : 'offline' },
    { k: 'Lectura', v: haceCuanto(d.ultima_conexion).replace(/^hace /, ''), icono: 'clock', tono: 'neutral' },
    { k: 'Batería', v: d.nivel_bateria == null ? '—' : `${d.nivel_bateria} %`, icono: d.nivel_bateria != null && d.nivel_bateria < 20 ? 'battery-low' : 'battery-full', tono: d.nivel_bateria != null && d.nivel_bateria < 20 ? 'danger' : 'neutral' },
  ]
  return (
    <View style={[s.tarjeta, s.equipo, { backgroundColor: c.surface }]}>
      {celdas.map((x) => (
        <View key={x.k} style={s.celda}>
          <IconCircle name={x.icono} size="sm" tone={x.tono} />
          <View style={{ flexShrink: 1 }}>
            <T size={11} color={c.textMuted}>
              {x.k}
            </T>
            <T peso={700} size={13} numberOfLines={1}>
              {x.v}
            </T>
          </View>
        </View>
      ))}
    </View>
  )
}

// Las tres alertas más recientes; tocar una abre su detalle.
function AlertasRecientes({ alertas, onVer, onTodas }) {
  const { c } = useTema()
  const recientes = [...alertas].sort((x, y) => (x.fecha_hora < y.fecha_hora ? 1 : -1)).slice(0, 3)
  return (
    <View style={[s.tarjeta, { backgroundColor: c.surface, gap: 12 }]}>
      <View style={s.entre}>
        <T peso={700} size={15}>
          Alertas recientes
        </T>
        <Pressable onPress={onTodas} hitSlop={8} accessibilityRole="button">
          <T peso={600} size={13} color={c.success}>
            Ver todas
          </T>
        </Pressable>
      </View>
      {recientes.length === 0 ? (
        <View style={s.fila12}>
          <IconCircle name="circle-check" size="sm" tone="success" />
          <T size={13} color={c.textSecondary} style={{ flex: 1 }}>
            Sin alertas. Todo en rango.
          </T>
        </View>
      ) : (
        recientes.map((a) => (
          <Pressable key={a.num} onPress={() => onVer(a.num)} accessibilityRole="button" style={({ pressed }) => [s.fila12, pressed && { opacity: 0.7 }]}>
            <IconCircle name={a.nivel === 'PELIGRO' ? 'octagon-alert' : 'triangle-alert'} size="sm" tone={NIVEL_ALERTA[a.nivel].tone} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T peso={600} size={13} numberOfLines={1}>
                {tituloAlerta(a)}
              </T>
              <T size={12} color={c.textMuted} numberOfLines={1}>
                {`${valorAlerta(a)} · ${ESTADO_ALERTA[a.estado].label}`}
              </T>
            </View>
            <T size={11} num color={c.textMuted}>
              {diaCorto(a.fecha_hora)}
            </T>
          </Pressable>
        ))
      )}
    </View>
  )
}

// Panel: el dispositivo en vivo (con batería arriba), humedad, aire, el estado del equipo, la
// temperatura de 24 h o 7 días y las alertas recientes. La campana abre el centro de avisos.
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
          <View style={s.dos}>
            <Skeleton height={140} style={{ flex: 1, borderRadius: 28 }} />
            <Skeleton height={140} style={{ flex: 1, borderRadius: 28 }} />
          </View>
          <Skeleton height={120} style={{ borderRadius: 28 }} />
        </>
      ) : (
        <>
          <View style={s.dos}>
            <Mosaico variable="HUM" tipo="verde" lectura={lecturaDe(op, 'HUM')} serie={(sH?.puntos ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('HUM')} />
            <Mosaico variable="AIRE" tipo="tinta" lectura={lecturaDe(op, 'AIRE')} serie={(sA?.puntos ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('AIRE')} />
          </View>
          <EstadoEquipo d={d} />
          {sT?.puntos?.length > 1 && <BarrasTemp serie={sT.puntos} ultima={sT.ultima} dispositivo={d.num} onPress={() => ver('TEMP')} />}
          <AlertasRecientes
            alertas={(op?.alertas ?? []).filter((a) => a.dispositivo === d.num)}
            onVer={(n) => navigation.navigate('DetalleAlerta', { num: n })}
            onTodas={() => navigation.navigate('Alertas')}
          />
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pastillaBoton: { borderWidth: 1, borderColor: 'rgba(243,245,242,0.16)' },
  pastilla: { alignSelf: 'flex-start', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: 'rgba(243,245,242,0.08)' },
  punto: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  gigante: { letterSpacing: -4.6, includeFontPadding: false },
  dos: { flexDirection: 'row', gap: 12 },
  mosaico: { flex: 1, gap: 4, padding: 16, borderRadius: 28, overflow: 'hidden' },
  anilloMini: { position: 'absolute', right: -70, top: -70, width: 160, height: 160, borderRadius: 80, borderWidth: 2 },
  tarjeta: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 28 },
  equipo: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14 },
  celda: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
})
