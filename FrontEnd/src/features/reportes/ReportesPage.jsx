import { useState } from 'react'
import {
  BarChart, Badge, Button, Card, Icon, IconCircle, IconButton, Logo, Select, Skeleton,
} from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as organizacionesApi from '../../services/organizaciones'
import * as reportesApi from '../../services/reportes'
import { pagina, UNIDAD, VARIABLE } from '../../utils/convertir'
import { fechaLarga, hora, mesAnio, miles, periodo } from '../../utils/formato'

const FRECUENCIA = { DIARIA: 'Cada día 08:00', SEMANAL: 'Cada lunes 08:00', MENSUAL: 'Día 1 de cada mes' }

async function cargar() {
  const [r, p, a] = await Promise.all([reportesApi.lista(), reportesApi.programaciones(), organizacionesApi.areas()])
  return { reportes: pagina(r), programaciones: pagina(p), areas: pagina(a) }
}

function Vista({ r, areas }) {
  const c = r.cifras
  const serieVar = c.serie?.variable
  return (
    <article className="nc-card" style={{ flex: 'none', width: 640, boxSizing: 'border-box', padding: '48px 52px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={24} />
        <Button variant="secondary" size="sm" icon="download" onClick={() => window.open(r.archivo_pdf, '_blank')}>
          Descargar PDF
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="ui-eyebrow">
          Reporte · generado {fechaLarga(r.fecha_generacion)}, {hora(r.fecha_generacion)}
        </span>
        <h2 style={{ margin: 0, fontSize: 26, lineHeight: '32px', fontWeight: 700, letterSpacing: '-0.02em', textWrap: 'pretty' }}>
          {c.titulo} · {mesAnio(r.periodo_inicio)}
        </h2>
        <span className="ui-muted" style={{ fontSize: 13 }}>
          {periodo(r.periodo_inicio, r.periodo_fin)} · {areas.find((a) => a.num === r.area)?.nombre ?? 'Todas las áreas'} · {c.dispositivos.join(', ')}
        </span>
      </div>
      <table className="nc-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Mín</th>
            <th>Prom</th>
            <th>Máx</th>
            <th>Alertas</th>
          </tr>
        </thead>
        <tbody>
          {c.variables.map((v) => {
            const d = VARIABLE[v.variable].decimales
            const f = (x) => `${Number(x).toFixed(d)} ${UNIDAD[v.variable]}`
            return (
              <tr key={v.variable}>
                <td>
                  <strong className="ui-strong">{VARIABLE[v.variable].etiqueta}</strong>
                </td>
                <td className="ui-num">{f(v.minimo)}</td>
                <td className="ui-num">{f(v.promedio)}</td>
                <td className="ui-num">{f(v.maximo)}</td>
                <td className="ui-num ui-strong">{v.alertas}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {c.serie && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {c.serie.etiqueta} · {UNIDAD[serieVar]}
          </span>
          <BarChart
            data={c.serie.puntos.map(([label, value]) => ({ label, value }))}
            unit={UNIDAD[serieVar]}
            height={150}
            decimals={VARIABLE[serieVar].decimales}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14, lineHeight: '22px', color: 'var(--text-secondary)' }}>
        {r.contenido.split('\n\n').map((p) => (
          <p key={p.slice(0, 24)} style={{ margin: 0, textWrap: 'pretty' }}>
            {p}
          </p>
        ))}
      </div>
      <div className="ui-muted" style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12, lineHeight: '18px' }}>
        <Icon name="sparkles" size={16} />
        <span>Cifras calculadas a partir de {miles(c.lecturas)} lecturas registradas. El texto fue redactado con IA.</span>
      </div>
    </article>
  )
}

function NuevoReporte({ areas, cerrar, creado }) {
  const [area, setArea] = useState('')
  const [rango, setRango] = useState('mes')
  const [estado, setEstado] = useState(null)
  const crear = async () => {
    setEstado('enviando')
    const fin = new Date()
    const inicio = new Date(fin)
    if (rango === 'mes') inicio.setDate(1)
    else inicio.setDate(fin.getDate() - 7)
    try {
      const r = await reportesApi.crear({ area: area || null, periodo_inicio: inicio.toISOString(), periodo_fin: fin.toISOString() })
      creado(r)
    } catch (e) {
      setEstado(e.status === 503 ? 'El servicio de IA no está disponible. Intenta más tarde.' : 'No se pudo generar el reporte.')
    }
  }
  return (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Generar reporte">
      <div className="ui-modal__caja">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2>Generar reporte</h2>
            <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              Las cifras salen de las lecturas; el texto lo redacta la IA.
            </p>
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrar} />
        </div>
        <div className="ui-grid-2">
          <Select
            label="Área"
            icon="map-pin"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            options={[{ value: '', label: 'Todas las áreas' }, ...areas.map((a) => ({ value: String(a.num), label: a.nombre }))]}
          />
          <Select
            label="Periodo"
            icon="calendar"
            value={rango}
            onChange={(e) => setRango(e.target.value)}
            options={[
              { value: 'mes', label: 'Este mes' },
              { value: 'semana', label: 'Últimos 7 días' },
            ]}
          />
        </div>
        {estado && estado !== 'enviando' && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{estado}</p>
        )}
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button icon="sparkles" disabled={estado === 'enviando'} onClick={crear}>
            {estado === 'enviando' ? 'Generando…' : 'Generar reporte'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ReportesPage() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [elegido, setElegido] = useState(null)
  const [modal, setModal] = useState(false)
  const reportes = datos?.reportes ?? []
  const actual = reportes.find((r) => r.num === elegido) ?? reportes[0]
  const nombreArea = (n) => datos?.areas.find((a) => a.num === n)?.nombre ?? 'Todas las áreas'

  const cifras = datos
    ? {
        principal: { etiqueta: 'Reportes', valor: reportes.length + datos.programaciones.length, unidad: 'en total', sub: 'Cifras de las lecturas · texto redactado con IA' },
        cifras: [
          { etiqueta: 'Recientes', valor: reportes.length, tono: 'lima' },
          { etiqueta: 'Programados por correo', valor: datos.programaciones.filter((p) => p.activa).length },
        ],
      }
    : { principal: { etiqueta: 'Reportes', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow="Grupo Altamira · cifras del sistema, texto redactado con IA"
      titulo="Reportes"
      acciones={
        <Button icon="sparkles" onClick={() => setModal(true)}>
          Generar reporte
        </Button>
      }
      cifras={cifras}
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-fila" style={{ gridTemplateColumns: '400px minmax(0,1fr)' }}>
          <Card className="nc-grow">
            <div className="nc-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ui-eyebrow" style={{ padding: '12px 12px 6px' }}>
                Recientes
              </span>
              {reportes.map((r) => (
                <button
                  key={r.num}
                  type="button"
                  className={`ui-item ui-item--boton${actual?.num === r.num ? ' is-selected' : ''}`}
                  style={{ alignItems: 'flex-start', gap: 12, padding: 12 }}
                  onClick={() => setElegido(r.num)}
                >
                  <IconCircle name="file-text" size="sm" />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="ui-titulo-fila">
                      <strong style={{ fontSize: 14, lineHeight: '20px' }}>
                        {r.cifras.titulo.replace(/ en /, ' · ')}
                      </strong>
                      <span style={{ fontSize: 12, lineHeight: '16px' }}>{periodo(r.periodo_inicio, r.periodo_fin)}</span>
                    </div>
                    <div>
                      <Badge tone="success" icon="circle-check">
                        {r.origen === 'PROGRAMADO' ? 'Enviado por correo' : 'Listo'}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
              <span className="ui-eyebrow" style={{ padding: '12px 12px 6px' }}>
                Programados por correo
              </span>
              {datos.programaciones.map((p) => (
                <div key={p.num} className="ui-item" style={{ alignItems: 'flex-start', gap: 12, padding: 12 }}>
                  <IconCircle name="calendar-clock" size="sm" />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="ui-titulo-fila">
                      <strong style={{ fontSize: 14, lineHeight: '20px' }}>
                        Resumen {p.frecuencia.toLowerCase()} · {nombreArea(p.area)}
                      </strong>
                      <span style={{ fontSize: 12, lineHeight: '16px' }}>
                        {FRECUENCIA[p.frecuencia]} · a {p.destinatarios.length} responsables
                      </span>
                    </div>
                    <div>
                      <Badge tone="neutral" icon="calendar-clock">
                        Próximo {fechaLarga(p.proxima_ejecucion)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minWidth: 0, minHeight: 0, overflow: 'auto' }}>
            {actual && <Vista r={actual} areas={datos.areas} />}
          </div>
        </div>
      )}
      {modal && datos && (
        <NuevoReporte
          areas={datos.areas}
          cerrar={() => setModal(false)}
          creado={(r) => {
            actualizar((d) => ({ ...d, reportes: [r, ...d.reportes] }))
            setElegido(r.num)
            setModal(false)
          }}
        />
      )}
    </Pantalla>
  )
}
