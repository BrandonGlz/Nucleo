import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Badge, Button, Chip, IconCircle, Input, Skeleton, T, Tabs } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import * as reportesApi from '../../services/reportes'
import { cuando, fechaLarga, hora, miles, periodo } from '../../utils/formato'
import { colors } from '../../theme'
import { ListaTableros } from './tableros/ListaTableros'

const ORIGEN = {
  MANUAL: { icono: 'user', texto: 'Manual' },
  PROGRAMADO: { icono: 'calendar-clock', texto: 'Programado' },
  AGENTE: { icono: 'sparkles', texto: 'Nico AI' },
  NICO: { icono: 'sparkles', texto: 'Nico AI' },
}
// Estado real de la generación en segundo plano.
const ESTADOS = {
  GENERANDO: { label: 'Generando…', tone: 'warning', icon: 'clock' },
  LISTO: { label: 'Listo', tone: 'success', icon: 'circle-check' },
  ENVIADO: { label: 'Enviado por correo', tone: 'success', icon: 'circle-check' },
  FALLO: { label: 'Falló', tone: 'danger', icon: 'triangle-alert' },
}
const estadoDe = (r) => ESTADOS[r.estado] ?? (r.origen === 'PROGRAMADO' ? ESTADOS.ENVIADO : ESTADOS.LISTO)
const lecturasDe = (r) => Object.values(r.cifras?.variables ?? {}).reduce((s, v) => s + (v?.muestras ?? 0), 0)
const PERIODOS = [
  ['todos', 'Todos'],
  ['mes', 'Este mes'],
  ['pasado', 'Mes pasado'],
  ['7d', 'Últimos 7 días'],
]
function rangoDe(id) {
  const hoy = new Date()
  const inicioMes = (f) => new Date(f.getFullYear(), f.getMonth(), 1)
  if (id === 'mes') return { desde: inicioMes(hoy).toISOString(), hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString() }
  if (id === 'pasado') return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toISOString(), hasta: inicioMes(hoy).toISOString() }
  if (id === '7d') return { desde: new Date(hoy.getTime() - 7 * 86400000).toISOString(), hasta: new Date(hoy.getTime() + 86400000).toISOString() }
  return {}
}

// Un reporte en una tarjeta (sin tablas): periodo, estado, origen, cifras clave, un extracto del
// texto de la IA y el PDF. `resaltar` marca el que abrió el aviso de la campana.
function TarjetaReporte({ r, resaltar, abriendo, onPdf, onEnvios }) {
  const { c } = useTema()
  const origen = ORIGEN[r.origen] ?? ORIGEN.MANUAL
  const alertas = r.cifras?.alertas?.total ?? 0
  const lecturas = lecturasDe(r)
  return (
    <View style={[s.tarjeta, { backgroundColor: c.surface }, resaltar && { borderWidth: 2, borderColor: c.accent }]}>
      <View style={s.fila}>
        <IconCircle name="file-text" size="sm" tone={resaltar ? 'success' : 'neutral'} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T peso={700} size={14} lh={19} numberOfLines={2}>
            {r.titulo || `Reporte R-${String(r.num).padStart(4, '0')}`}
          </T>
          <T size={12} color={c.textMuted}>
            {periodo(r.periodo_inicio, r.periodo_fin)} · {r.formato_nombre || 'Predeterminado'}
          </T>
        </View>
      </View>
      <View style={s.chips}>
        <Badge tone={estadoDe(r).tone} icon={estadoDe(r).icon}>
          {estadoDe(r).label}
        </Badge>
        <Badge tone={r.origen === 'AGENTE' ? 'accent' : 'neutral'} icon={origen.icono}>
          {origen.texto}
        </Badge>
      </View>
      <T size={12} lh={17} color={c.textSecondary}>
        {`Generado ${cuando(r.fecha_generacion, ', ')} · ${miles(lecturas)} lecturas · ${alertas} ${alertas === 1 ? 'alerta' : 'alertas'}`}
      </T>
      {r.contenido ? (
        <T size={13} lh={19} numberOfLines={3}>
          {r.contenido.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim()}
        </T>
      ) : null}
      {r.estado === 'FALLO' && r.error ? (
        <T size={12} lh={17} color={c.danger}>
          {r.error}
        </T>
      ) : null}
      <View style={s.acciones}>
        <Button
          variant={resaltar ? 'primary' : 'secondary'}
          size="sm"
          icon="download"
          disabled={abriendo || r.estado === 'GENERANDO' || r.estado === 'FALLO'}
          onPress={onPdf}
        >
          {abriendo ? 'Descargando…' : r.estado === 'GENERANDO' ? 'Generando…' : 'Abrir PDF'}
        </Button>
        <Button variant="ghost" size="sm" icon="send" onPress={onEnvios}>
          Envíos
        </Button>
      </View>
    </View>
  )
}

// Reportes (ADMIN, SUPER y ANALISTA, como en la web): los que la cuenta puede ver, con su estado y
// fecha, y el PDF de cada uno. Se generan y programan en la web o con Nico AI; aquí solo se consultan.
export function ReportesScreen({ navigation, route }) {
  const { c } = useTema()
  const resaltado = route?.params?.num ?? null
  const aviso = route?.params?.aviso ?? null
  // La pantalla tiene dos pestañas: los reportes de siempre y los tableros de Analítica.
  // Un aviso de reporte abre directamente «Reportes», aunque se hubiera quedado en «Tableros».
  const [pestana, setPestana] = useState('reportes')
  const [busquedaTableros, setBusquedaTableros] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- abrir desde un aviso de reporte cambia de pestaña
    if (resaltado || aviso) setPestana('reportes')
  }, [resaltado, aviso])
  const [periodo, setPeriodo] = useState('todos')
  const { estado, datos, reintentar } = useDatos(() => reportesApi.lista(rangoDe(periodo)), [periodo], { esVacio: (d) => !d.length })
  const [abriendo, setAbriendo] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [origen, setOrigen] = useState('')
  const [envios, setEnvios] = useState(null)
  const cambiarPestana = (id) => {
    setPestana(id)
    if (id !== 'reportes') setEnvios(null)
  }
  const filtrados = (datos ?? []).filter((r) => {
    const texto = busqueda.trim().toLowerCase()
    const coincide = !texto || `${r.titulo ?? ''} ${r.area_nombre}`.toLowerCase().includes(texto)
    return coincide && (!origen || r.origen === origen)
  })

  const abrir = (num) => {
    const reporte = (datos ?? []).find((r) => r.num === num)
    if (reporte?.estado === 'GENERANDO') {
      Alert.alert('Generando…', 'El reporte todavía se está generando. Inténtalo en unos segundos.')
      return
    }
    if (reporte?.estado === 'FALLO') {
      Alert.alert('No se pudo generar', reporte.error || 'Vuelve a pedirlo desde la web o a Nico AI.')
      return
    }
    setAbriendo(num)
    reportesApi
      .abrirPdf(num)
      .catch((e) => Alert.alert('No se pudo abrir el PDF', e?.message || 'Revisa tu conexión e inténtalo de nuevo.'))
      .finally(() => setAbriendo(null))
  }

  const zona = (
    <>
      <Cabecera titulo="Reportes" onVolver={() => navigation.goBack()} />
      <T size={13} lh={19} color={colors.dark.textSecondary}>
        {pestana === 'reportes'
          ? datos?.length
            ? `${datos.length} ${datos.length === 1 ? 'reporte' : 'reportes'} a tu alcance. Se piden y programan en la web o con Nico AI.`
            : 'Los reportes de tu organización o de tu área. Se piden y programan en la web o con Nico AI.'
          : 'Los tableros de tu organización y las plantillas del sistema, con datos en vivo.'}
      </T>
      <Tabs
        items={[
          { id: 'reportes', label: 'Reportes' },
          { id: 'tableros', label: 'Tableros' },
        ]}
        value={pestana}
        onChange={cambiarPestana}
        lleno
      />
      {pestana === 'reportes' ? (
        <>
          <Input
            icon="search"
            placeholder="Buscar reporte…"
            value={busqueda}
            onChangeText={setBusqueda}
            autoCapitalize="none"
          />
          <View style={s.filtros}>
            {[
              ['', 'Todos'],
              ['MANUAL', 'Manual'],
              ['PROGRAMADO', 'Programado'],
              ['AGENTE', 'Nico AI'],
            ].map(([valor, etiqueta]) => (
              <Chip key={valor || 'todos'} selected={origen === valor} onPress={() => setOrigen(valor)}>
                {etiqueta}
              </Chip>
            ))}
          </View>
          <View style={s.filtros}>
            {PERIODOS.map(([valor, etiqueta]) => (
              <Chip key={valor} selected={periodo === valor} onPress={() => setPeriodo(valor)}>
                {etiqueta}
              </Chip>
            ))}
          </View>
        </>
      ) : (
        <Input
          icon="search"
          placeholder="Buscar tablero…"
          value={busquedaTableros}
          onChangeText={setBusquedaTableros}
          autoCapitalize="none"
        />
      )}
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta onRecargar={pestana === 'reportes' ? reintentar : undefined}>
      {pestana === 'tableros' ? (
        <ListaTableros
          busqueda={busquedaTableros}
          onAbrir={(tablero) => navigation.navigate('TableroAnalitica', { tablero })}
        />
      ) : (
        <>
          {estado === 'error' ? (
            <EstadoError onReintentar={reintentar} />
          ) : estado === 'vacio' ? (
            <EstadoVacio icono="file-text" titulo="Sin reportes" mensaje="Aún no hay reportes a tu alcance. Pídelos desde la web o a Nico AI." />
          ) : !datos ? (
            [0, 1, 2].map((i) => <Skeleton key={i} height={180} style={{ borderRadius: 22 }} />)
          ) : (
            filtrados.length === 0 ? (
              <T size={13} color={c.textMuted}>No hay reportes con ese filtro.</T>
            ) : filtrados.map((r, i) => (
              <Aparece key={r.num} indice={i}>
                <TarjetaReporte r={r} resaltar={r.num === resaltado} abriendo={abriendo === r.num} onPdf={() => abrir(r.num)} onEnvios={() => setEnvios(r)} />
              </Aparece>
            ))
          )}
          {resaltado && datos && !datos.some((r) => r.num === resaltado) ? (
            <T size={12} color={c.textMuted} style={{ textAlign: 'center' }}>
              {`El reporte ${resaltado} ya no está a tu alcance.`}
            </T>
          ) : null}
          <HojaEnvios reporte={envios} onCerrar={() => setEnvios(null)} />
        </>
      )}
    </Pantalla>
  )
}

function HojaEnvios({ reporte, onCerrar }) {
  const { c } = useTema()
  const envios = reporte?.envios ?? []
  return (
    <Modal visible={!!reporte} transparent animationType="slide" statusBarTranslucent onRequestClose={onCerrar}>
      <Pressable style={s.fondo} onPress={onCerrar} accessibilityLabel="Cerrar envíos" />
      <View style={[s.hoja, { backgroundColor: c.background }]}>
        <View style={[s.asa, { backgroundColor: c.border }]} />
        <T peso={700} size={18} style={{ paddingHorizontal: 20 }}>Historial de envíos</T>
        <T size={12} color={c.textMuted} style={{ paddingHorizontal: 20 }} numberOfLines={2}>{reporte?.titulo ?? ''}</T>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {envios.length === 0 ? (
            <T size={13} color={c.textMuted}>Este reporte no se ha enviado por correo</T>
          ) : envios.map((e) => (
            <View key={e.num} style={[s.envio, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={s.fila}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T peso={700} size={13}>{`${fechaLarga(e.fecha)} · ${hora(e.fecha)}`}</T>
                  <T size={11} color={c.textMuted}>{`${ORIGEN[e.origen]?.texto ?? e.origen}${e.enviado_por_nombre ? ` · ${e.enviado_por_nombre}` : ''}`}</T>
                </View>
                <Badge tone={e.resultado === 'OK' ? 'success' : 'danger'} icon={e.resultado === 'OK' ? 'circle-check' : 'triangle-alert'}>
                  {e.resultado === 'OK' ? 'Enviado' : 'Falló'}
                </Badge>
              </View>
              <T size={12} color={c.textSecondary} numberOfLines={2}>
                {(e.destinatarios ?? []).map((d) => d.nombre).join(', ') || 'Sin destinatarios'}
              </T>
              {e.error ? <T size={11} color={c.danger}>{e.error}</T> : null}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  tarjeta: { gap: 10, padding: 16, borderRadius: 22 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', paddingTop: 10, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 8 },
  asa: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  envio: { gap: 6, padding: 12, borderRadius: 16, borderWidth: 1 },
})
