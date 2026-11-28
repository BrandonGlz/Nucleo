import { Pressable, StyleSheet, View } from 'react-native'
import { Button, Card, Icon, IconCircle, Skeleton, Sparkline, T } from '../../../components/ui'
import { useTema } from '../../../context/TemaContext'
import { fechaCorta } from '../../../utils/formato'
import { Dona, Dispersion, Histograma, Lineas, MapaCalor, MedidorAro } from './Graficas'
import {
  ICONOS_TIPO,
  INFO_VARIABLE,
  NOMBRES_TIPO,
  atenuado,
  colorSerie,
  colorTono,
  duracion,
  esSeleccion,
  formatear,
  semaforoDe,
  tonoDe,
  variacionKpi,
} from './datos'

// Punto + texto del semáforo: verde cumple, ámbar cerca y rojo fuera. Solo el punto lleva color.
function Meta({ meta, estado, sinPunto }) {
  const { c } = useTema()
  if (!meta?.texto) return null
  const tono = semaforoDe(estado)
  return (
    <View style={s.meta}>
      {sinPunto ? null : <View style={[s.puntoMeta, { backgroundColor: tono ? colorTono(c, tono) : c.textMuted }]} />}
      <T size={11} lh={15} color={c.textMuted} numberOfLines={1}>{meta.texto}</T>
    </View>
  )
}

function Variacion({ variacion }) {
  const { c } = useTema()
  const v = variacionKpi(variacion)
  if (!v) return null
  const tono = variacion?.mejora === true ? 'success' : variacion?.mejora === false ? 'danger' : null
  const flecha = v.valor > 0 ? '▲' : v.valor < 0 ? '▼' : '■'
  const signo = v.valor > 0 ? '+' : v.valor < 0 ? '−' : ''
  return (
    <T size={11} lh={15} color={tono ? colorTono(c, tono) : c.textMuted}>
      {`${flecha} ${signo}${formatear(Math.abs(v.valor), 1)} ${v.sufijo}`}
      <T size={10} color={c.textMuted}> vs anterior</T>
    </T>
  )
}

function SinDatos({ compacto }) {
  const { c } = useTema()
  return (
    <View style={[s.estado, compacto && { paddingVertical: 6 }]}>
      <Icon name="activity" size={16} color={c.textMuted} />
      <T size={12} color={c.textMuted}>Sin datos en el periodo</T>
    </View>
  )
}

function Cargando() {
  return (
    <View style={{ gap: 8 }}>
      <Skeleton height={22} width="55%" />
      <Skeleton height={12} width="80%" />
      <Skeleton height={52} />
    </View>
  )
}

function Kpi({ datos, compacto }) {
  const { c } = useTema()
  const puntos = (datos.sparkline || []).map((p) => Number(p.y ?? p.value ?? 0))
  return (
    <View style={{ gap: 3 }}>
      <View style={s.valorFila}>
        <T peso={800} size={compacto ? 27 : 30} lh={compacto ? 32 : 36} num>
          {formatear(datos.valor, datos.decimales)}
        </T>
        {datos.unidad ? <T peso={600} size={12} color={c.textMuted}>{datos.unidad}</T> : null}
      </View>
      <Variacion variacion={datos.variacion} />
      <Meta meta={datos.meta} estado={datos.meta_estado} />
      {puntos.length > 1 ? (
        <View style={{ marginTop: 2, alignItems: 'flex-start' }}>
          <Sparkline data={puntos} width={compacto ? 100 : 128} height={compacto ? 22 : 26} color={c.chartLine} />
        </View>
      ) : null}
    </View>
  )
}

// Barras siempre horizontales en la app (aunque la tarjeta se haya armado vertical en la web).
function Barras({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const filas = datos.barras || []
  // Un poco de aire sobre la meta deja su marca dentro de la pista (no pegada al borde).
  const max = Math.max(...filas.map((f) => Number(f.valor) || 0), Number(datos.meta?.valor) || 0, 1) * 1.06
  return (
    <View style={{ gap: 6 }}>
      {datos.meta?.texto ? <Meta meta={datos.meta} sinPunto /> : null}
      {filas.map((fila, i) => {
        const activo = esSeleccion(seleccion, fila.dimension, fila.dimension_valor)
        const clic = Boolean(alSeleccionar && fila.dimension && fila.dimension_valor != null)
        const unidad = fila.unidad ?? datos.unidad ?? ''
        const decimales = fila.decimales ?? datos.decimales ?? 1
        const contenido = (
          <>
            <View style={s.filaEntre}>
              <T size={12} lh={16} numberOfLines={1} peso={activo ? 700 : 500} style={{ flex: 1 }}>{fila.etiqueta}</T>
              <T size={12} lh={16} num peso={600}>{`${formatear(fila.valor, decimales)}${unidad ? ` ${unidad}` : ''}`}</T>
            </View>
            <View style={[s.pista, { backgroundColor: c.surfaceMuted }]}>
              <View style={{ width: `${Math.max(2, Math.min(100, (Number(fila.valor) / max) * 100))}%`, height: '100%', borderRadius: 999, backgroundColor: activo ? c.chartLine : colorSerie(c, 0), opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }} />
              {datos.meta?.valor != null ? (
                <View style={{ position: 'absolute', left: `${Math.max(1, Math.min(99, (Number(datos.meta.valor) / max) * 100))}%`, top: -2, bottom: -2, width: 2, borderRadius: 1, backgroundColor: c.textSecondary }} />
              ) : null}
            </View>
          </>
        )
        return clic ? (
          <Pressable
            key={`${fila.etiqueta}-${i}`}
            onPress={() => alSeleccionar({ dimension: fila.dimension, valor: fila.dimension_valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`${fila.etiqueta}: ${formatear(fila.valor, decimales)} ${unidad}`}
            style={({ pressed }) => [{ gap: 3, opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }, pressed && { opacity: 0.65 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${fila.etiqueta}-${i}`} style={{ gap: 3 }}>{contenido}</View>
        )
      })}
    </View>
  )
}

function Apiladas({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const series = (datos.series || []).map((serie, i) => {
    const tono = serie.tono || tonoDe(serie.nombre)
    return { ...serie, color: tono === 'neutral' ? c.textMuted : tono ? colorTono(c, tono) : colorSerie(c, i) }
  })
  return (
    <View style={{ gap: 6 }}>
      <View style={s.leyenda}>
        {series.map((serie) => (
          <View key={serie.nombre} style={s.itemLeyenda}>
            <View style={[s.punto, { backgroundColor: serie.color }]} />
            <T size={11} color={c.textSecondary}>{serie.nombre}</T>
          </View>
        ))}
      </View>
      {(datos.categorias || []).map((categoria, i) => {
        const total = series.reduce((s, serie) => s + (Number(serie.valores?.[i]) || 0), 0) || 1
        const activo = esSeleccion(seleccion, categoria.dimension, categoria.dimension_valor)
        const clic = Boolean(alSeleccionar && categoria.dimension && categoria.dimension_valor != null)
        const etiqueta = /^\d{4}-\d{2}-\d{2}/.test(String(categoria.etiqueta || '')) ? fechaCorta(categoria.etiqueta) : categoria.etiqueta
        const contenido = (
          <>
            <View style={s.filaEntre}>
              <T size={12} lh={16} numberOfLines={1} peso={activo ? 700 : 500} style={{ flex: 1 }}>{etiqueta}</T>
              <T size={11} num color={c.textMuted}>{datos.porcentaje ? '100 %' : formatear(total, 0)}</T>
            </View>
            <View style={[s.pista, { backgroundColor: c.surfaceMuted, height: 10 }]}>
              {series.map((serie, j) => {
                const ancho = `${(Number(serie.valores?.[i]) || 0) / total * 100}%`
                // Si la categoría no tiene dimensión (día/semana), cada segmento lleva su estado o nivel.
                const dim = categoria.dimension || serie.dimension
                const valor = categoria.dimension ? categoria.dimension_valor : serie.dimension_valor
                const clicSegmento = !categoria.dimension && alSeleccionar && dim && valor != null
                const pieza = <View style={{ width: '100%', height: '100%', backgroundColor: serie.color, opacity: atenuado(seleccion, dim, valor) }} />
                return clicSegmento ? (
                  <Pressable
                    key={`${serie.nombre}-${j}`}
                    onPress={() => alSeleccionar({ dimension: dim, valor })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: esSeleccion(seleccion, dim, valor) }}
                    accessibilityLabel={`Filtrar por ${serie.nombre}`}
                    style={{ width: ancho, height: '100%' }}
                  >
                    {pieza}
                  </Pressable>
                ) : (
                  <View key={`${serie.nombre}-${j}`} style={{ width: ancho, height: '100%' }}>{pieza}</View>
                )
              })}
            </View>
          </>
        )
        return clic ? (
          <Pressable
            key={`${categoria.etiqueta}-${i}`}
            onPress={() => alSeleccionar({ dimension: categoria.dimension, valor: categoria.dimension_valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`Filtrar por ${etiqueta}`}
            style={({ pressed }) => [{ gap: 3, opacity: atenuado(seleccion, categoria.dimension, categoria.dimension_valor) }, pressed && { opacity: 0.65 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${categoria.etiqueta}-${i}`} style={{ gap: 3 }}>{contenido}</View>
        )
      })}
    </View>
  )
}

function Ranking({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const filas = datos.filas || []
  const max = Math.max(...filas.map((f) => Number(f.valor) || 0), 1)
  return (
    <View style={{ gap: 5 }}>
      {filas.map((fila, i) => {
        const activo = esSeleccion(seleccion, fila.dimension, fila.dimension_valor)
        const clic = Boolean(alSeleccionar && fila.dimension && fila.dimension_valor != null)
        const contenido = (
          <>
            <View style={s.filaEntre}>
              <View style={s.tituloFila}>
                <T size={11} num color={c.textMuted} style={{ width: 16 }}>{i + 1}</T>
                <T size={12} lh={16} numberOfLines={1} peso={activo ? 700 : 500} style={{ flex: 1 }}>{fila.etiqueta}</T>
                <T size={12} num peso={600}>{`${formatear(fila.valor, datos.decimales)}${datos.unidad ? ` ${datos.unidad}` : ''}`}</T>
              </View>
              <View style={[s.pista, { backgroundColor: c.surfaceMuted }]}>
                <View style={{ width: `${Math.max(2, (Number(fila.valor) / max) * 100)}%`, height: '100%', borderRadius: 999, backgroundColor: activo ? c.chartLine : colorSerie(c, 0), opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }} />
              </View>
            </View>
            {fila.variacion ? (
              <View style={{ paddingLeft: 16 }}>
                <Variacion variacion={fila.variacion} />
              </View>
            ) : null}
          </>
        )
        return clic ? (
          <Pressable
            key={`${fila.etiqueta}-${i}`}
            onPress={() => alSeleccionar({ dimension: fila.dimension, valor: fila.dimension_valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`${fila.etiqueta}: ${formatear(fila.valor, datos.decimales)} ${datos.unidad}`}
            style={({ pressed }) => [{ gap: 2, opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }, pressed && { opacity: 0.65 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${fila.etiqueta}-${i}`} style={{ gap: 2 }}>{contenido}</View>
        )
      })}
    </View>
  )
}

function Matriz({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const columnas = Object.fromEntries((datos.columnas || []).map((col) => [col.codigo, col]))
  const columnasOrden = (datos.columnas || []).map((col) => col.codigo)
  // Cada columna tiene su unidad: la barra se escala con el máximo de esa columna para que las
  // tres variables se comparen dentro de su propia escala.
  const maximos = Object.fromEntries(
    columnasOrden.map((codigo) => [codigo, Math.max(1, ...(datos.filas || []).map((fila) => Number((fila.celdas || []).find((celda) => celda.variable === codigo)?.valor) || 0))]),
  )
  const colorCelda = (celda) =>
    datos.semaforo ? colorTono(c, semaforoDe(celda.nivel)) : colorSerie(c, Math.max(0, columnasOrden.indexOf(celda.variable)))
  return (
    <View style={{ gap: 8 }}>
      {(datos.filas || []).map((fila) => (
        <View key={fila.etiqueta} style={{ gap: 4 }}>
          <T size={12} peso={700} numberOfLines={1}>{fila.etiqueta}</T>
          {(fila.celdas || []).map((celda, i) => {
            const col = columnas[celda.variable]
            const activo = esSeleccion(seleccion, celda.dimension, celda.dimension_valor)
            const clic = Boolean(alSeleccionar && celda.dimension && celda.dimension_valor != null)
            const ancho = datos.semaforo ? Number(celda.valor) : (Number(celda.valor) / maximos[celda.variable]) * 100
            const contenido = (
              <>
                <View style={s.filaEntre}>
                  <T size={11} lh={15} color={c.textMuted} numberOfLines={1} style={{ flex: 1 }}>{col?.nombre || INFO_VARIABLE[celda.variable]?.nombre || celda.variable}</T>
                  <T size={11} num color={activo ? c.textPrimary : c.textSecondary} peso={activo ? 700 : 500}>
                    {`${formatear(celda.valor, datos.semaforo ? 1 : col?.decimales ?? 1)}${datos.semaforo || col?.unidad === '%' ? ' %' : col?.unidad ? ` ${col.unidad}` : ''}`}
                  </T>
                </View>
                <View style={[s.pista, { backgroundColor: c.surfaceMuted, height: 7 }]}>
                  <View style={{ width: `${Math.max(2, Math.min(100, ancho))}%`, height: '100%', borderRadius: 999, backgroundColor: colorCelda(celda), opacity: atenuado(seleccion, celda.dimension, celda.dimension_valor) }} />
                </View>
              </>
            )
            return clic ? (
              <Pressable
                key={`${fila.etiqueta}-${i}`}
                onPress={() => alSeleccionar({ dimension: celda.dimension, valor: celda.dimension_valor })}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={`${fila.etiqueta}, ${col?.nombre || celda.variable}: ${formatear(celda.valor, 1)}`}
                style={({ pressed }) => [{ gap: 2, opacity: atenuado(seleccion, celda.dimension, celda.dimension_valor) }, pressed && { opacity: 0.65 }]}
              >
                {contenido}
              </Pressable>
            ) : (
              <View key={`${fila.etiqueta}-${i}`} style={{ gap: 2 }}>{contenido}</View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function Atencion({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  const grupos = datos.grupos || []
  const max = Math.max(...grupos.map((g) => Number(g.valor) || 0), 1)
  return (
    <View style={{ gap: 6 }}>
      <View style={s.filaEntre}>
        <T peso={800} size={24} num>{`${datos.promedio == null ? '—' : formatear(datos.promedio, 0)} min`}</T>
        <T size={11} color={c.textMuted}>{`${datos.atendidas || 0} de ${datos.total || 0} alertas atendidas`}</T>
      </View>
      <Meta meta={datos.meta} estado={datos.meta_estado} />
      {grupos.map((grupo, i) => {
        const activo = esSeleccion(seleccion, grupo.dimension, grupo.dimension_valor)
        const clic = Boolean(alSeleccionar && grupo.dimension && grupo.dimension_valor != null)
        const contenido = (
          <>
            <View style={s.filaEntre}>
              <T size={12} lh={16} numberOfLines={1} peso={activo ? 700 : 500} style={{ flex: 1 }}>{grupo.etiqueta}</T>
              <T size={11} num color={c.textSecondary}>{`${formatear(grupo.valor, 0)} min`}</T>
            </View>
            <View style={[s.pista, { backgroundColor: c.surfaceMuted }]}>
              <View style={{ width: `${Math.max(2, (Number(grupo.valor) / max) * 100)}%`, height: '100%', borderRadius: 999, backgroundColor: activo ? c.chartLine : colorSerie(c, 0), opacity: atenuado(seleccion, grupo.dimension, grupo.dimension_valor) }} />
            </View>
          </>
        )
        return clic ? (
          <Pressable
            key={`${grupo.etiqueta}-${i}`}
            onPress={() => alSeleccionar({ dimension: grupo.dimension, valor: grupo.dimension_valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`Filtrar por ${grupo.etiqueta}`}
            style={({ pressed }) => [{ gap: 2, opacity: atenuado(seleccion, grupo.dimension, grupo.dimension_valor) }, pressed && { opacity: 0.65 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${grupo.etiqueta}-${i}`} style={{ gap: 2 }}>{contenido}</View>
        )
      })}
    </View>
  )
}

function Disponibilidad({ datos, seleccion, alSeleccionar }) {
  const { c } = useTema()
  return (
    <View style={{ gap: 6 }}>
      <View style={s.filaEntre}>
        <T peso={800} size={24} num>{datos.promedio == null ? '—' : `${formatear(datos.promedio, 1)} %`}</T>
        <T size={11} color={c.textMuted}>{`${datos.filas?.length || 0} dispositivos`}</T>
      </View>
      <Meta meta={datos.meta} estado={datos.meta_estado} />
      {(datos.filas || []).map((fila, i) => {
        const activo = esSeleccion(seleccion, fila.dimension, fila.dimension_valor)
        const clic = Boolean(alSeleccionar && fila.dimension && fila.dimension_valor != null)
        const huecos = fila.huecos || []
        const contenido = (
          <>
            <View style={s.filaEntre}>
              <T size={12} lh={16} numberOfLines={1} peso={activo ? 700 : 500} style={{ flex: 1 }}>{fila.etiqueta}</T>
              <T size={11} num color={c.textSecondary}>{`${formatear(fila.valor, 1)} %`}</T>
            </View>
            <View style={[s.pista, { backgroundColor: c.surfaceMuted }]}>
              <View style={{ width: `${Math.max(2, Math.min(100, Number(fila.valor) || 0))}%`, height: '100%', borderRadius: 999, backgroundColor: activo ? c.chartLine : colorSerie(c, 0), opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }} />
            </View>
            {huecos.length ? (
              <T size={10} color={c.textMuted}>{`${huecos.length} ${huecos.length === 1 ? 'hueco' : 'huecos'} · ${huecos.map((h) => duracion(h.minutos)).join(', ')}`}</T>
            ) : null}
          </>
        )
        return clic ? (
          <Pressable
            key={`${fila.etiqueta}-${i}`}
            onPress={() => alSeleccionar({ dimension: fila.dimension, valor: fila.dimension_valor })}
            accessibilityRole="button"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={`${fila.etiqueta}: ${formatear(fila.valor, 1)} %`}
            style={({ pressed }) => [{ gap: 2, opacity: atenuado(seleccion, fila.dimension, fila.dimension_valor) }, pressed && { opacity: 0.65 }]}
          >
            {contenido}
          </Pressable>
        ) : (
          <View key={`${fila.etiqueta}-${i}`} style={{ gap: 2 }}>{contenido}</View>
        )
      })}
    </View>
  )
}

function Hallazgos({ hallazgos, generando, error, alGenerar }) {
  const { c } = useTema()
  const textos = Array.isArray(hallazgos) ? hallazgos : hallazgos?.hallazgos
  const origen = hallazgos?.origen === 'ia' ? 'IA' : 'reglas locales'
  return (
    <View style={{ gap: 8 }}>
      {!hallazgos && !generando ? (
        <>
          <T size={12} color={c.textMuted}>Nico AI resume lo más relevante de esta página.</T>
          <Button variant="secondary" size="sm" icon="sparkles" onPress={alGenerar}>Generar hallazgos</Button>
        </>
      ) : null}
      {generando ? <T size={12} color={c.textMuted}>Analizando la página…</T> : null}
      {error ? <T size={12} color={c.danger}>No se pudieron generar los hallazgos.</T> : null}
      {textos?.length ? (
        <View style={{ gap: 6 }}>
          {textos.map((texto, i) => (
            <View key={i} style={s.hallazgo}>
              <T size={13} lh={18} color={c.textSecondary} style={{ flex: 1 }}>{texto}</T>
            </View>
          ))}
          <T size={10} color={c.textMuted}>{`Nico AI · ${origen}`}</T>
        </View>
      ) : null}
    </View>
  )
}

function Contenido({ tarjeta, datos, seleccion, alSeleccionar, hallazgos, generando, errorHallazgos, alGenerar }) {
  const { c } = useTema()
  if (datos.bajo_demanda || tarjeta.tipo === 'hallazgos') {
    return <Hallazgos hallazgos={hallazgos} generando={generando} error={errorHallazgos} alGenerar={alGenerar} />
  }
  if (tarjeta.tipo === 'kpi') return <Kpi datos={datos} compacto={tarjeta.w <= 3} />
  if (tarjeta.tipo === 'tendencia') {
    return (
      <View style={{ gap: 2 }}>
        <Lineas
          series={datos.series || []}
          previo={datos.previo || []}
          umbrales={datos.umbrales}
          unidad={datos.unidad}
          decimales={datos.decimales}
          intervalo={datos.intervalo}
          alto={190}
          seleccion={seleccion}
          alSeleccionar={alSeleccionar}
        />
        {datos.nota_umbrales ? <T size={10} color={c.textMuted}>{datos.nota_umbrales}</T> : null}
      </View>
    )
  }
  if (tarjeta.tipo === 'medidor') {
    return (
      <View style={{ gap: 0 }}>
        <MedidorAro
          valor={datos.valor}
          min={datos.min}
          max={datos.max}
          meta={datos.meta?.valor}
          textoMeta={datos.meta?.texto}
          unidad={datos.unidad}
          decimales={datos.decimales}
          estado={datos.meta_estado}
        />
        <Variacion variacion={datos.variacion} />
      </View>
    )
  }
  if (tarjeta.tipo === 'barras') return <Barras datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'barras_apiladas') return <Apiladas datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'ranking') return <Ranking datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'matriz') return <Matriz datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'mapa_calor') return <MapaCalor valores={datos.valores} dias={datos.dias} alertas={datos.alertas} />
  if (tarjeta.tipo === 'dispersion') {
    return <Dispersion puntos={datos.puntos || []} infoX={datos.info_x} infoY={datos.info_y} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  }
  if (tarjeta.tipo === 'histograma') return <Histograma cubetas={datos.cubetas || []} unidad={datos.unidad} decimales={datos.decimales} umbrales={datos.umbrales} />
  if (tarjeta.tipo === 'alertas_dona') return <Dona sectores={datos.sectores || []} total={datos.total} por={datos.por} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'tiempo_atencion') return <Atencion datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'disponibilidad') return <Disponibilidad datos={datos} seleccion={seleccion} alSeleccionar={alSeleccionar} />
  if (tarjeta.tipo === 'texto') return <T size={13} lh={19} color={c.textSecondary}>{datos.nota || tarjeta.opciones?.nota}</T>
  return <T size={12} color={c.textMuted}>Tipo de tarjeta no disponible.</T>
}

// Tarjeta apilada: encabezado con el ícono del tipo, estados propios y el contenido de la consulta.
export function TarjetaTablero({ tarjeta, datos, cargando, seleccion, alSeleccionar, alGenerarHallazgos, generando, hallazgos, errorHallazgos, alReintentar }) {
  const { c } = useTema()
  return (
    <View testID={`tarjeta-${tarjeta.tipo}`} accessibilityLabel={`${tarjeta.titulo} (${NOMBRES_TIPO[tarjeta.tipo] || tarjeta.tipo})`}>
      <Card padding="sm" style={{ borderRadius: 22, gap: 9 }}>
        <View style={s.cabeza}>
          <IconCircle name={ICONOS_TIPO[tarjeta.tipo] || 'activity'} size="sm" />
          <T peso={700} size={13} lh={18} numberOfLines={2} style={{ flex: 1 }}>{tarjeta.titulo}</T>
        </View>
        {cargando && !datos ? (
          <Cargando />
        ) : datos?.error ? (
          <View style={s.estado}>
            <Icon name="octagon-alert" size={16} color={c.danger} />
            <T size={12} color={c.textSecondary} style={{ flex: 1 }}>No se pudo calcular esta tarjeta.</T>
            <Button variant="ghost" size="sm" onPress={alReintentar}>Reintentar</Button>
          </View>
        ) : datos?.sin_datos ? (
          <SinDatos compacto={tarjeta.tipo === 'kpi'} />
        ) : datos ? (
          <Contenido
            tarjeta={tarjeta}
            datos={datos}
            seleccion={seleccion}
            alSeleccionar={alSeleccionar}
            hallazgos={hallazgos}
            generando={generando}
            errorHallazgos={errorHallazgos}
            alGenerar={() => alGenerarHallazgos?.(tarjeta)}
          />
        ) : null}
      </Card>
    </View>
  )
}

const s = StyleSheet.create({
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valorFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  puntoMeta: { width: 8, height: 8, borderRadius: 4 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  filaEntre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloFila: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  pista: { height: 8, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  hallazgo: { flexDirection: 'row', gap: 6 },
})
