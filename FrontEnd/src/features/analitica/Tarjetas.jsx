import {
  BarChart,
  Button,
  DonutChart,
  Gauge,
  Heatmap,
  Histogram,
  KpiTile,
  MatrixChart,
  RankingList,
  ScatterChart,
  StackedBarChart,
  TrendChart,
} from '../../design-system/componentes/index.js'
import { duracionLegible } from '../../utils/formato'
import { puntosChart, semaforoDe, tonoDe, variacionParaTile } from './datos'

const bandaDeUmbrales = (umbrales) =>
  umbrales
    ? [
        { min: umbrales.advertencia_max, max: umbrales.peligro_max, tono: 'danger' },
        { min: umbrales.peligro_min, max: umbrales.advertencia_min, tono: 'danger' },
      ]
    : []

function Tendencia({ datos, alto, alSeleccionar, cruzado }) {
  if (!datos.series?.length) return <p className="ui-muted">Sin datos en el periodo.</p>
  const altura = Math.max(80, alto - (datos.nota_umbrales ? 14 : 0))
  const bandas = bandaDeUmbrales(datos.umbrales)
  const threshold = datos.umbrales
    ? { max: datos.umbrales.advertencia_max, min: datos.umbrales.advertencia_min }
    : undefined
  if (datos.series.length === 1) {
    return (
      <div className="ui-analitica__grafica">
        <TrendChart
          data={puntosChart(datos.series[0].puntos, datos.intervalo)}
          comparativa={(datos.previo || []).map((p) => p.y)}
          bandas={bandas}
          threshold={threshold}
          unit={datos.unidad}
          decimals={datos.decimales}
          height={altura}
          tooltipFijo={false}
          label={datos.titulo}
        />
        {datos.nota_umbrales && <p className="ui-analitica__nota">{datos.nota_umbrales}</p>}
      </div>
    )
  }
  const series = datos.series.map((s, i) => ({
    nombre: s.nombre,
    dimension: s.dimension,
    dimensionValor: s.dimension_valor,
    puntos: puntosChart(s.puntos, datos.intervalo),
    comparativa: i === 0 ? (datos.previo || []).map((p) => p.y) : undefined,
  }))
  return (
    <div className="ui-analitica__grafica">
      <TrendChart
        series={series}
        bandas={bandas}
        threshold={threshold}
        unit={datos.unidad}
        decimals={datos.decimales}
        height={altura}
        tooltipFijo={false}
        label={datos.titulo}
        seleccion={cruzado}
        alSeleccionar={alSeleccionar}
      />
      {datos.nota_umbrales && <p className="ui-analitica__nota">{datos.nota_umbrales}</p>}
    </div>
  )
}

function Barras({ datos, alto, alSeleccionar, cruzado }) {
  const filas = (datos.barras || []).map((b) => ({
    label: b.etiqueta,
    value: b.valor,
    dimension: b.dimension,
    dimensionValor: b.dimension_valor,
  }))
  return (
    <BarChart
      data={filas}
      orientacion={datos.orientacion}
      meta={datos.meta?.valor}
      unit={datos.unidad}
      decimals={datos.decimales}
      height={Math.max(48, alto)}
      label={datos.titulo}
      seleccion={cruzado}
      alSeleccionar={alSeleccionar}
      vacio="Sin datos en el periodo"
    />
  )
}

function Ranking({ datos, alto, alSeleccionar, cruzado }) {
  return (
    <RankingList
      filas={(datos.filas || []).map((f) => ({
        etiqueta: f.etiqueta,
        valor: f.valor,
        variacion: f.variacion,
        dimension: f.dimension,
        dimensionValor: f.dimension_valor,
      }))}
      unidad={datos.unidad}
      decimales={datos.decimales}
      max={datos.maximo}
      sentido={datos.sentido === 'mejores' ? 'mayor' : 'menor'}
      seleccion={cruzado}
      alSeleccionar={alSeleccionar}
      label={datos.titulo}
      style={{ maxHeight: alto }}
    />
  )
}

function Apiladas({ datos, alto, alSeleccionar, cruzado }) {
  const filas = (datos.categorias || []).map((categoria, i) => ({
    label: categoria.etiqueta,
    dimension: categoria.dimension,
    dimensionValor: categoria.dimension_valor,
    segmentos: (datos.series || []).map((serie) => ({
      label: serie.nombre,
      value: serie.valores?.[i] || 0,
      tono: tonoDe(serie.nombre) || undefined,
      dimension: serie.dimension || categoria.dimension,
      dimensionValor: serie.dimension_valor ?? categoria.dimension_valor,
    })),
  }))
  return (
    <StackedBarChart
      data={filas}
      porcentaje={datos.porcentaje}
      unit={datos.unidad}
      decimals={datos.decimales}
      height={Math.max(48, alto)}
      label={datos.titulo}
      seleccion={cruzado}
      alSeleccionar={alSeleccionar}
      vacio="Sin datos en el periodo"
    />
  )
}

function Dona({ datos, alto, alSeleccionar, cruzado }) {
  const datosDona = (datos.sectores || []).map((s, i) => ({
    label: s.etiqueta,
    value: s.valor,
    tono: datos.por === 'variable' ? undefined : tonoDe(s.dimension_valor) || tonoDe(s.etiqueta),
    color: datos.por === 'variable' ? `var(--chart-series-${(i % 6) + 1})` : undefined,
    dimension: s.dimension,
    dimensionValor: s.dimension_valor,
  }))
  return (
    <DonutChart
      datos={datosDona}
      total={datos.total}
      unit={datos.unidad}
      decimals={datos.decimales}
      height={Math.max(48, alto)}
      leyenda
      alSeleccionar={alSeleccionar}
      seleccion={cruzado}
      vacio="Sin datos en el periodo"
      svgClassName="ui-dona"
    />
  )
}

function Matriz({ datos, alto, alSeleccionar, cruzado }) {
  const filas = (datos.filas || []).map((fila) => ({
    etiqueta: fila.etiqueta,
    dimension: fila.dimension,
    dimensionValor: fila.dimension_valor,
    celdas: (fila.celdas || []).map((celda) => ({
      columna: celda.variable,
      valor: celda.valor,
      dimension: celda.dimension,
      dimensionValor: celda.dimension_valor,
      tono:
        celda.nivel === 'cumple'
          ? 'success'
          : celda.nivel === 'cerca'
            ? 'warning'
            : celda.nivel === 'lejos'
              ? 'danger'
              : undefined,
    })),
  }))
  return (
    <MatrixChart
      filas={filas}
      columnas={(datos.columnas || []).map((c) => c.nombre || c.codigo)}
      modo={datos.semaforo ? 'semaforo' : 'escala'}
      meta={95}
      min={datos.escala?.min}
      max={datos.escala?.max}
      height={Math.max(48, alto)}
      unit={datos.semaforo ? '%' : ''}
      seleccion={cruzado}
      alSeleccionar={alSeleccionar}
      vacio="Sin datos en el periodo"
    />
  )
}

function Calor({ datos, alto }) {
  return (
    <Heatmap
      valores={datos.valores}
      min={datos.min}
      max={datos.max}
      unit={datos.unidad}
      decimals={datos.decimales}
      alertas={datos.alertas}
      tono={datos.alertas ? 'chart-warn' : undefined}
      height={Math.max(48, alto)}
      label={datos.titulo}
    />
  )
}

function Dispersion({ datos, alto, alSeleccionar, cruzado }) {
  return (
    <ScatterChart
      puntos={(datos.puntos || []).map((p) => ({
        ...p,
        grupo: p.area || p.area_num,
        valorGrupo: p.area_num,
      }))}
      xLabel={datos.info_x?.nombre}
      yLabel={datos.info_y?.nombre}
      unitX={datos.info_x?.unidad}
      unitY={datos.info_y?.unidad}
      decimalsX={datos.info_x?.decimales}
      decimalsY={datos.info_y?.decimales}
      dimension="area"
      height={Math.max(48, alto - 20)}
      seleccion={cruzado}
      alSeleccionar={alSeleccionar}
      vacio="Sin datos en el periodo"
    />
  )
}

function Histograma({ datos, alto }) {
  const u = datos.umbrales
  return (
    <Histogram
      cubetas={datos.cubetas}
      unit={datos.unidad}
      decimals={datos.decimales}
      threshold={u ? [u.peligro_min, u.advertencia_min, u.advertencia_max, u.peligro_max] : undefined}
      height={Math.max(48, alto)}
      label={datos.titulo}
      vacio="Sin datos en el periodo"
    />
  )
}

function Disponibilidad({ datos, alto }) {
  return (
    <div className="ui-analitica__disponibilidad" style={{ maxHeight: alto }}>
      <div className="ui-analitica__destacado">
        <strong className="ui-num">{datos.promedio == null ? '—' : `${datos.promedio} %`}</strong>
        <span>{datos.filas?.length || 0} dispositivos ordenados por disponibilidad</span>
      </div>
      <div className="ui-analitica__lista-barras">
        {(datos.filas || []).map((fila) => (
          <div key={fila.etiqueta} className="ui-analitica__fila-barra">
            <span className="ui-analitica__fila-etiqueta" title={fila.etiqueta}>{fila.etiqueta}</span>
            <span className="ui-analitica__pista">
              <span style={{ width: `${Math.max(2, Math.min(100, fila.valor || 0))}%` }} />
            </span>
            <strong className="ui-num">{fila.valor == null ? '—' : `${fila.valor} %`}</strong>
            {fila.huecos?.length ? <small title={fila.huecos.map((h) => duracionLegible(h.minutos)).join(', ')}>{fila.huecos.length} hueco(s)</small> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Atencion({ datos, alto }) {
  return (
    <div className="ui-analitica__atencion" style={{ maxHeight: alto }}>
      <div className="ui-analitica__destacado">
        <strong className="ui-num">{datos.promedio == null ? '—' : `${datos.promedio} min`}</strong>
        <span>{datos.atendidas || 0} de {datos.total || 0} alertas atendidas</span>
      </div>
      <RankingList
        filas={(datos.grupos || []).map((g) => ({
          etiqueta: g.etiqueta,
          valor: g.valor,
          dimension: g.dimension,
          dimensionValor: g.dimension_valor,
        }))}
        unidad="min"
        decimales={datos.decimales}
        sentido="menor"
        label={datos.titulo}
      />
    </div>
  )
}

function Hallazgos({ alGenerar, generando, hallazgos, error, impresion }) {
  const origen = hallazgos?.origen === 'ia' ? 'IA' : 'reglas locales'
  const textos = Array.isArray(hallazgos) ? hallazgos : hallazgos?.hallazgos
  return (
    <div className="ui-analitica__hallazgos">
      {!hallazgos && !generando && (impresion ? (
        <p className="ui-muted">Sin hallazgos generados.</p>
      ) : (
        <>
          <p className="ui-muted">Nico AI resume lo más relevante de esta página.</p>
          <Button variant="secondary" size="sm" icon="sparkles" onClick={alGenerar}>
            Generar hallazgos
          </Button>
        </>
      ))}
      {generando && <p className="ui-muted">Analizando la página…</p>}
      {error && <p className="ui-analitica__error">No se pudieron generar los hallazgos.</p>}
      {textos?.length ? (
        <>
          <ul className="ui-analitica__hallazgos-lista">
            {textos.map((texto, i) => <li key={i}>{texto}</li>)}
          </ul>
          <span className="ui-analitica__origen">Nico AI · {origen}</span>
        </>
      ) : null}
    </div>
  )
}

export function ContenidoTarjeta({ tarjeta, datos, alto = 160, cruzado, alSeleccionar, alGenerar, generando, hallazgos, errorHallazgos, impresion }) {
  if (!datos) return null
  if (datos.bajo_demanda || tarjeta.tipo === 'hallazgos') {
    return <Hallazgos datos={datos} alGenerar={alGenerar} generando={generando} hallazgos={hallazgos} error={errorHallazgos} impresion={impresion} />
  }
  if (tarjeta.tipo === 'kpi') {
    return (
      <KpiTile
        valor={datos.valor}
        unidad={datos.unidad}
        decimales={datos.decimales}
        variacion={variacionParaTile(datos.variacion)}
        sparkline={(datos.sparkline || []).map((p) => p.y)}
        meta={datos.meta}
        semaforo={semaforoDe(datos.meta_estado)}
        vacio="Sin datos en el periodo"
        sparkAncho={Math.max(80, Math.min(150, alto * 1.1))}
        sparkAlto={Math.max(8, Math.min(34, alto * 0.25))}
      />
    )
  }
  if (tarjeta.tipo === 'tendencia') return <Tendencia datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'medidor') {
    return <Gauge valor={datos.valor} min={datos.min} max={datos.max} meta={datos.meta} unit={datos.unidad} decimals={datos.decimales} height={Math.max(48, alto)} label={datos.titulo} />
  }
  if (tarjeta.tipo === 'barras') return <Barras datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'barras_apiladas') return <Apiladas datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'ranking') return <Ranking datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'matriz') return <Matriz datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'mapa_calor') return <Calor datos={datos} alto={alto} />
  if (tarjeta.tipo === 'dispersion') return <Dispersion datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'histograma') return <Histograma datos={datos} alto={alto} />
  if (tarjeta.tipo === 'alertas_dona') return <Dona datos={datos} alto={alto} alSeleccionar={alSeleccionar} cruzado={cruzado} />
  if (tarjeta.tipo === 'tiempo_atencion') return <Atencion datos={datos} alto={alto} />
  if (tarjeta.tipo === 'disponibilidad') return <Disponibilidad datos={datos} alto={alto} />
  if (tarjeta.tipo === 'texto') return <p className="ui-analitica__nota">{datos.nota || tarjeta.opciones?.nota}</p>
  return <p className="ui-muted">Tipo de tarjeta no disponible.</p>
}
