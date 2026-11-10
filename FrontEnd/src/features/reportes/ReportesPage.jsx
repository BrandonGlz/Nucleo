import { useSesion } from '../../context/SesionContext'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, IconCircle, IconButton, Skeleton,
} from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { DashboardReporte, ListaTarjetas } from './DashboardReporte'
import { ESTANDAR, useEdicion } from './personalizacion'
import { descargarPdf } from './pdf'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as organizacionesApi from '../../services/organizaciones'
import * as reportesApi from '../../services/reportes'
import { pagina } from '../../utils/convertir'
import { fechaLarga, periodo } from '../../utils/formato'

const FRECUENCIA = { DIARIA: 'Cada día 08:00', SEMANAL: 'Cada lunes 08:00', MENSUAL: 'Día 1 de cada mes' }

async function cargar() {
  const [r, p, a] = await Promise.all([reportesApi.lista(), reportesApi.programaciones(), organizacionesApi.areas()])
  return { reportes: pagina(r), programaciones: pagina(p), areas: pagina(a) }
}

// Generar un reporte eligiendo formato, área y periodo. «Nuevo formato» convierte el modal en
// el editor de formatos (tarjetas a la izquierda y hoja A4 de muestra a la derecha, con los
// datos del reporte seleccionado); al guardarlo queda elegido para este reporte.
const TODAS = 'todas'

function NuevoReporte({ areas, reportes, ed, muestra: elegido, cerrar, creado }) {
  const [area, setArea] = useState(null)
  const [rango, setRango] = useState('mes')
  const [formato, setFormato] = useState(ed.formato.id)
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState(null)
  const creando = ed.modo === 'nuevo' && ed.editando
  // La hoja de muestra del editor usa un reporte del área elegida, si ya hay uno.
  const muestra = reportes.find((r) => area && area !== TODAS && r.area === Number(area)) ?? elegido
  const crear = async () => {
    setEstado('enviando')
    const fin = new Date()
    const inicio = new Date(fin)
    if (rango === 'mes') inicio.setDate(1)
    else inicio.setDate(fin.getDate() - 7)
    try {
      // «Todas las áreas» genera un reporte por cada área, todos con el mismo formato.
      const destino = area === TODAS ? areas.map((a) => String(a.num)) : [area]
      const nuevos = []
      for (const a of destino)
        nuevos.push(await reportesApi.crear({ area: a, periodo_inicio: inicio.toISOString(), periodo_fin: fin.toISOString() }))
      creado(nuevos, formato)
    } catch (e) {
      setEstado(e.status === 503 ? 'El servicio de IA no está disponible. Intenta más tarde.' : 'No se pudo generar el reporte.')
    }
  }

  if (creando)
    return (
      <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Nuevo formato">
        <div className="ui-modal__caja ui-modal__caja--editor">
          <div className="ui-modal__cabeza-editor">
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2>Nuevo formato</h2>
              <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
                Elige las tarjetas, sus gráficas y sus datos. La hoja de la derecha usa los datos de «{muestra?.cifras.titulo}» como
                muestra.
              </p>
            </div>
            <label className="nc-field ui-formato-nombre">
              <span className="nc-field__label">Nombre del formato</span>
              <span className="nc-input">
                <input
                  autoFocus
                  value={nombre}
                  placeholder="p. ej. Resumen para dirección"
                  onChange={(e) => setNombre(e.target.value)}
                />
              </span>
            </label>
            <Button variant="ghost" onClick={ed.restablecer}>
              <RotateCcw size={16} /> Restablecer
            </Button>
            <Button variant="secondary" onClick={ed.cancelar}>
              Volver
            </Button>
            <Button
              icon="circle-check"
              disabled={!nombre.trim()}
              onClick={() => {
                setFormato(ed.crearFormato(nombre.trim()))
                setNombre('')
              }}
            >
              Guardar formato
            </Button>
          </div>
          <div className="ui-modal__editor">
            <div className="ui-modal__tarjetas">
              <ListaTarjetas ed={ed} />
            </div>
            <div className="ui-visor nc-scroll">{muestra && <DashboardReporte r={muestra} areas={areas} ed={ed} />}</div>
          </div>
        </div>
      </div>
    )

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
          <Desplegable
            label="Área"
            icon="map-pin"
            value={area}
            onChange={setArea}
            placeholder="Elige un área"
            options={[
              ...areas.map((a) => ({ value: String(a.num), label: a.nombre })),
              { value: TODAS, label: `Todas · ${areas.length} reportes` },
            ]}
          />
          <Desplegable
            label="Periodo"
            icon="calendar"
            value={rango}
            onChange={setRango}
            disabled={!area}
            options={[
              { value: 'mes', label: 'Este mes' },
              { value: 'semana', label: 'Últimos 7 días' },
            ]}
          />
        </div>
        <Desplegable
          label="Formato"
          icon="file-text"
          value={formato}
          onChange={setFormato}
          disabled={!area}
          options={ed.formatos.map((f) => ({ value: f.id, label: f.nombre }))}
          accion={{ label: 'Nuevo formato', icon: 'plus', onClick: ed.nuevo }}
        />
        {estado && estado !== 'enviando' && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{estado}</p>}
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button icon="sparkles" disabled={!area || estado === 'enviando'} onClick={crear}>
            {estado === 'enviando' ? 'Generando…' : area === TODAS ? `Generar ${areas.length} reportes` : 'Generar reporte'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ReportesPage() {
  const { organizacion } = useSesion()
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  // ?reporte=<num> abre ese reporte (lo usa Núcleo AI al generar uno).
  const [params] = useSearchParams()
  const [elegido, setElegido] = useState(() => Number(params.get('reporte')) || null)
  const [modal, setModal] = useState(false)
  const reportes = datos?.reportes ?? []
  const actual = reportes.find((r) => r.num === elegido) ?? reportes[0]
  const ed = useEdicion(actual?.num)
  // Mientras se crea un formato en el modal, la página de fondo sigue en vista normal.
  const edPagina = ed.modo === 'nuevo' ? { ...ed, editando: false } : ed
  const nombreArea = (n) => datos?.areas.find((a) => a.num === n)?.nombre ?? 'Todas las áreas'

  return (
    <Pantalla
      eyebrow={`${organizacion} · cifras del sistema, texto redactado con IA`}
      titulo="Reportes"
      acciones={
        <Button icon="sparkles" onClick={() => setModal(true)}>
          Generar reporte
        </Button>
      }
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-fila" style={{ gridTemplateColumns: '400px minmax(0,1fr)' }}>
          <div className="ui-col">
            {actual && (
              <Card>
                {edPagina.editando ? (
                  <>
                    <span className="ui-eyebrow">Personalizando el formato</span>
                    <strong className="ui-acciones-reporte__titulo">{ed.formato.nombre}</strong>
                    <div className="ui-acciones-reporte ui-acciones-reporte--tres">
                      <Button variant="ghost" size="sm" onClick={ed.restablecer}>
                        <RotateCcw size={16} /> Restablecer
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={ed.cancelar}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" icon="circle-check" onClick={ed.guardar}>
                        Guardar
                      </Button>
                    </div>
                    {ed.formato.id !== ESTANDAR && (
                      <div className="ui-formato-extra">
                        <button type="button" className="is-peligro" onClick={() => ed.eliminar(ed.formato.id)}>
                          <Trash2 size={14} /> Eliminar formato
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <span className="ui-eyebrow">Reporte seleccionado</span>
                    <strong className="ui-acciones-reporte__titulo">{actual.cifras.titulo}</strong>
                    <Desplegable
                      label="Formato"
                      icon="file-text"
                      value={ed.formato.id}
                      onChange={(v) => ed.asignar(actual.num, v)}
                      options={ed.formatos.map((f) => ({ value: f.id, label: f.nombre }))}
                    />
                    <div className="ui-acciones-reporte" style={{ marginTop: 12 }}>
                      <Button variant="secondary" size="sm" icon="sliders-horizontal" onClick={ed.abrir}>
                        Personalizar
                      </Button>
                      <Button size="sm" icon="download" onClick={() => descargarPdf(`${actual.cifras.titulo} · ${ed.formato.nombre}`)}>
                        Descargar PDF
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            )}
            {edPagina.editando ? (
              <Card className="nc-grow">
                <ListaTarjetas ed={edPagina} />
              </Card>
            ) : (
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
                          <span className="ui-muted ui-formato-etiqueta">Formato: {ed.formatoDe(r.num).nombre}</span>
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
            )}
          </div>
          <div className="ui-visor nc-scroll">{actual && (
              <DashboardReporte r={actual} areas={datos.areas} ed={edPagina} />
            )}</div>
        </div>
      )}
      {modal && datos && (
        <NuevoReporte
          areas={datos.areas}
          reportes={reportes}
          ed={ed}
          muestra={actual}
          cerrar={() => setModal(false)}
          creado={(nuevos, formato) => {
            ed.asignar(nuevos.map((r) => r.num), formato)
            actualizar((d) => ({ ...d, reportes: [...nuevos.reverse(), ...d.reportes] }))
            setElegido(nuevos[0].num)
            setModal(false)
          }}
        />
      )}
    </Pantalla>
  )
}
