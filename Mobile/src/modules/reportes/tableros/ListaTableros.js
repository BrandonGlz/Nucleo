import { Pressable, StyleSheet, View } from 'react-native'
import { EstadoError, EstadoVacio } from '../../../components/EstadoError'
import { Aparece, Card, Icon, IconCircle, Skeleton, T } from '../../../components/ui'
import { useTema } from '../../../context/TemaContext'
import { useDatos } from '../../../hooks/useDatos'
import * as analiticaApi from '../../../services/analitica'

// Un tablero en una tarjeta, con el mismo estilo que las tarjetas de reporte. El predeterminado
// lleva la estrella y va primero dentro de los de la organización.
function TarjetaTablero({ tablero, indice, onAbrir }) {
  const { c } = useTema()
  return (
    <Aparece indice={indice}>
      <Pressable
        onPress={() => onAbrir(tablero)}
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${tablero.nombre}`}
        style={({ pressed }) => pressed && { transform: [{ scale: 0.99 }], opacity: 0.9 }}
      >
        <Card padding="sm" style={{ borderRadius: 22, gap: 8 }}>
          <View style={s.fila}>
            <IconCircle name="layout-dashboard" size="sm" tone={tablero.predeterminado ? 'success' : 'neutral'} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={s.titulo}>
                <T peso={700} size={14} lh={19} numberOfLines={2} style={{ flexShrink: 1 }}>
                  {tablero.nombre}
                </T>
                {tablero.predeterminado ? (
                  <T peso={700} size={16} color={c.warning} accessibilityLabel="Predeterminado">
                    ★
                  </T>
                ) : null}
              </View>
              {tablero.descripcion ? (
                <T size={12} color={c.textMuted} numberOfLines={1}>
                  {tablero.descripcion}
                </T>
              ) : null}
            </View>
            <Icon name="chevron-right" size={18} color={c.textMuted} />
          </View>
          <View style={s.pie}>
            <T size={11} color={c.textMuted}>
              {`${tablero.conf?.paginas?.length || 1} ${(tablero.conf?.paginas?.length || 1) === 1 ? 'página' : 'páginas'}`}
            </T>
            <T size={11} color={c.textMuted} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
              {tablero.es_plantilla ? 'Plantilla del sistema' : `Versión ${tablero.version || 1}`}
            </T>
          </View>
        </Card>
      </Pressable>
    </Aparece>
  )
}

// Misma tarjeta que el tablero real: ícono, nombre, descripción y pie de páginas y versión.
function EsqueletoTablero() {
  return (
    <Card padding="sm" style={{ borderRadius: 22, gap: 8 }} accessibilityLabel="Cargando tablero">
      <View style={s.fila}>
        <Skeleton width={32} height={32} round />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Skeleton width="68%" height={14} />
          <Skeleton width="48%" height={11} />
        </View>
        <Skeleton width={18} height={18} round />
      </View>
      <View style={[s.pie, { justifyContent: 'space-between' }]}>
        <Skeleton width={52} height={10} />
        <Skeleton width={74} height={10} />
      </View>
    </Card>
  )
}

// Pestaña «Tableros» de Reportes: los de la organización primero y luego las plantillas.
export function ListaTableros({ busqueda = '', onAbrir }) {
  const { c } = useTema()
  const { estado, datos, reintentar } = useDatos(() => analiticaApi.tableros(), [])
  const texto = busqueda.trim().toLowerCase()
  const coincide = (t) => !texto || `${t.nombre ?? ''} ${t.descripcion ?? ''}`.toLowerCase().includes(texto)
  const lista = (datos ?? []).filter(coincide)
  const organizacion = lista
    .filter((t) => !t.es_plantilla)
    .sort((a, b) => Number(b.predeterminado) - Number(a.predeterminado) || a.nombre.localeCompare(b.nombre))
  const plantillas = lista.filter((t) => t.es_plantilla).sort((a, b) => a.nombre.localeCompare(b.nombre))

  if (estado === 'error') return <EstadoError mensaje="Revisa tu conexión a internet e inténtalo de nuevo." onReintentar={reintentar} />
  if (!datos) {
    return [0, 1, 2, 3].map((i) => <EsqueletoTablero key={i} />)
  }
  if (!datos.length) {
    return <EstadoVacio icono="layout-dashboard" titulo="Sin tableros" mensaje="No hay tableros disponibles para tu organización." />
  }
  if (!lista.length) {
    return <T size={13} color={c.textMuted}>No hay tableros con esa búsqueda.</T>
  }
  let indice = 0
  return (
    <>
      {organizacion.length ? (
        <>
          <T mayus color={c.textMuted} style={{ paddingHorizontal: 4 }}>De la organización</T>
          {organizacion.map((tablero) => (
            <TarjetaTablero key={tablero.num} tablero={tablero} indice={indice++} onAbrir={onAbrir} />
          ))}
        </>
      ) : null}
      {plantillas.length ? (
        <>
          <T mayus color={c.textMuted} style={{ paddingHorizontal: 4, marginTop: 8 }}>Plantillas</T>
          {plantillas.map((tablero) => (
            <TarjetaTablero key={tablero.num} tablero={tablero} indice={indice++} onAbrir={onAbrir} />
          ))}
        </>
      ) : null}
    </>
  )
}

const s = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44 },
})
