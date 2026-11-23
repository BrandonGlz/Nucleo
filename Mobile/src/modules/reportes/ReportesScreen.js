import { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { Cabecera } from '../../components/Cabecera'
import { EstadoError, EstadoVacio } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { Aparece, Badge, Button, IconCircle, Skeleton, T } from '../../components/ui'
import { useTema } from '../../context/TemaContext'
import { useDatos } from '../../hooks/useDatos'
import * as reportesApi from '../../services/reportes'
import { cuando, miles, periodo } from '../../utils/formato'
import { colors } from '../../theme'

const ORIGEN = {
  MANUAL: { icono: 'user', texto: 'Manual' },
  PROGRAMADO: { icono: 'calendar-clock', texto: 'Programado' },
  AGENTE: { icono: 'sparkles', texto: 'Nico AI' },
}
// Estado como en la web: los programados se envían por correo; los demás quedan listos para descargar.
const estadoDe = (r) => (r.origen === 'PROGRAMADO' ? 'Enviado por correo' : 'Listo')
const lecturasDe = (r) => Object.values(r.cifras?.variables ?? {}).reduce((s, v) => s + (v?.muestras ?? 0), 0)

// Un reporte en una tarjeta (sin tablas): periodo, estado, origen, cifras clave, un extracto del
// texto de la IA y el PDF. `resaltar` marca el que abrió el aviso de la campana.
function TarjetaReporte({ r, resaltar, abriendo, onPdf }) {
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
            {`Reporte ${r.num} · ${r.area_nombre}`}
          </T>
          <T size={12} color={c.textMuted}>
            {periodo(r.periodo_inicio, r.periodo_fin)}
          </T>
        </View>
      </View>
      <View style={s.chips}>
        <Badge tone="success" icon="circle-check">
          {estadoDe(r)}
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
      <Button variant={resaltar ? 'primary' : 'secondary'} size="sm" icon="download" disabled={abriendo} onPress={onPdf}>
        {abriendo ? 'Descargando…' : 'Abrir PDF'}
      </Button>
    </View>
  )
}

// Reportes (ADMIN, SUPER y ANALISTA, como en la web): los que la cuenta puede ver, con su estado y
// fecha, y el PDF de cada uno. Se generan y programan en la web o con Nico AI; aquí solo se consultan.
export function ReportesScreen({ navigation, route }) {
  const { c } = useTema()
  const resaltado = route?.params?.num ?? null
  const { estado, datos, reintentar } = useDatos(() => reportesApi.lista(), [], { esVacio: (d) => !d.length })
  const [abriendo, setAbriendo] = useState(null)

  const abrir = (num) => {
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
        {datos?.length
          ? `${datos.length} ${datos.length === 1 ? 'reporte' : 'reportes'} a tu alcance. Se piden y programan en la web o con Nico AI.`
          : 'Los reportes de tu organización o de tu área. Se piden y programan en la web o con Nico AI.'}
      </T>
    </>
  )

  return (
    <Pantalla zona={zona} pestanas={false} compacta onRecargar={reintentar}>
      {estado === 'error' ? (
        <EstadoError onReintentar={reintentar} />
      ) : estado === 'vacio' ? (
        <EstadoVacio icono="file-text" titulo="Sin reportes" mensaje="Aún no hay reportes a tu alcance. Pídelos desde la web o a Nico AI." />
      ) : !datos ? (
        [0, 1, 2].map((i) => <Skeleton key={i} height={180} style={{ borderRadius: 22 }} />)
      ) : (
        datos.map((r, i) => (
          <Aparece key={r.num} indice={i}>
            <TarjetaReporte r={r} resaltar={r.num === resaltado} abriendo={abriendo === r.num} onPdf={() => abrir(r.num)} />
          </Aparece>
        ))
      )}
      {resaltado && datos && !datos.some((r) => r.num === resaltado) ? (
        <T size={12} color={c.textMuted} style={{ textAlign: 'center' }}>
          {`El reporte ${resaltado} ya no está a tu alcance.`}
        </T>
      ) : null}
    </Pantalla>
  )
}

const s = StyleSheet.create({
  tarjeta: { gap: 10, padding: 16, borderRadius: 22 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
