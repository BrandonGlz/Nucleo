import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, GripVertical, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { BarChart, Badge, Icon, Logo, TrendChart } from '../../design-system/componentes/index.js'
import { UNIDAD, VARIABLE } from '../../utils/convertir'
import { ANCHO, esquema, FUENTES, FUENTES_CON_FILTRO, NOTA_MAX, opcionesDe, opcionesNuevas, tarjeta, TITULO_MAX } from './personalizacion'
import { fechaLarga, hora, mesAnio, miles, periodo } from '../../utils/formato'
import { logoDe } from '../../utils/foto'

const ORIGEN = {
  MANUAL: { tone: 'neutral', icon: 'user', label: 'Manual' },
  PROGRAMADO: { tone: 'neutral', icon: 'calendar-clock', label: 'Programado' },
  AGENTE: { tone: 'accent', icon: 'sparkles', label: 'Nico AI' },
}
const dias = (inicio, fin) => Math.round((new Date(fin) - new Date(inicio)) / 86400000)

function Cifras({ r, op }) {
  const c = r.cifras
  const alertas = c.variables.reduce((s, v) => s + v.alertas, 0)
  const items = [
    ['lecturas', 'Lecturas', miles(c.lecturas), 'activity'],
    ['dispositivos', 'Dispositivos', c.dispositivos.length, 'cpu'],
    ['alertas', 'Alertas', alertas, 'bell'],
    ['dias', 'Días', dias(r.periodo_inicio, r.periodo_fin), 'calendar'],
  ].filter(([k]) => op.datos.includes(k))
  if (!items.length) return <p className="ui-muted">Elige al menos una cifra.</p>
  return (
    <div className="ui-dash__cifras" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(([k, etiqueta, v, ico]) => (
        <div key={k} className={`ui-dash__cifra${k === 'alertas' && alertas ? ' is-alerta' : ''}`}>
          <span className="ui-eyebrow">
            <Icon name={ico} size={14} /> {etiqueta}
          </span>
          <strong className="ui-num">{v}</strong>
        </div>
      ))}
    </div>
  )
}

// Tarjeta de una variable: promedio grande y, según la opción, rango mín–máx, barras o nada.
function TarjetaVariable({ v, op }) {
  if (!v) return <p className="ui-muted">Sin datos de esta variable en el periodo.</p>
  const info = VARIABLE[v.variable]
  const d = decimalesDe(op, info.decimales)
  const u = UNIDAD[v.variable]
  const f = (x) => Number(x).toFixed(d)
  const pos = ((v.promedio - v.minimo) / (v.maximo - v.minimo || 1)) * 100
  const minmax = op.datos.includes('minmax')
  return (
    <div className="ui-dash__var">
      <div className="ui-dash__var-cabeza">
        <span className="ui-dash__ico">
          <Icon name={info.icono} size={18} />
        </span>
        <strong>{info.etiqueta}</strong>
        {op.datos.includes('alertas') && (
          <Badge tone={v.alertas ? 'warning' : 'success'} icon={v.alertas ? 'triangle-alert' : 'circle-check'}>
            {v.alertas ? `${v.alertas} ${v.alertas === 1 ? 'alerta' : 'alertas'}` : 'Sin alertas'}
          </Badge>
        )}
      </div>
      <div>
        <span className="ui-eyebrow">Promedio</span>
        <div className="ui-dash__valor ui-num">
          {f(v.promedio)}
          <small> {u}</small>
        </div>
      </div>
      {op.grafica === 'rango' && (
        <div className="ui-dash__rango">
          <span className="ui-dash__rango-pista">
            <span className="ui-dash__rango-marca" style={{ left: `${pos}%` }} />
          </span>
          {minmax && (
            <span className="ui-dash__rango-ejes ui-num">
              <span>Mín {f(v.minimo)}</span>
              <span>Máx {f(v.maximo)}</span>
            </span>
          )}
        </div>
      )}
      {op.grafica === 'barras' && (
        <div className="ui-barras">
          {[
            ['Mín', v.minimo],
            ['Prom', v.promedio],
            ['Máx', v.maximo],
          ]
            .filter(([k]) => minmax || k === 'Prom')
            .map(([k, x]) => (
              <div key={k} className={`ui-barras__fila ui-barras__fila--corta${k === 'Prom' ? ' is-max' : ''}`}>
                <span className="ui-barras__etiqueta">{k}</span>
                <span className="ui-barras__pista">
                  <span className="ui-barras__barra" style={{ width: `${(x / v.maximo) * 100}%` }} />
                </span>
                <span className="ui-barras__valor ui-num">{f(x)}</span>
              </div>
            ))}
        </div>
      )}
      {op.grafica === 'cifra' && minmax && (
        <span className="ui-dash__rango-ejes ui-num">
          <span>Mín {f(v.minimo)}</span>
          <span>Máx {f(v.maximo)}</span>
        </span>
      )}
    </div>
  )
}

// Gráfica del periodo: barras horizontales, columnas o línea.
// En el documento las gráficas son fijas (interactivo={false}): sin tooltip ni cursor de hover
// que se queden pegados en la vista, la exportación o la impresión.
// Alto de la gráfica según el alto elegido para la tarjeta (o el de siempre).
const altoGrafica = (alto) => (alto ? Math.max(90, alto - 70) : 150)

function Serie({ serie, op }) {
  const v = serie.variable
  const dec = decimalesDe(op, VARIABLE[v].decimales)
  const max = Math.max(...serie.puntos.map(([, x]) => x))
  const valores = op.datos.includes('valores')
  const resalta = op.datos.includes('maximo')
  const datos = serie.puntos.map(([label, value]) => ({ label, time: label, value }))
  if (op.grafica === 'columnas')
    return (
      <BarChart
        data={datos}
        unit={UNIDAD[v]}
        height={altoGrafica(op.alto)}
        decimals={dec}
        activeIndex={resalta ? datos.findIndex((x) => x.value === max) : -1}
        interactivo={false}
      />
    )
  if (op.grafica === 'linea')
    return <TrendChart data={datos} unit={UNIDAD[v]} height={altoGrafica(op.alto)} decimals={dec} interactivo={false} />
  return (
    <div className="ui-barras">
      {serie.puntos.map(([etiqueta, x]) => (
        <div
          key={etiqueta}
          className={`ui-barras__fila${resalta && x === max ? ' is-max' : ''}${valores ? '' : ' ui-barras__fila--sin-valor'}`}
        >
          <span className="ui-barras__etiqueta">{etiqueta}</span>
          <span className="ui-barras__pista">
            <span className="ui-barras__barra" style={{ width: `${(x / max) * 100}%` }} />
          </span>
          {valores && (
            <span className="ui-barras__valor ui-num">
              {Number(x).toFixed(dec)} <small>{UNIDAD[v]}</small>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const COLOR_ALERTA = ['var(--warning)', 'var(--chart-bar-active)', 'var(--chart-bar)']

// Dona con la parte de las alertas que corresponde a cada variable.
function Dona({ partes, total }) {
  const r = 52
  const largo = 2 * Math.PI * r
  const tramos = partes.map((p) => (p.alertas / total) * largo)
  const inicios = tramos.map((_, i) => tramos.slice(0, i).reduce((s, x) => s + x, 0))
  return (
    <svg className="ui-dona" viewBox="0 0 132 132" role="img" aria-label="Alertas por variable">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-muted)" strokeWidth="18" />
      {partes.map((p, i) => (
        <circle
          key={p.variable}
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={COLOR_ALERTA[i % COLOR_ALERTA.length]}
          strokeWidth="18"
          strokeDasharray={`${tramos[i]} ${largo - tramos[i]}`}
          strokeDashoffset={-inicios[i]}
          transform="rotate(-90 66 66)"
        />
      ))}
      <text x="66" y="74" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--text-primary)">
        {total}
      </text>
    </svg>
  )
}

// Reparto de las alertas del periodo entre las variables: barras, dona o lista.
function Alertas({ variables, op }) {
  const total = variables.reduce((s, v) => s + v.alertas, 0)
  if (!total) return <p className="ui-muted">No hubo alertas en el periodo.</p>
  const pct = (v) => Math.round((v.alertas / total) * 100)
  const conPct = op.datos.includes('porcentaje')
  return (
    <div className="ui-dash__alertas">
      {op.datos.includes('total') && op.grafica !== 'dona' && (
        <div className="ui-dash__alertas-total">
          <strong className="ui-num">{total}</strong>
          <span className="ui-muted">{total === 1 ? 'alerta en el periodo' : 'alertas en el periodo'}</span>
        </div>
      )}
      {op.grafica === 'barras' && (
        <div className="ui-barras">
          {variables.map((v) => (
            <div key={v.variable} className="ui-barras__fila ui-barras__fila--ancha">
              <span className="ui-barras__etiqueta">{VARIABLE[v.variable].corta}</span>
              <span className="ui-barras__pista">
                <span className="ui-barras__barra ui-barras__barra--alerta" style={{ width: `${pct(v)}%` }} />
              </span>
              <span className="ui-barras__valor ui-num">
                {v.alertas} {conPct && <small>{pct(v)} %</small>}
              </span>
            </div>
          ))}
        </div>
      )}
      {op.grafica === 'dona' && (
        <div className="ui-dash__dona">
          <Dona partes={variables} total={total} />
          <ul>
            {variables.map((v, i) => (
              <li key={v.variable}>
                <span className="ui-dash__punto" style={{ background: COLOR_ALERTA[i % COLOR_ALERTA.length] }} />
                <span style={{ flex: 1 }}>{VARIABLE[v.variable].corta}</span>
                <strong className="ui-num">{v.alertas}</strong>
                {conPct && <span className="ui-muted ui-num">{pct(v)} %</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {op.grafica === 'lista' && (
        <ul className="ui-dash__lista">
          {variables.map((v) => (
            <li key={v.variable}>
              <Icon name={VARIABLE[v.variable].icono} size={16} />
              <span style={{ flex: 1 }}>{VARIABLE[v.variable].etiqueta}</span>
              <Badge tone={v.alertas ? 'warning' : 'success'}>{v.alertas}</Badge>
              {conPct && <span className="ui-muted ui-num">{pct(v)} %</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Gráfica genérica para las tarjetas nuevas: `puntos` son [{ label, value }] con su unidad.
export function GraficaLibre({ grafica, puntos, unidad, dec = 1, color, alto, resaltarMax = true }) {
  if (!puntos.length) return <p className="ui-muted">Elige al menos un dato.</p>
  const max = Math.max(...puntos.map((x) => x.value)) || 1
  const f = (x) => Number(x).toFixed(dec)
  if (grafica === 'columnas')
    return <BarChart data={puntos} unit={unidad} height={altoGrafica(alto)} decimals={dec} interactivo={false} />
  if (grafica === 'linea')
    return (
      <TrendChart
        data={puntos.map((x) => ({ ...x, time: x.label }))}
        unit={unidad}
        height={altoGrafica(alto)}
        decimals={dec}
        interactivo={false}
      />
    )
  if (grafica === 'dona') {
    const total = puntos.reduce((s, x) => s + x.value, 0)
    return (
      <div className="ui-dash__dona">
        <Dona partes={puntos.map((x) => ({ variable: x.label, alertas: x.value }))} total={total} />
        <ul>
          {puntos.map((x, i) => (
            <li key={x.label}>
              <span className="ui-dash__punto" style={{ background: COLOR_ALERTA[i % COLOR_ALERTA.length] }} />
              <span style={{ flex: 1 }}>{x.label}</span>
              <strong className="ui-num">{f(x.value)}</strong>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (grafica === 'tabla')
    return (
      <table className="nc-table" style={{ width: '100%' }}>
        <tbody>
          {puntos.map((x) => (
            <tr key={x.label}>
              <td>{x.label}</td>
              <td className="ui-num ui-strong" style={{ textAlign: 'right' }}>
                {f(x.value)} {x.unidad ?? unidad}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  if (grafica === 'cifra')
    return (
      <div className="ui-dash__cifras" style={{ gridTemplateColumns: `repeat(${puntos.length}, minmax(0, 1fr))` }}>
        {puntos.map((x) => (
          <div key={x.label} className="ui-dash__cifra">
            <span className="ui-eyebrow">{x.label}</span>
            <strong className="ui-num">{f(x.value)}</strong>
          </div>
        ))}
      </div>
    )
  return (
    <div className="ui-barras">
      {puntos.map((x) => (
        <div key={x.label} className={`ui-barras__fila ui-barras__fila--ancha${resaltarMax && x.value === max ? ' is-max' : ''}`}>
          <span className="ui-barras__etiqueta">{x.label}</span>
          <span className="ui-barras__pista">
            <span
              className={`ui-barras__barra${(x.color ?? color) ? ` ui-barras__barra--${x.color ?? color}` : ''}`}
              style={{ width: `${(x.value / max) * 100}%` }}
            />
          </span>
          <span className="ui-barras__valor ui-num">
            {f(x.value)} {(x.unidad ?? unidad) && <small>{x.unidad ?? unidad}</small>}
          </span>
        </div>
      ))}
    </div>
  )
}

const CAMPO = { minimo: 'Mínimo', promedio: 'Promedio', maximo: 'Máximo', alertas: 'Alertas' }

// Tarjeta añadida por la persona: arma los puntos según su fuente y opciones.
// Texto para los reportes anteriores a la etapa 4, que no guardaron estas claves.
const SIN_DATOS_NUEVO = 'Sin datos para este reporte (generado antes de esta función)'
const SIN_DATOS_PERIODO = 'Sin datos en el periodo.'
const sinDatosNuevo = () => <p className="ui-muted">{SIN_DATOS_NUEVO}</p>

const ESTADOS_ALERTA = {
  ATENDIDA: 'Atendidas',
  DESCARTADA: 'Descartadas',
  PENDIENTE: 'Pendientes',
}
const nombreVariable = (codigo) => VARIABLE[codigo]?.corta ?? codigo
const nombreEstado = (estado) => ESTADOS_ALERTA[estado] ?? estado
const SIN_DATOS_FILTRO = 'Sin datos para el filtro elegido'
const filtroDe = (op) => ({ areas: op.filtro?.areas ?? [], dispositivos: op.filtro?.dispositivos ?? [] })
const decimalesDe = (op, porOmision) => (op.decimales === 0 || op.decimales === 1 || op.decimales === 2 ? op.decimales : porOmision)
const areaNumDe = (fila, areas = []) => fila?.area_num ?? areas.find((a) => a.nombre === fila?.area)?.num
const pasaFiltro = (op, codigo, areaNum) => {
  const { areas: porArea, dispositivos } = filtroDe(op)
  if (!porArea.length && !dispositivos.length) return true
  if (dispositivos.length && !dispositivos.includes(codigo)) return false
  if (porArea.length && !porArea.includes(areaNum)) return false
  return true
}
const conSigno = (valor, decimales = 1, unidad = '') => {
  if (valor == null) return '—'
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return `${signo}${Math.abs(Number(valor)).toFixed(decimales)}${unidad ? ` ${unidad}` : ''}`
}
const conPorcentaje = (valor) => {
  if (valor == null) return ''
  const signo = valor > 0 ? '+' : valor < 0 ? '−' : ''
  return ` (${signo}${Math.abs(Number(valor)).toFixed(1)} %)`
}

function Cumplimiento({ c, op }) {
  if (!c.cumplimiento) return sinDatosNuevo()
  const dec = decimalesDe(op, 1)
  const filas = ['TEMP', 'HUM', 'AIRE']
    .filter((codigo) => c.cumplimiento[codigo])
    .map((codigo) => ({ variable: codigo, ...c.cumplimiento[codigo] }))
  if (!filas.length) return <p className="ui-muted">{SIN_DATOS_PERIODO}</p>
  if (op.grafica === 'tabla') {
    const datos = op.datos ?? ['pct', 'fuera']
    return (
      <div className="ui-tabla-scroll">
        <table className="nc-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Variable</th>
              {datos.includes('pct') && <th>Cumplimiento</th>}
              {datos.includes('fuera') && <th>Fuera</th>}
              <th>Lecturas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.variable}>
                <td>{nombreVariable(fila.variable)}</td>
                {datos.includes('pct') && <td className="ui-num">{Number(fila.dentro_pct).toFixed(dec)} %</td>}
                {datos.includes('fuera') && <td className="ui-num">{Number(fila.fuera_min).toFixed(dec)} min</td>}
                <td className="ui-num">{miles(fila.lecturas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (op.grafica === 'cifra') {
    const datos = op.datos ?? ['pct', 'fuera']
    return (
      <div className="ui-dash__cifras ui-dash__cifras--tarjeta" style={{ gridTemplateColumns: `repeat(${filas.length}, minmax(0, 1fr))` }}>
        {filas.map((fila) => (
          <div key={fila.variable} className="ui-dash__cifra">
            <span className="ui-eyebrow">{nombreVariable(fila.variable)}</span>
            <strong className="ui-num">
              {datos.includes('pct') ? `${Number(fila.dentro_pct).toFixed(dec)} %` : ''}
            </strong>
            {datos.includes('fuera') && (
              <span className="ui-muted" style={{ fontSize: 11 }}>
                {Number(fila.fuera_min).toFixed(dec)} min fuera
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }
  const puntos = filas.map((fila) => ({
    label: nombreVariable(fila.variable),
    value: Number(fila.dentro_pct),
  }))
  return <GraficaLibre grafica="barras" puntos={puntos} unidad="%" dec={0} />
}

function Comparativo({ c, op }) {
  if (!c.comparativo) return sinDatosNuevo()
  if (c.comparativo.sin_datos_previos)
    return <p className="ui-muted">Sin datos del periodo anterior para comparar.</p>
  const filas = c.comparativo.variables ?? []
  const alertas = c.comparativo.alertas
  if (!filas.length && !alertas) return <p className="ui-muted">{SIN_DATOS_PERIODO}</p>
  const datos = op.datos ?? ['promedio', 'extremos', 'alertas']
  const cambio = (fila) => (
    <span className={`ui-comparativo__cambio ${fila.mejora ? 'is-bueno' : 'is-aviso'}`}>
      {conSigno(fila.dif_promedio, decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1), fila.unidad)}
      {conPorcentaje(fila.dif_promedio_pct)}
    </span>
  )
  if (op.grafica === 'cifra') {
    return (
      <div className="ui-dash__cifras" style={{ gridTemplateColumns: `repeat(${Math.max(1, filas.length + (alertas ? 1 : 0))}, minmax(0, 1fr))` }}>
        {datos.includes('promedio') &&
          filas.map((fila) => (
            <div key={fila.variable} className="ui-dash__cifra">
              <span className="ui-eyebrow">{nombreVariable(fila.variable)}</span>
              <strong className="ui-num">{Number(fila.promedio ?? 0).toFixed(decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1))}</strong>
              <span className="ui-muted" style={{ fontSize: 11 }}>
                {cambio(fila)}
              </span>
            </div>
          ))}
        {datos.includes('alertas') && alertas && (
          <div className="ui-dash__cifra">
            <span className="ui-eyebrow">Alertas</span>
            <strong className="ui-num">{alertas.total}</strong>
            <span className={`ui-comparativo__cambio ${alertas.mejora ? 'is-bueno' : 'is-aviso'}`}>
              {conSigno(alertas.diferencia, 0)}
              {conPorcentaje(alertas.diferencia_pct)}
            </span>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="ui-comparativo">
      <div className="ui-tabla-scroll">
        <table className="nc-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Variable</th>
              {datos.includes('promedio') && <th>Promedio</th>}
              {datos.includes('extremos') && <th>Mín. / Máx.</th>}
              <th>Cambio</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.variable}>
                <td>{nombreVariable(fila.variable)}</td>
                {datos.includes('promedio') && (
                  <td className="ui-num">
                    {Number(fila.promedio ?? 0).toFixed(decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1))} {fila.unidad}
                  </td>
                )}
                {datos.includes('extremos') && (
                  <td className="ui-num">
                    {Number(fila.minimo ?? 0).toFixed(decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1))} /{' '}
                    {Number(fila.maximo ?? 0).toFixed(decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1))} {fila.unidad}
                  </td>
                )}
                <td>{cambio(fila)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {datos.includes('alertas') && alertas && (
        <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Alertas: {alertas.total} contra {alertas.total_previo}.{' '}
          <span className={`ui-comparativo__cambio ${alertas.mejora ? 'is-bueno' : 'is-aviso'}`}>
            {conSigno(alertas.diferencia, 0)}
            {conPorcentaje(alertas.diferencia_pct)}
          </span>
        </p>
      )}
    </div>
  )
}

function Dispositivos({ c, op, areas }) {
  if (!c.por_dispositivo) return sinDatosNuevo()
  const todas = c.por_dispositivo
  const filas = todas.filter((fila) => pasaFiltro(op, fila.codigo, areaNumDe(fila, areas)))
  if (!filas.length) {
    const { areas: porArea, dispositivos } = filtroDe(op)
    return <p className="ui-muted">{porArea.length || dispositivos.length ? SIN_DATOS_FILTRO : SIN_DATOS_PERIODO}</p>
  }
  const datos = op.datos ?? ['minimo', 'promedio', 'maximo', 'area']
  const campos = [
    ['minimo', 'Mín.'],
    ['promedio', 'Prom.'],
    ['maximo', 'Máx.'],
  ].filter(([clave]) => datos.includes(clave))
  const variables = ['TEMP', 'HUM', 'AIRE'].filter((codigo) => filas.some((fila) => fila[codigo]))
  return (
    <div className="ui-tabla-scroll">
      <table className="nc-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Dispositivo</th>
            {datos.includes('area') && <th>Área</th>}
            {variables.map((codigo) => (
              <th key={codigo}>{nombreVariable(codigo)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.codigo}>
              <td>{fila.nombre || fila.codigo}</td>
              {datos.includes('area') && <td>{fila.area || '—'}</td>}
              {variables.map((codigo) => {
                const info = fila[codigo]
                if (!info) return <td key={codigo}>—</td>
                const dec = decimalesDe(op, VARIABLE[codigo]?.decimales ?? 1)
                return (
                  <td key={codigo} className="ui-num">
                    {campos.map(([clave]) => Number(info[clave]).toFixed(dec)).join(' / ')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GestionAlertas({ c, op }) {
  if (!c.gestion_alertas) return sinDatosNuevo()
  const datos = c.gestion_alertas
  if (!datos.total) return <p className="ui-muted">{SIN_DATOS_PERIODO}</p>
  const estados = Object.entries(datos.estados ?? {}).map(([estado, total]) => ({
    label: nombreEstado(estado),
    value: total,
  }))
  const responsables = (datos.responsables ?? []).map((fila) => ({
    label: fila.usuario,
    value: fila.total,
  }))
  const conEstados = op.datos?.includes('estados')
  const conResponsables = op.datos?.includes('responsables')
  const conTiempo = op.datos?.includes('tiempo')
  if (!conEstados && !conResponsables && !conTiempo)
    return <p className="ui-muted">Elige al menos un dato.</p>
  if (op.grafica === 'dona') {
    const puntos = conEstados ? estados : responsables
    if (!puntos.length) return <p className="ui-muted">{SIN_DATOS_PERIODO}</p>
    return <GraficaLibre grafica="dona" puntos={puntos} dec={0} />
  }
  if (op.grafica === 'barras') {
    const puntos = conEstados ? estados : responsables
    return (
      <div>
        {puntos.length ? <GraficaLibre grafica="barras" puntos={puntos} dec={0} /> : <p className="ui-muted">{SIN_DATOS_PERIODO}</p>}
        {conTiempo && datos.tiempo_medio_min != null && (
          <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            Tiempo medio de atención: {Number(datos.tiempo_medio_min).toFixed(1)} min
          </p>
        )}
      </div>
    )
  }
  return (
    <div>
      <div className="ui-tabla-scroll">
        <table className="nc-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              {conEstados && <th>Estado</th>}
              {conResponsables && <th>Responsable</th>}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(conEstados ? estados : []).map((fila) => (
              <tr key={`e-${fila.label}`}>
                {conEstados && <td>{fila.label}</td>}
                {conResponsables && <td />}
                <td className="ui-num">{fila.value}</td>
              </tr>
            ))}
            {(conResponsables ? responsables : []).map((fila) => (
              <tr key={`r-${fila.label}`}>
                {conEstados && <td />}
                {conResponsables && <td>{fila.label}</td>}
                <td className="ui-num">{fila.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conTiempo && (
        <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Tiempo medio de atención: {datos.tiempo_medio_min == null ? '—' : `${Number(datos.tiempo_medio_min).toFixed(1)} min`}
        </p>
      )}
    </div>
  )
}

function Disponibilidad({ c, op, areas }) {
  if (!c.disponibilidad) return sinDatosNuevo()
  const todas = Object.entries(c.disponibilidad).map(([codigo, datos]) => ({ codigo, ...datos }))
  const filas = todas.filter((fila) => pasaFiltro(op, fila.codigo, areaNumDe(fila, areas)))
  if (!filas.length) {
    const { areas: porArea, dispositivos } = filtroDe(op)
    return <p className="ui-muted">{porArea.length || dispositivos.length ? SIN_DATOS_FILTRO : SIN_DATOS_PERIODO}</p>
  }
  const conPct = op.datos?.includes('pct')
  const conHuecos = op.datos?.includes('huecos')
  if (!conPct && !conHuecos) return <p className="ui-muted">Elige al menos un dato.</p>
  if (op.grafica === 'barras') {
    return (
      <div>
        {conPct && (
          <GraficaLibre
            grafica="barras"
            puntos={filas.map((fila) => ({
              label: fila.nombre || fila.codigo,
              value: fila.pct,
              color: fila.pct < 90 ? 'aviso' : 'exito',
            }))}
            unidad="%"
            dec={0}
            resaltarMax={false}
          />
        )}
        {conHuecos && (
          <p className="ui-muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {((total) => (total ? `${total} huecos registrados.` : 'Sin huecos en el periodo.'))(
              filas.reduce((total, fila) => total + (fila.huecos?.length ?? 0), 0),
            )}
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="ui-tabla-scroll">
      <table className="nc-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>Área</th>
            {conPct && <th>Disponibilidad</th>}
            {conHuecos && <th>Huecos</th>}
          </tr>
        </thead>
      <tbody>
        {filas.map((fila) => (
          <tr key={fila.codigo}>
            <td>{fila.nombre || fila.codigo}</td>
            <td>{fila.area || '—'}</td>
            {conPct && <td className="ui-num">{Number(fila.pct).toFixed(decimalesDe(op, 1))} %</td>}
            {conHuecos && (
              <td className="ui-num">
                {fila.huecos?.length
                  ? `${fila.huecos[0].minutos} min (${fila.huecos.length})`
                  : '—'}
              </td>
            )}
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  )
}

function Incidentes({ c, op, areas }) {
  if (!c.incidentes) return sinDatosNuevo()
  const filas = c.incidentes.filter((fila) => pasaFiltro(op, fila.dispositivo_codigo, areaNumDe(fila, areas)))
  if (!filas.length) {
    const { areas: porArea, dispositivos } = filtroDe(op)
    return <p className="ui-muted">{porArea.length || dispositivos.length ? SIN_DATOS_FILTRO : SIN_DATOS_PERIODO}</p>
  }
  const nivel = (valor) => (valor === 'PELIGRO' ? 'danger' : 'warning')
  if (op.grafica === 'lista') {
    return (
      <ul className="ui-dash__lista">
        {filas.map((fila, i) => (
          <li key={`${fila.dispositivo_codigo}-${fila.variable}-${fila.inicio}-${i}`}>
            <Icon name="triangle-alert" size={16} />
            <span style={{ flex: 1 }}>
              <strong>{fila.dispositivo}</strong> · {fila.variable_nombre || nombreVariable(fila.variable)} ·{' '}
              {fechaLarga(fila.inicio)} {hora(fila.inicio)}
            </span>
            <span className="ui-muted">{Number(fila.duracion_min).toFixed(1)} min</span>
            <Badge tone={nivel(fila.nivel)}>{fila.nivel === 'PELIGRO' ? 'Peligro' : 'Advertencia'}</Badge>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className="ui-tabla-scroll">
      <table className="nc-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>Variable</th>
            <th>Inicio</th>
            <th>Duración</th>
            <th>Pico</th>
            <th>Nivel</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={`${fila.dispositivo_codigo}-${fila.variable}-${fila.inicio}-${i}`}>
              <td>{fila.dispositivo}</td>
              <td>{fila.variable_nombre || nombreVariable(fila.variable)}</td>
              <td>{fechaLarga(fila.inicio)} {hora(fila.inicio)}</td>
              <td className="ui-num">{Number(fila.duracion_min).toFixed(1)} min</td>
              <td className="ui-num">
                {Number(fila.valor_pico).toFixed(decimalesDe(op, VARIABLE[fila.variable]?.decimales ?? 1))} {UNIDAD[fila.variable] ?? ''}
              </td>
              <td>{fila.nivel === 'PELIGRO' ? 'Peligro' : 'Advertencia'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Observaciones({ c, op, areas }) {
  if (!c.observaciones) return sinDatosNuevo()
  const filas = c.observaciones.filter((fila) => pasaFiltro(op, fila.dispositivo_codigo, areaNumDe(fila, areas)))
  if (!filas.length) {
    const { areas: porArea, dispositivos } = filtroDe(op)
    return <p className="ui-muted">{porArea.length || dispositivos.length ? SIN_DATOS_FILTRO : 'Sin observaciones en el periodo.'}</p>
  }
  if (op.grafica === 'tabla') {
    return (
      <div className="ui-tabla-scroll ui-tabla-observaciones">
        <table className="nc-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Dispositivo</th>
              <th>Variable</th>
              <th>Quién</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={`${fila.fecha}-${i}`}>
                <td>{fechaLarga(fila.fecha)} {hora(fila.fecha)}</td>
                <td>{fila.dispositivo}</td>
                <td>{fila.variable_nombre || fila.variable}</td>
                <td>{fila.usuario}</td>
                <td className="ui-observacion__texto">{fila.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <ul className="ui-dash__lista">
      {filas.map((fila, i) => (
        <li key={`${fila.fecha}-${i}`}>
          <Icon name="message-square-text" size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>{fila.dispositivo}</strong> · {fila.variable_nombre || fila.variable} · {fila.usuario}
            <span className="ui-muted ui-observacion__texto" style={{ display: 'block', fontSize: 11, whiteSpace: 'normal' }}>
              {fechaLarga(fila.fecha)} {hora(fila.fecha)} · {fila.texto}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Personalizada({ w, r, op, areas }) {
  const c = r.cifras
  if (w.fuente === 'cumplimiento') return <Cumplimiento c={c} op={op} />
  if (w.fuente === 'comparativo') return <Comparativo c={c} op={op} />
  if (w.fuente === 'dispositivos') return <Dispositivos c={c} op={op} areas={areas} />
  if (w.fuente === 'gestion_alertas') return <GestionAlertas c={c} op={op} />
  if (w.fuente === 'disponibilidad') return <Disponibilidad c={c} op={op} areas={areas} />
  if (w.fuente === 'incidentes') return <Incidentes c={c} op={op} areas={areas} />
  if (w.fuente === 'observaciones') return <Observaciones c={c} op={op} areas={areas} />
  if (w.fuente === 'serie') {
    if (!c.serie) return <p className="ui-muted">Este reporte no tiene datos del periodo.</p>
    const v = c.serie.variable
    return (
      <GraficaLibre
        alto={op.alto}
        grafica={op.grafica}
        puntos={c.serie.puntos.map(([label, value]) => ({ label, value }))}
        unidad={UNIDAD[v]}
        dec={decimalesDe(op, VARIABLE[v].decimales)}
      />
    )
  }
  if (w.fuente === 'alertas')
    return (
      <GraficaLibre
        alto={op.alto}
        grafica={op.grafica}
        puntos={c.variables.map((v) => ({ label: VARIABLE[v.variable].corta, value: v.alertas }))}
        dec={0}
        color="alerta"
      />
    )
  if (w.fuente === 'resumen') {
    const campos = Object.keys(CAMPO).filter((k) => op.datos.includes(k))
    if (!campos.length) return <p className="ui-muted">Elige al menos un dato.</p>
    return (
      <table className="nc-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Variable</th>
            {campos.map((k) => (
              <th key={k}>{CAMPO[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.variables.map((v) => (
            <tr key={v.variable}>
              <td>
                <strong className="ui-strong">{VARIABLE[v.variable].corta}</strong>
                <span className="ui-muted"> · {UNIDAD[v.variable]}</span>
              </td>
              {campos.map((k) => (
                <td key={k} className="ui-num">
                  {k === 'alertas' ? v.alertas : Number(v[k]).toFixed(decimalesDe(op, VARIABLE[v.variable].decimales))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const v = c.variables.find((x) => x.variable === w.fuente.slice(4))
  if (!v) return <p className="ui-muted">Sin datos de esta variable en el periodo.</p>
  const u = UNIDAD[v.variable]
  return (
    <GraficaLibre
      alto={op.alto}
      grafica={op.grafica}
      puntos={Object.keys(CAMPO)
        .filter((k) => op.datos.includes(k))
        .map((k) => ({ label: CAMPO[k], value: Number(v[k]), unidad: k === 'alertas' ? '' : u }))}
      unidad={u}
      dec={decimalesDe(op, VARIABLE[v.variable].decimales)}
    />
  )
}

// Contenido de una tarjeta: título (si lleva) y cuerpo, según sus opciones.
function contenido(w, r, op, areas) {
  const c = r.cifras
  const propio = op.titulo?.trim()
  // Cifras clave y Análisis añadidos a mano se dibujan igual que los de siempre.
  const tipo = w.fuente === 'cifras' || w.fuente === 'analisis' ? w.fuente : w.id
  if (w.fuente && tipo === w.id)
    return { titulo: propio || w.nombre, cuerpo: <Personalizada w={w} r={r} op={op} areas={areas} /> }
  if (tipo === 'cifras') return { titulo: propio, cuerpo: <Cifras r={r} op={op} /> }
  if (w.id.startsWith('var:'))
    return {
      titulo: propio,
      cuerpo: <TarjetaVariable v={c.variables.find((v) => v.variable === w.id.slice(4))} op={op} />,
    }
  if (w.id === 'serie')
    return {
      titulo: propio || (c.serie ? `${c.serie.etiqueta} · ${UNIDAD[c.serie.variable]}` : 'Gráfica del periodo'),
      cuerpo: c.serie ? <Serie serie={c.serie} op={op} /> : <p className="ui-muted">Este reporte no tiene gráfica.</p>,
    }
  if (w.id === 'alertas')
    return {
      titulo: propio || 'Alertas por variable',
      cuerpo: <Alertas variables={c.variables} op={op} />,
    }
  return {
    titulo: propio || (w.fuente ? w.nombre : 'Análisis'),
    cuerpo: (
      <div className="ui-dash__texto">
        {op.datos.includes('texto') && r.contenido.split('\n\n').map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
        {op.datos.includes('pie') && (
          <span className="ui-muted ui-dash__pie">
            <Icon name="sparkles" size={14} /> Texto redactado con IA a partir de {miles(c.lecturas)} lecturas.
          </span>
        )}
      </div>
    ),
  }
}

export function Widget({ w, r, op, areas = [] }) {
  const { titulo, cuerpo } = contenido(w, r, op, areas)
  return (
    <section className="ui-dash__widget" data-ancho={op.ancho ?? w.ancho} style={op.alto ? { minHeight: op.alto } : undefined}>
      {titulo && (
        <div className="ui-dash__widget-cabeza">
          <h3>{titulo}</h3>
        </div>
      )}
      {cuerpo}
      {op.nota && <p className="ui-dash__nota">{op.nota}</p>}
    </section>
  )
}

// Formulario para añadir una tarjeta: qué datos muestra, cómo se llama y su gráfica.
function NuevaTarjeta({ agregar, cerrar }) {
  const [fuente, setFuente] = useState('var:TEMP')
  const [nombre, setNombre] = useState('')
  const [op, setOp] = useState(() => opcionesNuevas('var:TEMP'))
  const elegirFuente = (f) => {
    setFuente(f)
    setOp(opcionesNuevas(f))
  }
  return (
    <div className="ui-editor__nueva">
      <strong style={{ fontSize: 14 }}>Nueva tarjeta</strong>
      <fieldset>
        <legend>Datos</legend>
        <div className="ui-editor__chips">
          {Object.entries(FUENTES).map(([f, info]) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={fuente === f}
              className={`ui-editor__chip${fuente === f ? ' is-activo' : ''}`}
              onClick={() => elegirFuente(f)}
            >
              {info.nombre}
            </button>
          ))}
        </div>
      </fieldset>
      {[...FUENTES[fuente].opciones, ANCHO].map((o) => (
        <fieldset key={o.clave}>
          <legend>{o.etiqueta}</legend>
          <div className="ui-editor__chips">
            {o.valores.map(([valor, etiqueta]) => {
              const activo = o.tipo === 'uno' ? op[o.clave] === valor : op[o.clave].includes(valor)
              return (
                <button
                  key={valor}
                  type="button"
                  role={o.tipo === 'uno' ? 'radio' : 'checkbox'}
                  aria-checked={activo}
                  className={`ui-editor__chip${activo ? ' is-activo' : ''}`}
                  onClick={() =>
                    setOp({
                      ...op,
                      [o.clave]:
                        o.tipo === 'uno' ? valor : activo ? op[o.clave].filter((x) => x !== valor) : [...op[o.clave], valor],
                    })
                  }
                >
                  {activo && o.tipo === 'varios' && <Check size={13} />}
                  {etiqueta}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <label className="ui-editor__campo">
        <span>Título</span>
        <input value={nombre} placeholder={FUENTES[fuente].nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="ui-editor__nueva-acciones">
        <button type="button" className="ui-editor__chip" onClick={cerrar}>
          Cancelar
        </button>
        <button
          type="button"
          className="ui-editor__chip is-activo"
          onClick={() => {
            agregar(fuente, nombre.trim() || FUENTES[fuente].nombre, op)
            cerrar()
          }}
        >
          <Plus size={13} /> Añadir tarjeta
        </button>
      </div>
    </div>
  )
}

// Campo de opción de la hoja (tamaño, orientación o largo del análisis).
function CampoHoja({ clave, etiqueta, valores, porOmision, hoja, cambiarHoja }) {
  return (
    <fieldset>
      <legend>{etiqueta}</legend>
      <div className="ui-editor__chips">
        {valores.map(([valor, texto]) => {
          const activo = (hoja[clave] ?? porOmision) === valor
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={activo}
              className={`ui-editor__chip${activo ? ' is-activo' : ''}`}
              onClick={() => cambiarHoja({ [clave]: valor })}
            >
              {texto}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

// Lista de tarjetas con sus opciones; ocupa el lugar de la lista de reportes mientras se edita.
export function ListaTarjetas({ ed, areas = [], r = null }) {
  const { borrador, abierta, setAbierta, arrastre, mover, alternar, opcion, agregar, quitar, cambiarHoja } = ed
  const [nueva, setNueva] = useState(false)
  const hoja = borrador.hoja ?? {}
  const firmas = hoja.firmas ?? {}
  const cambiarFirma = (campo, clave, valor) =>
    cambiarHoja({
      firmas: {
        ...firmas,
        [campo]: { ...(firmas[campo] ?? {}), [clave]: valor },
      },
    })
  const equipos = new Map()
  for (const fila of r?.cifras?.por_dispositivo ?? []) {
    equipos.set(fila.codigo, fila.nombre || fila.codigo)
  }
  for (const [codigo, info] of Object.entries(r?.cifras?.disponibilidad ?? {})) {
    equipos.set(codigo, info.nombre || codigo)
  }
  const opcionesDispositivos = [...equipos].map(([codigo, nombre]) => ({ codigo, nombre }))
  return (
    <div className="ui-editor__lista nc-scroll">
      <span className="ui-eyebrow">Tarjetas</span>
      <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: '18px' }}>
        Arrastra para ordenar, usa el ojo para mostrar u ocultar y el ajuste para elegir la gráfica y la información.
      </p>
      <fieldset className="ui-editor__hoja">
        <legend>Hoja</legend>
        <CampoHoja clave="tamano" etiqueta="Tamaño" valores={[['carta', 'Carta'], ['a4', 'A4']]} porOmision="carta" hoja={hoja} cambiarHoja={cambiarHoja} />
        <CampoHoja
          clave="orientacion"
          etiqueta="Orientación"
          valores={[['vertical', 'Vertical'], ['horizontal', 'Horizontal']]}
          porOmision="vertical"
          hoja={hoja}
          cambiarHoja={cambiarHoja}
        />
        <CampoHoja
          clave="analisis_largo"
          etiqueta="Largo del análisis"
          valores={[['breve', 'Breve'], ['normal', 'Normal'], ['detallado', 'Detallado']]}
          porOmision="normal"
          hoja={hoja}
          cambiarHoja={cambiarHoja}
        />
        <label className="ui-editor__casilla">
          <input
            type="checkbox"
            checked={hoja.portada ?? false}
            onChange={(e) => cambiarHoja({ portada: e.target.checked })}
          />
          <span>Portada con logo, alcance y periodo</span>
        </label>
        <div className="ui-editor__firmas">
          {[
            ['elaboro', 'Elaboró'],
            ['reviso', 'Revisó'],
          ].map(([campo, etiqueta]) => (
            <div key={campo}>
              <strong>{etiqueta}</strong>
              <input
                value={firmas[campo]?.nombre ?? ''}
                placeholder="Nombre"
                onChange={(e) => cambiarFirma(campo, 'nombre', e.target.value)}
              />
              <input
                value={firmas[campo]?.cargo ?? ''}
                placeholder="Cargo"
                onChange={(e) => cambiarFirma(campo, 'cargo', e.target.value)}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <label className="ui-editor__casilla">
        <input
          type="checkbox"
          checked={borrador.hoja?.adjuntar_csv ?? false}
          onChange={(e) => cambiarHoja({ adjuntar_csv: e.target.checked })}
        />
        <span>Adjuntar CSV de lecturas al correo</span>
      </label>
      <ol>
        {borrador.orden.map((id, i) => {
          const w = tarjeta(borrador, id)
          const oculto = borrador.ocultos.includes(id)
          const { className, ...props } = arrastre(id, 'y')
          const op = opcionesDe(borrador, id)
          const abiertaAqui = abierta === id
          return (
            <li
              key={id}
              className={`ui-editor__item${oculto ? ' is-oculto' : ''}${abiertaAqui ? ' is-abierta' : ''} ${className}`}
              {...props}
            >
              <div className="ui-editor__fila">
                <GripVertical size={16} className="ui-editor__asa" aria-hidden />
                <span className="ui-editor__nombre">{w.nombre}</span>
                <button
                  type="button"
                  aria-label={`Opciones de ${w.nombre}`}
                  aria-expanded={abiertaAqui}
                  className={abiertaAqui ? 'is-activo' : undefined}
                  onClick={() => setAbierta(abiertaAqui ? null : id)}
                >
                  <SlidersHorizontal size={15} />
                </button>
                <button type="button" aria-label={`Subir ${w.nombre}`} disabled={i === 0} onClick={() => mover(id, -1)}>
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${w.nombre}`}
                  disabled={i === borrador.orden.length - 1}
                  onClick={() => mover(id, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  aria-label={oculto ? `Mostrar ${w.nombre}` : `Ocultar ${w.nombre}`}
                  aria-pressed={!oculto}
                  onClick={() => alternar(id)}
                >
                  {oculto ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {abiertaAqui && (
                <div className="ui-editor__opciones" draggable onDragStart={(e) => e.preventDefault()}>
                  {esquema(borrador, id).map((o) => (
                    <fieldset key={o.clave}>
                      <legend>{o.etiqueta}</legend>
                      <div className="ui-editor__chips">
                        {o.valores.map(([valor, etiqueta]) => {
                          const activo = o.tipo === 'uno' ? op[o.clave] === valor : op[o.clave].includes(valor)
                          return (
                            <button
                              key={valor}
                              type="button"
                              role={o.tipo === 'uno' ? 'radio' : 'checkbox'}
                              aria-checked={activo}
                              className={`ui-editor__chip${activo ? ' is-activo' : ''}`}
                              onClick={() =>
                                opcion(
                                  id,
                                  o.clave,
                                  o.tipo === 'uno'
                                    ? valor
                                    : activo
                                      ? op[o.clave].filter((x) => x !== valor)
                                      : [...op[o.clave], valor],
                                )
                              }
                            >
                              {activo && o.tipo === 'varios' && <Check size={13} />}
                              {etiqueta}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  ))}
                  <label className="ui-editor__campo">
                    <span>Título</span>
                    <input
                      value={op.titulo ?? ''}
                      maxLength={TITULO_MAX}
                      placeholder={w.nombre}
                      onChange={(e) => opcion(id, 'titulo', e.target.value)}
                    />
                  </label>
                  <label className="ui-editor__campo">
                    <span>Nota al pie</span>
                    <textarea
                      value={op.nota ?? ''}
                      maxLength={NOTA_MAX}
                      rows={2}
                      onChange={(e) => opcion(id, 'nota', e.target.value)}
                    />
                  </label>
                  <fieldset>
                    <legend>Decimales</legend>
                    <div className="ui-editor__chips">
                      {[0, 1, 2].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={op.decimales === n}
                          className={`ui-editor__chip${op.decimales === n ? ' is-activo' : ''}`}
                          onClick={() => opcion(id, 'decimales', n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {w.fuente && FUENTES_CON_FILTRO.has(w.fuente) && (
                    <fieldset>
                      <legend>Filtro de la tarjeta</legend>
                      <p className="ui-muted" style={{ margin: '0 0 6px', fontSize: 12 }}>
                        Solo esta tarjeta usa la parte elegida del alcance.
                      </p>
                      <div className="ui-editor__chips">
                        {areas.map((a) => {
                          const activo = op.filtro?.areas?.includes(a.num)
                          return (
                            <button
                              key={`area-${a.num}`}
                              type="button"
                              role="checkbox"
                              aria-checked={Boolean(activo)}
                              className={`ui-editor__chip${activo ? ' is-activo' : ''}`}
                              onClick={() => {
                                const actuales = op.filtro?.areas ?? []
                                const siguientes = activo
                                  ? actuales.filter((x) => x !== a.num)
                                  : [...actuales, a.num]
                                opcion(id, 'filtro', siguientes.length ? { areas: siguientes } : undefined)
                              }}
                            >
                              {activo && <Check size={13} />}
                              {a.nombre}
                            </button>
                          )
                        })}
                      </div>
                      <div className="ui-editor__chips" style={{ marginTop: 6 }}>
                        {opcionesDispositivos.map((d) => {
                          const activo = op.filtro?.dispositivos?.includes(d.codigo)
                          return (
                            <button
                              key={`disp-${d.codigo}`}
                              type="button"
                              role="checkbox"
                              aria-checked={Boolean(activo)}
                              className={`ui-editor__chip${activo ? ' is-activo' : ''}`}
                              onClick={() => {
                                const actuales = op.filtro?.dispositivos ?? []
                                const siguientes = activo
                                  ? actuales.filter((x) => x !== d.codigo)
                                  : [...actuales, d.codigo]
                                opcion(
                                  id,
                                  'filtro',
                                  siguientes.length ? { dispositivos: siguientes } : undefined,
                                )
                              }}
                            >
                              {activo && <Check size={13} />}
                              {d.nombre}
                            </button>
                          )
                        })}
                      </div>
                      {op.filtro && (
                        <button type="button" className="ui-editor__chip" onClick={() => opcion(id, 'filtro', undefined)}>
                          <RotateCcw size={13} /> Quitar filtro
                        </button>
                      )}
                    </fieldset>
                  )}
                  {op.alto && (
                    <button type="button" className="ui-editor__chip" onClick={() => opcion(id, 'alto', undefined)}>
                      <RotateCcw size={13} /> Alto automático
                    </button>
                  )}
                  {w.fuente && (
                    <button type="button" className="ui-editor__quitar" onClick={() => quitar(id)}>
                      <Trash2 size={14} /> Eliminar tarjeta
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {nueva ? (
        <NuevaTarjeta agregar={agregar} cerrar={() => setNueva(false)} />
      ) : (
        <button type="button" className="ui-editor__anadir" onClick={() => setNueva(true)}>
          <Plus size={16} /> Añadir tarjeta
        </button>
      )}
    </div>
  )
}

// Medidas de las hojas a 96 ppp: carta (8.5 × 11 in) y A4 (210 × 297 mm), en píxeles.
const MEDIDAS = {
  carta: { vertical: [816, 1056], horizontal: [1056, 816] },
  a4: { vertical: [794, 1123], horizontal: [1123, 794] },
}
function medidaHoja(hoja = {}) {
  const [ancho, alto] = MEDIDAS[hoja.tamano]?.[hoja.orientacion] ?? MEDIDAS.carta.vertical
  return { ancho, alto, margenY: 56, pie: 28, separacion: 16 }
}

// Agrupa las tarjetas en filas de 12 columnas según su ancho, como las acomoda la hoja.
function agrupar(bloques) {
  const filas = []
  let fila = []
  let suma = 0
  for (const b of bloques) {
    const ancho = Number(b.ancho) || 12
    if (suma + ancho > 12) {
      filas.push(fila)
      fila = []
      suma = 0
    }
    fila.push(b)
    suma += ancho
  }
  if (fila.length) filas.push(fila)
  return filas
}

// Reparte las filas en páginas según su alto medido; la primera página lleva la cabecera.
function paginar(altos, nFilas, medida) {
  if (!altos || altos.filas.length !== nFilas) return [[...Array(nFilas).keys()]]
  const util = medida.alto - medida.margenY * 2 - medida.pie
  const paginas = [[]]
  let libre = util - altos.cabeza - medida.separacion
  altos.filas.forEach((h, i) => {
    const pagina = paginas[paginas.length - 1]
    const ocupa = h + (pagina.length ? medida.separacion : 0)
    if (ocupa > libre && pagina.length) {
      paginas.push([i])
      libre = util - h
    } else {
      pagina.push(i)
      libre -= ocupa
    }
  })
  return paginas
}

// Hojas A4 de la vista previa. Mide las filas en una copia oculta, las reparte en páginas
// sin cortar ninguna y, si la columna es más angosta que la hoja, reduce todo a escala.
// `zoom` fija la escala (visor de Nico AI); sin él la hoja se ajusta al ancho disponible.
function Paginas({ cabeza, bloques, vacio, editando, zoom, alEscalar, hoja, portada, firmas, marca }) {
  const medidor = useRef(null)
  const marco = useRef(null)
  const [altos, setAltos] = useState(null)
  const [escala, setEscala] = useState(1)
  const filas = agrupar(bloques)
  const medida = medidaHoja(hoja)

  useLayoutEffect(() => {
    const el = medidor.current
    const medir = () => {
      const cab = el.querySelector('[data-cabeza]')?.offsetHeight ?? 0
      const fs = [...el.querySelectorAll('[data-fila]')].map((x) => x.offsetHeight)
      setAltos((prev) => (prev && prev.cabeza === cab && prev.filas.join() === fs.join() ? prev : { cabeza: cab, filas: fs }))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  })

  useLayoutEffect(() => {
    const visor = marco.current.parentElement
    const ajustar = () => setEscala(Math.min(1, (visor.clientWidth - 48) / medida.ancho))
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(visor)
    return () => obs.disconnect()
  }, [medida.ancho])

  // Avisa la escala de ajuste a quien la muestre (el zoom del visor de Nico AI).
  useEffect(() => {
    alEscalar?.(escala)
  }, [escala, alEscalar])

  const paginas = paginar(altos, filas.length, medida)
  const fila = (i) => (
    <div key={filas[i].map((b) => b.id).join()} className="ui-dash__rejilla" data-fila>
      {filas[i].map((b) => b.nodo)}
    </div>
  )
  const estilo = { width: medida.ancho, minHeight: medida.alto, '--reporte-marca': marca }
  return (
    <>
      <div ref={medidor} className="ui-hoja ui-hoja--medidor" style={estilo} aria-hidden>
        <div data-cabeza>{cabeza}</div>
        {filas.map((_, i) => fila(i))}
      </div>
      <div ref={marco} className={`ui-paginas${editando ? ' is-editando' : ''}`} style={{ zoom: zoom ?? escala }}>
        {portada && (
          <article className="ui-hoja ui-hoja--portada" style={estilo} aria-label="Portada">
            {portada}
          </article>
        )}
        {paginas.map((p, n) => (
          <article key={n} className="ui-hoja" style={estilo} aria-label={`Página ${n + 1} de ${paginas.length}`}>
            {n === 0 && cabeza}
            {n === 0 && !filas.length && vacio}
            {p.map(fila)}
            {n === paginas.length - 1 && firmas}
            <footer className="ui-hoja__pie">
              <span>
                <strong>Núcleo</strong> · Reporte de monitoreo ambiental
              </span>
              <span>
                Página {n + 1} de {paginas.length}
              </span>
            </footer>
          </article>
        ))}
      </div>
    </>
  )
}

// Cambia el ancho (arrastrando el borde derecho, en pasos de 4, 6, 8 o 12 columnas) o el
// alto (arrastrando el borde inferior) de una tarjeta.
function redimensionar(e, id, eje, opcion) {
  e.preventDefault()
  e.stopPropagation()
  const tarjetaEl = e.currentTarget.parentElement
  const caja = tarjetaEl.getBoundingClientRect()
  const fila = tarjetaEl.closest('[data-fila]').getBoundingClientRect()
  const escala = caja.height / tarjetaEl.offsetHeight || 1
  const alto0 = tarjetaEl.offsetHeight
  const y0 = e.clientY
  const mover = (ev) => {
    if (eje === 'ancho') {
      const cols = ((ev.clientX - caja.left) / fila.width) * 12
      const n = [4, 6, 8, 12].reduce((a, b) => (Math.abs(b - cols) < Math.abs(a - cols) ? b : a))
      opcion(id, 'ancho', String(n))
    } else opcion(id, 'alto', Math.round(Math.max(80, alto0 + (ev.clientY - y0) / escala)))
  }
  const soltar = () => {
    window.removeEventListener('mousemove', mover)
    window.removeEventListener('mouseup', soltar)
  }
  window.addEventListener('mousemove', mover)
  window.addEventListener('mouseup', soltar)
}

// Tarjetas de la hoja en modo edición: se arrastran, se eligen, se ocultan y cambian de tamaño.
function bloquesEdicion(r, ed, areas) {
  const { borrador, abierta, setAbierta, arrastre, alternar, opcion } = ed
  return borrador.orden
    .filter((id) => !borrador.ocultos.includes(id))
    .map((id) => {
      const w = tarjeta(borrador, id)
      const op = opcionesDe(borrador, id)
      const ancho = Number(op.ancho ?? w.ancho)
      const { className, ...props } = arrastre(id, 'x')
      return {
        id,
        ancho,
        nodo: (
          <div
            key={id}
            className={`ui-editor__tarjeta${abierta === id ? ' is-elegida' : ''} ${className}`}
            data-ancho={ancho}
            onClick={() => setAbierta(id)}
            {...props}
          >
            <div className="ui-editor__etiqueta">
              <GripVertical size={14} aria-hidden /> {w.nombre}
              <button
                type="button"
                aria-label={`Ocultar ${w.nombre}`}
                onClick={(e) => {
                  e.stopPropagation()
                  alternar(id)
                }}
              >
                <EyeOff size={14} />
              </button>
            </div>
            <Widget w={w} r={r} op={op} areas={areas} />
            <span
              className="ui-editor__asa-ancho"
              title="Arrastra para cambiar el ancho"
              onMouseDown={(e) => redimensionar(e, id, 'ancho', opcion)}
            />
            <span
              className="ui-editor__asa-alto"
              title="Arrastra para cambiar el alto"
              onMouseDown={(e) => redimensionar(e, id, 'alto', opcion)}
            />
          </div>
        ),
      }
    })
}

// Vista previa del reporte tal como sale en el PDF. Con `ed.editando` las tarjetas se pueden
// arrastrar y elegir; la elección vale para todos los reportes en este navegador.
export function DashboardReporte({ r, areas, ed, zoom, alEscalar }) {
  const c = r.cifras
  const origen = ORIGEN[r.origen] ?? ORIGEN.MANUAL
  const area =
    areas.find((a) => a.num === r.area)?.nombre ?? c.alcance ?? 'Todas las áreas'
  const hojaOrigen = ed.editando ? ed.borrador?.hoja : ed.conf.hoja
  const hoja = {
    tamano: 'carta',
    orientacion: 'vertical',
    portada: false,
    firmas: {},
    analisis_largo: 'normal',
    ...(hojaOrigen ?? {}),
  }
  const marca = r.organizacion_color || '#2BC47A'
  const logo = logoDe({ logo_url: r.organizacion_logo_url })
  const bloques = ed.editando
    ? bloquesEdicion(r, ed, areas)
    : ed.conf.orden
        .filter((id) => !ed.conf.ocultos.includes(id))
        .map((id) => {
          const w = tarjeta(ed.conf, id)
          const op = opcionesDe(ed.conf, id)
          return {
            id,
            ancho: Number(op.ancho ?? w.ancho),
            nodo: <Widget key={id} w={w} r={r} op={op} areas={areas} />,
          }
        })

  const cabeza = (
    <header className="ui-hoja__cabeza">
      <div className="ui-hoja__membrete">
        <Logo size={18} />
        <span>Reporte de monitoreo ambiental</span>
        <span>{r.num ? `Folio R-${String(r.num).padStart(4, '0')}` : 'Vista previa'}</span>
      </div>
      <div>
        <h2>{c.titulo}</h2>
        <p className="ui-hoja__subtitulo">Periodo de {mesAnio(r.periodo_inicio)}</p>
      </div>
      <dl className="ui-hoja__ficha">
        <div>
          <dt>Área</dt>
          <dd>{area}</dd>
        </div>
        <div>
          <dt>Periodo</dt>
          <dd>{periodo(r.periodo_inicio, r.periodo_fin)}</dd>
        </div>
        <div>
          <dt>Dispositivos</dt>
          <dd>{c.dispositivos.join(', ')}</dd>
        </div>
        <div>
          <dt>Generado</dt>
          <dd>
            {fechaLarga(r.fecha_generacion)}, {hora(r.fecha_generacion)} · {origen.label}
          </dd>
        </div>
      </dl>
    </header>
  )

  const elaboro = hoja.firmas?.elaboro
  const portada = hoja.portada ? (
    <div className="ui-hoja__portada">
      <div className="ui-hoja__portada-marca">
        <Logo size={24} />
        {logo && <img src={logo} alt={`Logo de ${r.organizacion_nombre || 'la organización'}`} />}
      </div>
      <div className="ui-hoja__portada-cuerpo">
        <span className="ui-eyebrow">Reporte de monitoreo ambiental</span>
        <h2>{c.titulo}</h2>
        <span className="ui-hoja__portada-linea" />
        <dl>
          <div>
            <dt>Alcance</dt>
            <dd>{area}</dd>
          </div>
          <div>
            <dt>Periodo</dt>
            <dd>{periodo(r.periodo_inicio, r.periodo_fin)}</dd>
          </div>
          <div>
            <dt>Generado</dt>
            <dd>
              {fechaLarga(r.fecha_generacion)}, {hora(r.fecha_generacion)}
            </dd>
          </div>
          {elaboro?.nombre && (
            <div>
              <dt>Elaboró</dt>
              <dd>
                {elaboro.nombre}
                {elaboro.cargo ? ` · ${elaboro.cargo}` : ''}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  ) : null

  const firmas = (() => {
    const items = ['elaboro', 'reviso']
      .map((campo) => [campo, hoja.firmas?.[campo]])
      .filter(([, firma]) => firma?.nombre)
    if (!items.length) return null
    return (
      <div className="ui-hoja__firmas">
        {items.map(([campo, firma]) => (
          <div key={campo}>
            <span className="ui-hoja__firma-linea" />
            <strong>{firma.nombre}</strong>
            <small>{firma.cargo || (campo === 'elaboro' ? 'Elaboró' : 'Revisó')}</small>
            <span className="ui-eyebrow">{campo === 'elaboro' ? 'Elaboró' : 'Revisó'}</span>
          </div>
        ))}
      </div>
    )
  })()

  return (
    <Paginas
      zoom={zoom}
      alEscalar={alEscalar}
      cabeza={cabeza}
      bloques={bloques}
      editando={ed.editando}
      hoja={hoja}
      portada={portada}
      firmas={firmas}
      marca={marca}
      vacio={
        <p className="ui-muted">
          {ed.editando
            ? 'El formato está vacío. Muestra tarjetas desde la lista o usa «Añadir tarjeta».'
            : 'Todas las secciones están ocultas. Usa «Personalizar» para mostrarlas.'}
        </p>
      }
    />
  )
}
