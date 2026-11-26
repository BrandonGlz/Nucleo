import { useSesion } from '../../context/SesionContext'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import {
  Badge, Button, Card, IconCircle, IconButton, Skeleton,
} from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { DashboardReporte, ListaTarjetas } from './DashboardReporte'
import { MigracionFormatos } from './MigracionFormatos'
import { useEdicion } from './personalizacion'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import { useCierre } from '../../hooks/useSalida'
import * as formatosApi from '../../services/formatos'
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
const etiquetaFormato = (f) =>
  `${f.nombre}${f.predeterminado ? ' (predeterminado)' : ''}${f.esPlantilla ? ' · Plantilla' : ''}`

function NuevoReporte({ areas, reportes, ed, puedeEditar, muestra: elegido, cerrar, creado }) {
  const [saliendo, cerrarAnimado] = useCierre(cerrar)
  const [area, setArea] = useState(null)
  const [rango, setRango] = useState('mes')
  const [formato, setFormato] = useState(ed.formato.id)
  const [nombre, setNombre] = useState('')
  const [guardandoFormato, setGuardandoFormato] = useState(false)
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
        nuevos.push(
          await reportesApi.crear({
            area: a,
            formato: formato ? Number(formato) : undefined,
            periodo_inicio: inicio.toISOString(),
            periodo_fin: fin.toISOString(),
          }),
        )
      creado(nuevos)
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
              disabled={!nombre.trim() || guardandoFormato}
              onClick={async () => {
                setGuardandoFormato(true)
                const id = await ed.crearFormato(nombre.trim())
                if (id) {
                  setFormato(id)
                  setNombre('')
                }
                setGuardandoFormato(false)
              }}
            >
              {guardandoFormato ? 'Guardando…' : 'Guardar formato'}
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
    <div className={`ui-modal${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-modal="true" aria-label="Generar reporte">
      <div className="ui-modal__caja">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2>Generar reporte</h2>
            <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              Las cifras salen de las lecturas; el texto lo redacta la IA.
            </p>
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrarAnimado} />
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
          options={ed.formatos.map((f) => ({ value: f.id, label: etiquetaFormato(f) }))}
          accion={puedeEditar ? { label: 'Nuevo formato', icon: 'plus', onClick: ed.nuevo } : undefined}
        />
        {estado && estado !== 'enviando' && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{estado}</p>}
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrarAnimado}>
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
  const nombreArea = (n) => datos?.areas.find((a) => a.num === n)?.nombre ?? 'Todas las áreas'

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
