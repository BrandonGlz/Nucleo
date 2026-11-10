import { Pressable, StyleSheet, View } from 'react-native'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { BarraRango } from '../../components/BarraRango'
import { Pantalla } from '../../components/Pantalla'
import { Avatar, Battery, Icon, IconButton, Skeleton, Sparkline, T } from '../../components/ui'
import { useSesion } from '../../context/SesionContext'
import { TemaFijo, useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import { lecturaDe, pendientesDe, umbralDe, useOperador } from '../../hooks/useOperador'
import { ESTADO_FORZADO } from '../../services/mock/handlers'
import { USAR_MOCKS } from '../../services/config'
import * as lecturasApi from '../../services/lecturas'
import { enLinea, escala, nivelLectura, posicion, UNIDAD, VARIABLE } from '../../utils/convertir'
import { haceCuanto, hora, hoyTexto, num } from '../../utils/formato'
import { colors, marca } from '../../theme'

const TONO_ZONA = { normal: marca.verde, warning: colors.dark.warning, critical: colors.dark.danger }
const TEXTO_NIVEL = { normal: 'En rango', warning: 'Cerca del límite', critical: 'Fuera de rango' }

function Pastilla({ punto, icono, children }) {
  return (
    <View style={s.pastilla}>
      {icono ? <Icon name={icono} size={14} color={marca.claro} /> : <View style={[s.punto, { backgroundColor: punto, shadowColor: punto }]} />}
      <T peso={600} size={12} numberOfLines={1} style={{ flexShrink: 1 }}>
        {children}
      </T>
    </View>
  )
}

// Pastilla del dispositivo con su batería a la derecha: todo el estado del equipo en una línea.
function FilaEquipo({ punto, icono, children, bateria }) {
  return (
    <View style={s.entre}>
      <View style={{ flexShrink: 1 }}>
        <Pastilla punto={punto} icono={icono}>
          {children}
        </Pastilla>
      </View>
      {bateria != null && (
        <View style={[s.pastilla, { paddingLeft: 12 }]} accessibilityLabel={`Batería al ${bateria} %`}>
          <Battery level={bateria} />
        </View>
      )}
    </View>
  )
}

function ZonaPanel({ usuario, op, estado, sinConexion, onAlertas }) {
  const { c } = useTema()
  const d = op?.dispositivo
  const l = lecturaDe(op, 'TEMP')
  const u = umbralDe(op, 'TEMP')
  const pendientes = pendientesDe(op).length
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
      {usuario.organizacion ? (
        <IconButton icon="bell" label="Alertas" badge={pendientes || undefined} size="lg" inverse onPress={onAlertas} />
      ) : null}
    </View>
  )
  if (estado === 'cargando' || estado === 'error' || !d) {
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
          Tu dispositivo sigue alertando con LED y buzzer aunque no llegue a la plataforma.
        </T>
      </>
    )
  }
  const [min, max] = escala(u, 'TEMP')
  const nivel = nivelLectura(l?.valor, u)
  const color = TONO_ZONA[nivel]
  return (
    <>
      {cabeza}
      <FilaEquipo punto={marca.verde} bateria={d.nivel_bateria}>
        {`${d.nombre} · ${op.area?.nombre ?? 'en línea'} · cada ${d.intervalo_muestreo_seg} s`}
      </FilaEquipo>
      <View>
        <T mayus color={c.textMuted}>
          Temperatura · en vivo
        </T>
        <T peso={800} size={88} lh={90} num style={s.gigante}>
          {num(l?.valor)}
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

function Barras24({ serie, onPress }) {
  const { c } = useTema()
  const valores = serie.map((p) => Number(p.promedio))
  const mn = Math.min(...valores)
  const mx = Math.max(...valores)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[s.tarjeta, { backgroundColor: c.surface, gap: 10 }]}>
      <View style={s.entre}>
        <T peso={700} size={15}>
          Temperatura · últimas 24 h
        </T>
        <View style={s.fila6}>
          <T peso={600} size={13} color={c.textSecondary}>
            Ver
          </T>
          <Icon name="chevron-right" size={16} color={c.textSecondary} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 48 }}>
        {valores.map((v, i) => (
          <View
            key={i}
            style={{
              flex: 1, borderRadius: 4, backgroundColor: c.textPrimary,
              height: Math.round(8 + ((v - mn) / (mx - mn || 1)) * 40),
              opacity: i === valores.length - 1 ? 1 : 0.12 + i * 0.025,
            }}
          />
        ))}
      </View>
      <View style={s.entre}>
        <T size={11} color={c.textMuted}>{`Ayer ${hora(serie[0].periodo)}`}</T>
        <T size={11} num color={c.textMuted}>{`Mín ${mn.toFixed(1)} · Máx ${mx.toFixed(1)} °C`}</T>
        <T size={11} color={c.textMuted}>
          Ahora
        </T>
      </View>
    </Pressable>
  )
}

// Inicio del operador: su dispositivo en vivo (con batería arriba), humedad, aire y la temperatura
// de las últimas 24 h; todo cabe en la pantalla sin hacer scroll.
export function PanelScreen({ navigation }) {
  const { usuario } = useSesion()
  const { estado, datos: op, reintentar } = useOperador()
  const d = op?.dispositivo
  const series = useDatos(
    () => (d ? Promise.all(['TEMP', 'HUM', 'AIRE'].map((v) => lecturasApi.serie(d.num, v))) : new Promise(() => {})),
    [d?.num, d?.ultima_conexion],
  )
  const sinConexion = (USAR_MOCKS && ESTADO_FORZADO === 'sinConexion') || (d && !enLinea(d))
  const cargando = estado === 'cargando' || (!!d && !sinConexion && series.estado === 'cargando' && !series.datos)
  const [sT, sH, sA] = series.datos ?? []
  const ver = (variable) => navigation.navigate('Variable', { variable })

  return (
    <Pantalla
      zona={<ZonaPanel usuario={usuario} op={op} estado={estado} sinConexion={sinConexion} onAlertas={() => navigation.navigate('Alertas')} />}
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
            <Mosaico variable="HUM" tipo="verde" lectura={lecturaDe(op, 'HUM')} serie={(sH ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('HUM')} />
            <Mosaico variable="AIRE" tipo="tinta" lectura={lecturaDe(op, 'AIRE')} serie={(sA ?? []).slice(-6).map((p) => Number(p.promedio))} sinConexion={sinConexion} desde={d.ultima_conexion} onPress={() => ver('AIRE')} />
          </View>
          {!sinConexion && sT && <Barras24 serie={sT} onPress={() => ver('TEMP')} />}
        </>
      )}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  fila12: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fila6: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pastilla: { alignSelf: 'flex-start', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: 'rgba(243,245,242,0.08)' },
  punto: { width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  gigante: { letterSpacing: -4.6, includeFontPadding: false },
  dos: { flexDirection: 'row', gap: 12 },
  mosaico: { flex: 1, gap: 4, padding: 16, borderRadius: 28, overflow: 'hidden' },
  anilloMini: { position: 'absolute', right: -70, top: -70, width: 160, height: 160, borderRadius: 80, borderWidth: 2 },
  tarjeta: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 28 },
})
