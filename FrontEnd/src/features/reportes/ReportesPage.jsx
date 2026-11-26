import { useSesion } from '../../context/SesionContext'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import {
  Badge, Button, Card, IconCircle, Skeleton,
} from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { AsistenteReporte } from './AsistenteReporte'
import { DashboardReporte, ListaTarjetas } from './DashboardReporte'
import { MigracionFormatos } from './MigracionFormatos'
import { Programaciones } from './Programaciones'
import { etiquetaFormato, useEdicion } from './personalizacion'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as formatosApi from '../../services/formatos'
import * as organizacionesApi from '../../services/organizaciones'
import * as reportesApi from '../../services/reportes'
import { pagina } from '../../utils/convertir'
import { fechaLarga, periodo } from '../../utils/formato'

async function cargar(filtros = {}) {
  const params = {
    q: filtros.q || undefined,
    area: filtros.area || undefined,
    formato: filtros.formato || undefined,
    origen: filtros.origen || undefined,
    archivados: filtros.archivados ? 1 : undefined,
  }
  const [r, p, a] = await Promise.all([
    reportesApi.lista(params),
    reportesApi.programaciones(),
    organizacionesApi.areas(),
  ])
  return { reportes: pagina(r), programaciones: pagina(p), areas: pagina(a) }
}

const ESTADO_REPORTE = {
  GENERANDO: { tone: 'warning', label: 'Generando…', icon: 'clock' },
  LISTO: { tone: 'success', label: 'Listo', icon: 'circle-check' },
  ENVIADO: { tone: 'success', label: 'Enviado por correo', icon: 'circle-check' },
  FALLO: { tone: 'danger', label: 'Falló', icon: 'triangle-alert' },
}
const estadoDe = (r) => ESTADO_REPORTE[r.estado] ?? ESTADO_REPORTE.LISTO
const tituloDe = (r) => r?.cifras?.titulo || `Reporte R-${String(r?.num ?? 0).padStart(4, '0')}`

export function ReportesPage() {
  const { organizacion, rol } = useSesion()
  const [filtros, setFiltros] = useState({ q: '', area: '', formato: '', origen: '', archivados: false })
  const claveFiltros = JSON.stringify(filtros)
  const { estado, datos, reintentar, recargar, actualizar } = useDatos(
    () => cargar(filtros),
    [claveFiltros],
  )
  // ?reporte=<num> abre ese reporte (lo usa Nico AI al generar uno).
  const [params] = useSearchParams()
  const [elegido, setElegido] = useState(() => Number(params.get('reporte')) || null)
  const [verTodos, setVerTodos] = useState(false)
  const [modal, setModal] = useState(false)
  const [modalFormato, setModalFormato] = useState(null)
  const [areasElegidas, setAreasElegidas] = useState([])
  const [versiones, setVersiones] = useState(null)
  const reportes = datos?.reportes ?? []
  const actual = reportes.find((r) => r.num === elegido) ?? reportes[0]
  const generando = reportes.some((r) => r.estado === 'GENERANDO')
  const [inicial, setInicial] = useState(null)
  const ed = useEdicion(actual)
  const puedeEditar = rol === 'ADMIN' || rol === 'SUPER'
  // Mientras se crea un formato en el modal, la página de fondo sigue en vista normal.
  const edPagina = ed.modo === 'nuevo' ? { ...ed, editando: false } : ed

  const accionFormato = async (accion) => {
    try {
      await accion()
      await ed.recargar()
      recargar()
    } catch {
      window.alert('No se pudo actualizar el formato. Intenta de nuevo.')
    }
  }
  const hacerPredeterminado = () =>
    accionFormato(() => formatosApi.predeterminado(ed.formato.num))
  const archivar = () => {
    if (!window.confirm(`¿Archivar el formato «${ed.formato.nombre}»? Los reportes ya generados no cambian.`)) return
    accionFormato(() => formatosApi.archivar(ed.formato.num))
  }
  const abrirAreas = () => {
    setAreasElegidas(ed.formato.areasPredeterminado ?? [])
    setModalFormato('areas')
  }
  const guardarAreas = async () => {
    await accionFormato(() => formatosApi.areas(ed.formato.num, areasElegidas))
    setModalFormato(null)
  }
  const verVersiones = async () => {
    setVersiones(null)
    setModalFormato('versiones')
    try {
      setVersiones(await formatosApi.versiones(ed.formato.num))
    } catch {
      setVersiones([])
    }
  }
  const duplicarParaEditar = async () => {
    await ed.duplicar()
  }
  // Guardar o cambiar el formato de un reporte avisa para refrescar la lista sin esqueleto.
  useEffect(() => {
    const alCambiarReporte = () => recargar()
    window.addEventListener('nucleo:reporte', alCambiarReporte)
    return () => window.removeEventListener('nucleo:reporte', alCambiarReporte)
  }, [recargar])

  // Mientras haya reportes en cola, la lista se actualiza sola cada 5 s.
  useEffect(() => {
    if (!generando) return undefined
    const timer = setInterval(recargar, 5000)
    return () => clearInterval(timer)
  }, [generando, recargar])

  const archivarReporte = async (r) => {
    if (!window.confirm(`¿${r.archivado ? 'Desarchivar' : 'Archivar'} el reporte R-${String(r.num).padStart(4, '0')}?`)) return
    try {
      await (r.archivado ? reportesApi.desarchivar(r.num) : reportesApi.archivar(r.num))
      recargar()
    } catch {
      window.alert('No se pudo archivar el reporte. Intenta de nuevo.')
    }
  }
  const repetir = (r) => {
    setInicial({ area: r.area, areas: r.areas ?? [], formato: r.formato })
    setModal(true)
  }

  return (
    <Pantalla
      eyebrow={`${organizacion} · cifras del sistema, texto redactado con IA`}
      titulo="Reportes"
      acciones={
        <Button
          icon="sparkles"
          onClick={() => {
            setInicial(null)
            setModal(true)
          }}
        >
          Generar reporte
        </Button>
      }
    >
      {puedeEditar && (
        <MigracionFormatos
          formatos={ed.formatos}
          alSubir={async () => {
            await ed.recargar()
            recargar()
          }}
        />
      )}
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-fila" style={{ gridTemplateColumns: 'clamp(300px, 34%, 400px) minmax(0,1fr)' }}>
          <div className="ui-col">
            <div className="ui-reportes-filtros">
              <Buscador
                valor={filtros.q}
                cambiar={(q) => setFiltros({ ...filtros, q })}
                placeholder="Buscar por título…"
                ancho="100%"
              />
              <div className="ui-reportes-filtros__selects">
                <Desplegable
                  icon="map-pin"
                  value={filtros.area}
                  onChange={(area) => setFiltros({ ...filtros, area })}
                  options={[
                    { value: '', label: 'Todas las áreas' },
                    ...(datos.areas ?? []).map((a) => ({ value: String(a.num), label: a.nombre })),
                  ]}
                />
                <Desplegable
                  icon="file-text"
                  value={filtros.formato}
                  onChange={(formato) => setFiltros({ ...filtros, formato })}
                  options={[
                    { value: '', label: 'Todos los formatos' },
                    ...ed.formatos.map((f) => ({ value: String(f.num), label: f.nombre })),
                  ]}
                />
                <Desplegable
                  icon="sparkles"
                  value={filtros.origen}
                  onChange={(origen) => setFiltros({ ...filtros, origen })}
                  options={[
                    { value: '', label: 'Todos los orígenes' },
                    { value: 'MANUAL', label: 'Manual' },
                    { value: 'PROGRAMADO', label: 'Programado' },
                    { value: 'AGENTE', label: 'Nico AI' },
                  ]}
                />
                <label className="ui-editor__casilla">
                  <input
                    type="checkbox"
                    checked={filtros.archivados}
                    onChange={(e) => setFiltros({ ...filtros, archivados: e.target.checked })}
                  />
                  <span>Ver archivados</span>
                </label>
              </div>
            </div>
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
                  </>
                ) : (
                  <>
                    <span className="ui-eyebrow">Reporte seleccionado</span>
                    <strong className="ui-acciones-reporte__titulo">{tituloDe(actual)}</strong>
                    <div className="ui-formato-cabeza">
                      <Badge tone={estadoDe(actual).tone} icon={estadoDe(actual).icon}>
                        {estadoDe(actual).label}
                      </Badge>
                    </div>
                    {actual.estado === 'FALLO' && (
                      <p className="ui-aviso ui-aviso--danger" role="alert">
                        {actual.error || 'El reporte no se pudo generar. Vuelve a intentarlo.'}
                      </p>
                    )}
                    {actual.estado === 'GENERANDO' && (
                      <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
                        Estamos calculando las cifras y redactando el análisis. Esta pantalla se actualiza sola.
                      </p>
                    )}
                    <div className="ui-formato-cabeza">
                      <span className="ui-eyebrow">Formato</span>
                      {ed.formato.esPlantilla && <Badge tone="neutral">Plantilla</Badge>}
                      {ed.formato.predeterminado && <Badge tone="success">Predeterminado</Badge>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Desplegable
                          icon="file-text"
                          value={ed.formato.id}
                          onChange={async (v) => {
                            await ed.asignar(actual.num, v)
                          }}
                          options={ed.formatos.map((f) => ({ value: f.id, label: etiquetaFormato(f) }))}
                        />
                      </div>
                      {puedeEditar && ed.formato.num && (
                        <MenuAcciones
                          items={[
                            {
                              label: 'Hacer predeterminado',
                              icon: 'circle-check',
                              disabled: ed.formato.esPlantilla || ed.formato.predeterminado,
                              nota: ed.formato.esPlantilla ? 'Duplica la plantilla primero' : undefined,
                              onClick: hacerPredeterminado,
                            },
                            {
                              label: 'Predeterminado de áreas…',
                              icon: 'map-pin',
                              disabled: ed.formato.esPlantilla,
                              onClick: abrirAreas,
                            },
                            {
                              label: 'Archivar',
                              icon: 'circle-x',
                              peligro: true,
                              disabled: ed.formato.esPlantilla,
                              onClick: archivar,
                            },
                            {
                              label: 'Ver versiones',
                              icon: 'history',
                              onClick: verVersiones,
                            },
                          ]}
                        />
                      )}
                    </div>
                    <div className="ui-acciones-reporte" style={{ marginTop: 12 }}>
                      {puedeEditar && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={ed.formato.esPlantilla ? 'copy' : 'sliders-horizontal'}
                          onClick={ed.formato.esPlantilla ? duplicarParaEditar : ed.abrir}
                        >
                          {ed.formato.esPlantilla ? 'Duplicar para editar' : 'Personalizar'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        icon="download"
                        disabled={!['LISTO', 'ENVIADO'].includes(actual.estado ?? 'LISTO')}
                        onClick={() =>
                          reportesApi
                            .descargarArchivo(
                              actual.num,
                              `${tituloDe(actual)} · ${actual.formato_nombre ?? ed.formato.nombre}`,
                            )
                            .catch(() => window.alert('No se pudo descargar el PDF. Intenta de nuevo.'))
                        }
                      >
                        Descargar PDF
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="download"
                        disabled={!['LISTO', 'ENVIADO'].includes(actual.estado ?? 'LISTO')}
                        onClick={() =>
                          reportesApi
                            .descargarCsv(
                              actual.num,
                              `${tituloDe(actual)} · ${actual.formato_nombre ?? ed.formato.nombre}`,
                            )
                            .catch(() => window.alert('No se pudo descargar el CSV. Intenta de nuevo.'))
                        }
                      >
                        Descargar CSV
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            )}
            {edPagina.editando ? (
              <Card className="nc-grow">
                <ListaTarjetas ed={edPagina} areas={datos.areas} r={actual} />
              </Card>
            ) : (
              <Card className="nc-grow">
                <div className={`nc-scroll ui-recientes${verTodos ? ' is-todos' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="ui-eyebrow" style={{ padding: '12px 12px 6px' }}>
                    Recientes
                  </span>
                  {reportes.map((r) => (
                    <div
                      key={r.num}
                      role="button"
                      tabIndex={0}
                      className={`ui-item ui-item--boton ui-reciente${actual?.num === r.num ? ' is-selected' : ''}`}
                      style={{ alignItems: 'flex-start', gap: 12, padding: 12 }}
                      onClick={() => setElegido(r.num)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setElegido(r.num)}
                    >
                      <IconCircle name="file-text" size="sm" />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="ui-titulo-fila">
                          <strong style={{ fontSize: 14, lineHeight: '20px' }}>
                            {tituloDe(r).replace(/ en /, ' · ')}
                          </strong>
                          <span style={{ fontSize: 12, lineHeight: '16px' }}>{periodo(r.periodo_inicio, r.periodo_fin)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Badge tone={estadoDe(r).tone} icon={estadoDe(r).icon}>
                            {estadoDe(r).label}
                          </Badge>
                          {r.archivado && <Badge tone="neutral" icon="circle-x">Archivado</Badge>}
                          <span className="ui-muted ui-formato-etiqueta">
                            Formato: {r.formato_nombre ?? ed.formatoDe(r.num).nombre}
                          </span>
                        </div>
                      </div>
                      <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <MenuAcciones
                          label={`Opciones del reporte R-${String(r.num).padStart(4, '0')}`}
                          items={[
                            { label: 'Generar de nuevo', icon: 'refresh-cw', onClick: () => repetir(r) },
                            {
                              label: r.archivado ? 'Desarchivar' : 'Archivar',
                              icon: 'circle-x',
                              peligro: !r.archivado,
                              onClick: () => archivarReporte(r),
                            },
                          ]}
                        />
                      </span>
                    </div>
                  ))}
                  {/* En el celular solo se ven los 5 más recientes, para que el reporte no quede hasta abajo. */}
                  {reportes.length > 5 && (
                    <div className="ui-solo-movil" style={{ padding: '4px 12px' }}>
                      <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
                        {verTodos ? 'Ver menos' : `Ver todos (${reportes.length})`}
                      </Button>
                    </div>
                  )}
                  <Programaciones
                    programaciones={datos.programaciones}
                    areas={datos.areas}
                    formatos={ed.formatos}
                    puedeEditar={puedeEditar}
                    onCambio={recargar}
                  />
                </div>
              </Card>
            )}
          </div>
          <div className="ui-visor nc-scroll">
            {actual && ['LISTO', 'ENVIADO'].includes(actual.estado ?? 'LISTO') ? (
              <DashboardReporte r={actual} areas={datos.areas} ed={edPagina} />
            ) : actual ? (
              <Card>
                <Badge tone={estadoDe(actual).tone} icon={estadoDe(actual).icon}>
                  {estadoDe(actual).label}
                </Badge>
                <p className="ui-muted" style={{ marginTop: 10 }}>
                  {actual.estado === 'FALLO'
                    ? actual.error || 'El reporte no se pudo generar.'
                    : 'El reporte aparece aquí cuando termine de generarse.'}
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      )}
      {modal && datos && (
        <AsistenteReporte
          areas={datos.areas}
          reportes={reportes}
          ed={ed}
          puedeEditar={puedeEditar}
          muestra={actual}
          inicial={inicial}
          cerrar={() => {
            setModal(false)
            setInicial(null)
          }}
          creado={(nuevos) => {
            actualizar((d) => ({ ...d, reportes: [...nuevos.reverse(), ...d.reportes] }))
            setElegido(nuevos[0].num)
            setModal(false)
            setInicial(null)
          }}
        />
      )}
      {modalFormato === 'areas' && datos && (
        <Modal
          titulo="Predeterminado de áreas"
          sub={`Elige en qué áreas se usará «${ed.formato.nombre}» por omisión.`}
          cerrar={() => setModalFormato(null)}
          acciones={<Button onClick={guardarAreas}>Guardar áreas</Button>}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {datos.areas.map((area) => (
              <label key={area.num} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={areasElegidas.includes(area.num)}
                  onChange={(e) =>
                    setAreasElegidas((actuales) =>
                      e.target.checked
                        ? [...actuales, area.num]
                        : actuales.filter((num) => num !== area.num),
                    )
                  }
                />
                <span>{area.nombre}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}
      {modalFormato === 'versiones' && (
        <Modal
          titulo="Versiones del formato"
          sub={ed.formato.nombre}
          cerrar={() => setModalFormato(null)}
          acciones={null}
        >
          {versiones === null ? (
            <p className="ui-muted">Cargando versiones…</p>
          ) : versiones.length === 0 ? (
            <p className="ui-muted">Este formato no tiene versiones.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {versiones.map((version) => (
                <div key={version.numero} className="ui-item" style={{ padding: 10 }}>
                  <strong>Versión {version.numero}</strong>
                  <span className="ui-muted">
                    {' '}· {fechaLarga(version.fecha)} · {version.creada_por_nombre || 'Sistema'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </Pantalla>
  )
}
