import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, GripVertical, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { BarChart, Badge, Icon, Logo, TrendChart } from '../../design-system/componentes/index.js'
import { UNIDAD, VARIABLE } from '../../utils/convertir'
import { ANCHO, esquema, FUENTES, opcionesDe, opcionesNuevas, tarjeta } from './personalizacion'
import { fechaLarga, hora, mesAnio, miles, periodo } from '../../utils/formato'

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
  const d = info.decimales
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
// Alto de la gráfica según el alto elegido para la tarjeta (o el de siempre).
const altoGrafica = (alto) => (alto ? Math.max(90, alto - 70) : 150)

function Serie({ serie, op }) {
  const v = serie.variable
  const dec = VARIABLE[v].decimales
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
      />
    )
  if (op.grafica === 'linea') return <TrendChart data={datos} unit={UNIDAD[v]} height={altoGrafica(op.alto)} decimals={dec} />
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
export function GraficaLibre({ grafica, puntos, unidad, dec = 1, color, alto }) {
  if (!puntos.length) return <p className="ui-muted">Elige al menos un dato.</p>
  const max = Math.max(...puntos.map((x) => x.value)) || 1
  const f = (x) => Number(x).toFixed(dec)
  if (grafica === 'columnas') return <BarChart data={puntos} unit={unidad} height={altoGrafica(alto)} decimals={dec} />
  if (grafica === 'linea')
    return (
      <TrendChart data={puntos.map((x) => ({ ...x, time: x.label }))} unit={unidad} height={altoGrafica(alto)} decimals={dec} />
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
        <div key={x.label} className={`ui-barras__fila ui-barras__fila--ancha${x.value === max ? ' is-max' : ''}`}>
          <span className="ui-barras__etiqueta">{x.label}</span>
          <span className="ui-barras__pista">
            <span
              className={`ui-barras__barra${color ? ` ui-barras__barra--${color}` : ''}`}
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
function Personalizada({ w, r, op }) {
  const c = r.cifras
  if (w.fuente === 'serie') {
    if (!c.serie) return <p className="ui-muted">Este reporte no tiene datos del periodo.</p>
    const v = c.serie.variable
    return (
      <GraficaLibre
        alto={op.alto}
        grafica={op.grafica}
        puntos={c.serie.puntos.map(([label, value]) => ({ label, value }))}
        unidad={UNIDAD[v]}
        dec={VARIABLE[v].decimales}
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
                  {k === 'alertas' ? v.alertas : Number(v[k]).toFixed(VARIABLE[v.variable].decimales)}
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
      dec={VARIABLE[v.variable].decimales}
    />
  )
}

// Contenido de una tarjeta: título (si lleva) y cuerpo, según sus opciones.
function contenido(w, r, op) {
  const c = r.cifras
  // Cifras clave y Análisis añadidos a mano se dibujan igual que los de siempre.
  const tipo = w.fuente === 'cifras' || w.fuente === 'analisis' ? w.fuente : w.id
  if (w.fuente && tipo === w.id) return { titulo: w.nombre, cuerpo: <Personalizada w={w} r={r} op={op} /> }
  if (tipo === 'cifras') return { cuerpo: <Cifras r={r} op={op} /> }
  if (w.id.startsWith('var:'))
    return {
      cuerpo: <TarjetaVariable v={c.variables.find((v) => v.variable === w.id.slice(4))} op={op} />,
    }
  if (w.id === 'serie')
    return {
      titulo: c.serie ? `${c.serie.etiqueta} · ${UNIDAD[c.serie.variable]}` : 'Gráfica del periodo',
      cuerpo: c.serie ? <Serie serie={c.serie} op={op} /> : <p className="ui-muted">Este reporte no tiene gráfica.</p>,
    }
  if (w.id === 'alertas')
    return {
      titulo: 'Alertas por variable',
      cuerpo: <Alertas variables={c.variables} op={op} />,
    }
  return {
    titulo: w.fuente ? w.nombre : 'Análisis',
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

export function Widget({ w, r, op }) {
  const { titulo, cuerpo } = contenido(w, r, op)
  return (
    <section className="ui-dash__widget" data-ancho={op.ancho ?? w.ancho} style={op.alto ? { minHeight: op.alto } : undefined}>
      {titulo && (
        <div className="ui-dash__widget-cabeza">
          <h3>{titulo}</h3>
        </div>
      )}
      {cuerpo}
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

// Lista de tarjetas con sus opciones; ocupa el lugar de la lista de reportes mientras se edita.
export function ListaTarjetas({ ed }) {
  const { borrador, abierta, setAbierta, arrastre, mover, alternar, opcion, agregar, quitar } = ed
  const [nueva, setNueva] = useState(false)
  return (
    <div className="ui-editor__lista nc-scroll">
      <span className="ui-eyebrow">Tarjetas</span>
      <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: '18px' }}>
        Arrastra para ordenar, usa el ojo para mostrar u ocultar y el ajuste para elegir la gráfica y la información.
      </p>
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

// Medidas de una hoja A4 a 96 ppp (210 × 297 mm) y de sus márgenes, en píxeles.
const A4 = { ancho: 794, alto: 1123, margenY: 56, pie: 28, separacion: 16 }

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
function paginar(altos, nFilas) {
  if (!altos || altos.filas.length !== nFilas) return [[...Array(nFilas).keys()]]
  const util = A4.alto - A4.margenY * 2 - A4.pie
  const paginas = [[]]
  let libre = util - altos.cabeza - A4.separacion
  altos.filas.forEach((h, i) => {
    const pagina = paginas[paginas.length - 1]
    const ocupa = h + (pagina.length ? A4.separacion : 0)
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
function Paginas({ cabeza, bloques, vacio, editando, zoom, alEscalar }) {
  const medidor = useRef(null)
  const marco = useRef(null)
  const [altos, setAltos] = useState(null)
  const [escala, setEscala] = useState(1)
  const filas = agrupar(bloques)

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
    const ajustar = () => setEscala(Math.min(1, (visor.clientWidth - 48) / A4.ancho))
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(visor)
    return () => obs.disconnect()
  }, [])

  // Avisa la escala de ajuste a quien la muestre (el zoom del visor de Nico AI).
  useEffect(() => {
    alEscalar?.(escala)
  }, [escala, alEscalar])

  const paginas = paginar(altos, filas.length)
  const fila = (i) => (
    <div key={filas[i].map((b) => b.id).join()} className="ui-dash__rejilla" data-fila>
      {filas[i].map((b) => b.nodo)}
    </div>
  )
  return (
    <>
      <div ref={medidor} className="ui-hoja ui-hoja--medidor" aria-hidden>
        <div data-cabeza>{cabeza}</div>
        {filas.map((_, i) => fila(i))}
      </div>
      <div ref={marco} className={`ui-paginas${editando ? ' is-editando' : ''}`} style={{ zoom: zoom ?? escala }}>
        {paginas.map((p, n) => (
          <article key={n} className="ui-hoja" aria-label={`Página ${n + 1} de ${paginas.length}`}>
            {n === 0 && cabeza}
            {n === 0 && !filas.length && vacio}
            {p.map(fila)}
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
function bloquesEdicion(r, ed) {
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
            <Widget w={w} r={r} op={op} />
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

// Vista previa del reporte tal como sale en el PDF, en hojas A4. Con `ed.editando` las
// tarjetas se pueden arrastrar y elegir; la elección vale para todos los reportes en este navegador.
export function DashboardReporte({ r, areas, ed, zoom, alEscalar }) {
  const c = r.cifras
  const origen = ORIGEN[r.origen] ?? ORIGEN.MANUAL
  const area = areas.find((a) => a.num === r.area)?.nombre ?? 'Todas las áreas'
  const bloques = ed.editando
    ? bloquesEdicion(r, ed)
    : ed.conf.orden
        .filter((id) => !ed.conf.ocultos.includes(id))
        .map((id) => {
          const w = tarjeta(ed.conf, id)
          const op = opcionesDe(ed.conf, id)
          return { id, ancho: Number(op.ancho ?? w.ancho), nodo: <Widget key={id} w={w} r={r} op={op} /> }
        })

  const cabeza = (
    <header className="ui-hoja__cabeza">
      <div className="ui-hoja__membrete">
        <Logo size={18} />
        <span>Reporte de monitoreo ambiental</span>
        <span>Folio R-{String(r.num).padStart(4, '0')}</span>
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
  return (
    <Paginas
      zoom={zoom}
      alEscalar={alEscalar}
      cabeza={cabeza}
      bloques={bloques}
      editando={ed.editando}
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
