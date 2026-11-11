// Piezas de las respuestas de Nico AI que no pasan por la IA: una gráfica suelta, una comparativa,
// la elección de plantilla antes de generar un reporte, el resultado de una edición de plantilla
// y la lista de archivos generados en la conversación.
import { useEffect, useRef, useState } from 'react'
import { Button, Icon } from '../../design-system/componentes/index.js'
import { useSalida } from '../../hooks/useSalida'
import { GraficaLibre, Widget } from '../reportes/DashboardReporte'
import { formatoDeReporte, leerFormatos, opcionesDe, tarjeta } from '../reportes/personalizacion'
import { cifrasHoja } from '../../services/reportes'
import { periodo } from '../../utils/formato'

const VACIA = { orden: [], ocultos: [], opciones: {}, personalizadas: [] }
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const fmt = (v, unidad) =>
  v == null ? '—' : `${Number(v).toFixed(unidad === 'ppm' || !unidad ? 0 : 1)}${unidad ? ` ${unidad}` : ''}`
const NOMBRES = { serie: 'Gráfica del periodo', alertas: 'Alertas por variable', cifras: 'Cifras clave' }

// Un solo elemento de reporte (la misma tarjeta del PDF) con las cifras del periodo pedido.
export function GraficaChat({ g }) {
  const r = { cifras: cifrasHoja(g.cifras, { area: g.donde, variable: g.variable }), contenido: '' }
  const w = tarjeta(VACIA, g.elemento)
  const op = { ...opcionesDe(VACIA, g.elemento), ancho: '12', ...(g.elemento === 'serie' && { grafica: 'linea' }) }
  return (
    <figure className="ui-ia-pieza">
      <figcaption className="ui-ia-pieza__cabeza">
        <span className="ui-ia-pieza__icono">
          <Icon name={g.elemento === 'alertas' ? 'bell' : g.elemento === 'cifras' ? 'layout-grid' : 'activity'} size={15} />
        </span>
        <strong>{NOMBRES[g.elemento]}</strong>
        <span className="ui-muted">
          {g.donde} · {periodo(g.periodo_inicio, g.periodo_fin)}
        </span>
      </figcaption>
      <div className="ui-dash ui-ia-pieza__cuerpo">{w && <Widget w={w} r={r} op={op} />}</div>
    </figure>
  )
}

function Cambio({ a, b, unidad }) {
  if (a == null || b == null) return <span className="ui-muted">—</span>
  const d = a - b
  if (Math.abs(d) < 0.05) return <span className="ui-ia-cambio">igual</span>
  return (
    <span className={`ui-ia-cambio ${d > 0 ? 'is-sube' : 'is-baja'}`}>
      <Icon name={d > 0 ? 'arrow-up-right' : 'arrow-down-right'} size={13} />
      {fmt(Math.abs(d), unidad)}
    </span>
  )
}

// Comparativa de dos periodos (tabla con diferencias) o de los dispositivos del área (barras).
export function Comparativa({ c }) {
  if (c.tipo === 'dispositivos')
    return (
      <figure className="ui-ia-pieza">
        <figcaption className="ui-ia-pieza__cabeza">
          <span className="ui-ia-pieza__icono">
            <Icon name="cpu" size={15} />
          </span>
          <strong>Dispositivos de {c.donde}</strong>
          <span className="ui-muted">{c.descripcion}</span>
        </figcaption>
        <div className="ui-ia-pieza__cuerpo ui-ia-comparativa__dispositivos">
          {c.filas.map((f) => (
            <section key={f.variable}>
              <h4>{mayuscula(f.nombre)} promedio</h4>
              <GraficaLibre grafica="barras" unidad={f.unidad} puntos={f.puntos.map(([label, value]) => ({ label, value }))} />
            </section>
          ))}
          {c.alertas.length > 0 && (
            <section>
              <h4>Alertas</h4>
              <GraficaLibre grafica="barras" dec={0} color="alerta" puntos={c.alertas.map(([label, value]) => ({ label, value }))} />
            </section>
          )}
        </div>
      </figure>
    )
  return (
    <figure className="ui-ia-pieza">
      <figcaption className="ui-ia-pieza__cabeza">
        <span className="ui-ia-pieza__icono">
          <Icon name="activity" size={15} />
        </span>
        <strong>Comparativa · {c.donde}</strong>
      </figcaption>
      <div className="ui-ia-pieza__cuerpo">
        <table className="ui-ia-comparativa">
          <thead>
            <tr>
              <th>Promedio</th>
              <th>{mayuscula(c.columnas[0])}</th>
              <th>{mayuscula(c.columnas[1])}</th>
              <th>Cambio</th>
            </tr>
          </thead>
          <tbody>
            {c.filas.map((f) => (
              <tr key={f.variable}>
                <th scope="row">{mayuscula(f.nombre)}</th>
                <td className="ui-num">{fmt(f.a.promedio, f.unidad)}</td>
                <td className="ui-num">{fmt(f.b.promedio, f.unidad)}</td>
                <td>
                  <Cambio a={f.a.promedio} b={f.b.promedio} unidad={f.unidad} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">Alertas</th>
              <td className="ui-num">{c.alertas[0]}</td>
              <td className="ui-num">{c.alertas[1]}</td>
              <td>
                <Cambio a={c.alertas[0]} b={c.alertas[1]} unidad="" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  )
}

// Antes de generar un reporte con más de una plantilla: tarjetas para elegir, con sus elementos.
export function ElegirPlantilla({ p, activa, elegir }) {
  return (
    <div className="ui-ia-plantillas" role="list">
      {p.opciones.map((o) => (
        <button key={o.id} type="button" role="listitem" disabled={!activa} onClick={() => elegir(p.pregunta, o)}>
          <span className="ui-ia-plantillas__nombre">
            <Icon name="file-text" size={15} />
            <strong>{o.nombre}</strong>
            {o.estandar && <span className="ui-ia-plantillas__marca">Estándar</span>}
          </span>
          <span className="ui-ia-plantillas__elementos">
            {o.elementos.length ? o.elementos.map((e) => <span key={e}>{e}</span>) : <span>Sin elementos visibles</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

// Resultado de una edición de plantilla: la lista de elementos o los botones para ver y deshacer.
export function Edicion({ e, reporte, visualizar, deshacer }) {
  return (
    <div className="ui-ia-edicion">
      {e.elementos && (
        <ul className="ui-ia-edicion__lista">
          {e.elementos.map((x) => (
            <li key={x.id} className={x.visible ? '' : 'is-oculto'}>
              <Icon name={x.visible ? 'eye' : 'lock'} size={14} />
              <strong>{x.nombre}</strong>
              <span className="ui-muted">{x.visible ? x.detalle : 'oculto'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="ui-ia-siguientes">
        {reporte && (
          <Button variant="secondary" size="sm" icon="eye" onClick={() => visualizar(reporte)}>
            Ver el reporte
          </Button>
        )}
        {deshacer && (
          <Button variant="ghost" size="sm" icon="history" onClick={deshacer}>
            Deshacer
          </Button>
        )}
      </div>
    </div>
  )
}

// Botón de la barra del chat con los reportes generados en la conversación.
export function Archivos({ reportes, visualizar, descargar }) {
  const [abierto, setAbierto] = useState(false)
  const { montado, saliendo } = useSalida(abierto)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false)
    const tecla = (e) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])
  const formatos = leerFormatos()
  return (
    <div ref={caja} className="ui-ia-archivos">
      <button
        type="button"
        className="ui-ia-archivos__boton"
        aria-expanded={abierto}
        aria-label={`Archivos de la conversación (${reportes.length})`}
        title="Archivos de la conversación"
        disabled={!reportes.length}
        onClick={() => setAbierto((a) => !a)}
      >
        <Icon name="file-text" size={16} />
        <span>Archivos</span>
        {reportes.length > 0 && <span className="ui-ia-archivos__cuenta">{reportes.length}</span>}
      </button>
      {montado && (
        <div className={`ui-ia-archivos__lista${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-label="Archivos generados">
          <span className="ui-eyebrow">Generados en esta conversación</span>
          {reportes.map((r) => (
            <div key={r.num} className="ui-ia-archivos__fila">
              <span className="ui-ia-adjunto__icono">
                <Icon name="file-text" size={16} />
              </span>
              <span className="ui-ia-archivos__texto">
                <strong>{r.titulo ?? `R-${r.num}`}</strong>
                <span className="ui-muted">
                  {periodo(r.periodo_inicio, r.periodo_fin)} · {formatoDeReporte(formatos, r.num).nombre}
                </span>
              </span>
              <button
                type="button"
                className="ui-ia-icono"
                aria-label="Visualizar"
                title="Visualizar"
                onClick={() => {
                  setAbierto(false)
                  visualizar(r)
                }}
              >
                <Icon name="eye" size={16} />
              </button>
              <button type="button" className="ui-ia-icono" aria-label="Descargar PDF" title="Descargar PDF" onClick={() => descargar(r)}>
                <Icon name="download" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
