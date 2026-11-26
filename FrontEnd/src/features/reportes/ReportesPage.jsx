import { useSesion } from '../../context/SesionContext'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import {
  Badge, Button, Card, IconCircle, Skeleton,
} from '../../design-system/componentes/index.js'
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

async function cargar() {
  const [r, p, a] = await Promise.all([reportesApi.lista(), reportesApi.programaciones(), organizacionesApi.areas()])
  return { reportes: pagina(r), programaciones: pagina(p), areas: pagina(a) }
}

export function ReportesPage() {
  const { organizacion, rol } = useSesion()
  const { estado, datos, reintentar, recargar, actualizar } = useDatos(cargar, [])
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
                    <strong className="ui-acciones-reporte__titulo">{actual.cifras.titulo}</strong>
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
                        onClick={() =>
                          reportesApi
                            .descargarArchivo(
                              actual.num,
                              `${actual.cifras.titulo} · ${actual.formato_nombre ?? ed.formato.nombre}`,
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
                        onClick={() =>
                          reportesApi
                            .descargarCsv(
                              actual.num,
                              `${actual.cifras.titulo} · ${actual.formato_nombre ?? ed.formato.nombre}`,
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
                    <button
                      key={r.num}
                      type="button"
                      className={`ui-item ui-item--boton ui-reciente${actual?.num === r.num ? ' is-selected' : ''}`}
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
                          <span className="ui-muted ui-formato-etiqueta">
                            Formato: {r.formato_nombre ?? ed.formatoDe(r.num).nombre}
                          </span>
                        </div>
                      </div>
                    </button>
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
          <div className="ui-visor nc-scroll">{actual && (
              <DashboardReporte r={actual} areas={datos.areas} ed={edPagina} />
            )}</div>
        </div>
      )}
      {modal && datos && (
        <AsistenteReporte
          areas={datos.areas}
          reportes={reportes}
          ed={ed}
          puedeEditar={puedeEditar}
          muestra={actual}
          cerrar={() => setModal(false)}
          creado={(nuevos) => {
            actualizar((d) => ({ ...d, reportes: [...nuevos.reverse(), ...d.reportes] }))
            setElegido(nuevos[0].num)
            setModal(false)
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
