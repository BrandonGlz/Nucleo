import { useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, IconButton, Skeleton } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { useCierre } from '../../hooks/useSalida'
import * as reportesApi from '../../services/reportes'
import { periodo } from '../../utils/formato'
import { DashboardReporte, ListaTarjetas } from './DashboardReporte'
import { ControlZoom, ProveedorZoom } from './VisorHoja'
import { etiquetaFormato } from './personalizacion'

const PASOS = ['De qué', 'Cuándo', 'Cómo']
const ALCANCES = [
  { id: 'una', titulo: 'Un área', detalle: 'Un reporte del área que elijas.' },
  { id: 'varias', titulo: 'Varias áreas', detalle: 'Un solo reporte que suma las áreas marcadas.' },
  { id: 'organizacion', titulo: 'Toda la organización', detalle: 'Un reporte con todas las áreas.' },
  { id: 'por-area', titulo: 'Uno por cada área', detalle: 'Un reporte independiente por área.' },
]
const PERIODOS = [
  { id: 'mes', titulo: 'Este mes', detalle: 'Desde el día 1 hasta hoy.' },
  { id: 'semana', titulo: 'Últimos 7 días', detalle: 'Los siete días anteriores a hoy.' },
  { id: 'personalizado', titulo: 'Personalizado', detalle: 'Elige el inicio y el fin, hasta 31 días.' },
]

const dosCifras = (n) => String(n).padStart(2, '0')
const fechaLocal = (fecha) =>
  `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`

function rangoDe(rango, desde, hasta) {
  const fin = new Date()
  if (rango === 'mes') {
    const inicio = new Date(fin)
    inicio.setDate(1)
    inicio.setHours(0, 0, 0, 0)
    return { inicio, fin }
  }
  if (rango === 'semana') {
    const inicio = new Date(fin)
    inicio.setDate(fin.getDate() - 7)
    return { inicio, fin }
  }
  if (!desde || !hasta) return null
  const inicio = new Date(`${desde}T00:00:00`)
  const exclusivo = new Date(`${hasta}T00:00:00`)
  exclusivo.setDate(exclusivo.getDate() + 1)
  return { inicio, fin: exclusivo }
}

function erroresPersonalizado(desde, hasta) {
  const hoy = fechaLocal(new Date())
  const errorDesde = !desde
    ? 'Elige la fecha de inicio.'
    : desde > hoy
      ? 'No puedes elegir una fecha futura.'
      : null
  let errorHasta = null
  if (!hasta) errorHasta = 'Elige la fecha de fin.'
  else if (hasta > hoy) errorHasta = 'No puedes elegir una fecha futura.'
  else if (desde && hasta < desde) errorHasta = 'El fin no puede ser anterior al inicio.'
  else if (desde && (new Date(hasta) - new Date(desde)) / 86400000 + 1 > 31)
    errorHasta = 'El periodo no puede durar más de 31 días.'
  return { errorDesde, errorHasta }
}

function formatoParaAlcance(formatos, alcance, area) {
  if (alcance === 'una' && area) {
    const delArea = formatos.find((f) => f.areasPredeterminado?.includes(Number(area)))
    if (delArea) return delArea
  }
  return (
    formatos.find((f) => f.predeterminado) ??
    formatos.find((f) => f.plantilla === 'OPERATIVO') ??
    formatos[0]
  )
}

// Asistente de tres pasos para generar reportes: alcance, periodo y formato con vista previa
// de las cifras reales. «Uno por cada área» conserva el comportamiento anterior de «Todas».
export function AsistenteReporte({ areas, reportes, ed, puedeEditar, muestra: elegido, inicial, cerrar, creado }) {
  const [saliendo, cerrarAnimado] = useCierre(cerrar)
  const alcanceInicial = inicial?.areas?.length > 1 ? 'varias' : inicial?.area ? 'una' : inicial?.areas?.length ? 'varias' : 'organizacion'
  const [paso, setPaso] = useState(inicial ? 2 : 1)
  const [alcance, setAlcance] = useState(alcanceInicial)
  const [area, setArea] = useState(inicial?.area ? String(inicial.area) : '')
  const [areasElegidas, setAreasElegidas] = useState(inicial?.areas ?? [])
  const [rango, setRango] = useState('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [formato, setFormato] = useState(inicial?.formato ? String(inicial.formato) : '')
  const [preview, setPreview] = useState(null)
  const [cargandoPreview, setCargandoPreview] = useState(false)
  const [errorPreview, setErrorPreview] = useState(null)
  const [estado, setEstado] = useState(null)
  const [nombre, setNombre] = useState('')
  const [guardandoFormato, setGuardandoFormato] = useState(false)
  const creando = ed.modo === 'nuevo' && ed.editando

  const errores = rango === 'personalizado' ? erroresPersonalizado(desde, hasta) : {}
  const alcanceValido =
    (alcance === 'una' && Boolean(area)) ||
    (alcance === 'varias' && areasElegidas.length > 0) ||
    alcance === 'organizacion' ||
    (alcance === 'por-area' && areas.length > 0)
  const periodoValido = rango !== 'personalizado' || (!errores.errorDesde && !errores.errorHasta)
  const puedeSeguir = paso === 1 ? alcanceValido : paso === 2 ? periodoValido : Boolean(formato)
  const rangoActual = rangoDe(rango, desde, hasta)
  const areasDePreview =
    alcance === 'una'
      ? area
        ? [Number(area)]
        : []
      : alcance === 'varias'
        ? areasElegidas
        : alcance === 'por-area'
          ? areas.slice(0, 1).map((a) => a.num)
          : []

  // La hoja del editor usa un reporte del área elegida, si ya hay uno.
  const muestra =
    reportes.find((r) => alcance === 'una' && r.area === Number(area)) ?? elegido

  useEffect(() => {
    if (paso !== 3 || !rangoActual) return undefined
    let vigente = true
    setCargandoPreview(true)
    setErrorPreview(null)
    reportesApi
      .vistaPrevia({
        areas: areasDePreview,
        desde: rangoActual.inicio.toISOString(),
        hasta: rangoActual.fin.toISOString(),
      })
      .then((datos) => {
        if (vigente) setPreview(datos)
      })
      .catch(() => {
        if (vigente) {
          setPreview(null)
          setErrorPreview('No se pudo cargar la vista previa. Revisa el alcance y el periodo.')
        }
      })
      .finally(() => {
        if (vigente) setCargandoPreview(false)
      })
    return () => {
      vigente = false
    }
    // Las fechas cambian con el paso y con el periodo elegido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, alcance, area, areasElegidas, rango, desde, hasta, areas])

  useEffect(() => {
    if (paso !== 3 || formato) return
    const inicial = formatoParaAlcance(ed.formatos, alcance, area)
    if (inicial) setFormato(inicial.id)
  }, [paso, formato, alcance, area, ed.formatos])

  const cambiarAlcance = (id) => {
    setAlcance(id)
    setFormato('')
  }

  const siguiente = () => {
    if (!puedeSeguir) return
    if (paso === 2) {
      const inicial = formatoParaAlcance(ed.formatos, alcance, area)
      setFormato(inicial?.id ?? '')
    }
    setPaso((p) => Math.min(3, p + 1))
  }

  const crear = async () => {
    if (!puedeSeguir || !rangoActual) return
    setEstado('enviando')
    try {
      const destinos =
        alcance === 'una'
          ? [{ area: Number(area) }]
          : alcance === 'varias'
            ? [{ areas: areasElegidas }]
            : alcance === 'organizacion'
              ? [{}]
              : areas.map((a) => ({ area: a.num }))
      const nuevos = []
      for (const destino of destinos) {
        nuevos.push(
          await reportesApi.crear({
            ...destino,
            formato: formato ? Number(formato) : undefined,
            periodo_inicio: rangoActual.inicio.toISOString(),
            periodo_fin: rangoActual.fin.toISOString(),
          }),
        )
      }
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
                Elige las tarjetas, sus gráficas y sus datos. La hoja de la derecha usa los datos de «{muestra?.titulo ?? muestra?.cifras?.titulo}» como
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
              <ListaTarjetas ed={ed} areas={areas} r={muestra} />
            </div>
            <div className="ui-visor nc-scroll">{muestra && <DashboardReporte r={muestra} areas={areas} ed={ed} />}</div>
          </div>
        </div>
      </div>
    )

  const formatoElegido = ed.formatos.find((f) => f.id === formato) ?? ed.formatos[0]
  const edPreview = formatoElegido ? { ...ed, conf: formatoElegido.conf, editando: false } : ed
  const reportePreview =
    preview && rangoActual
      ? {
          num: null,
          area: preview.areas?.length === 1 ? preview.areas[0] : null,
          areas: preview.areas?.length > 1 ? preview.areas : [],
          origen: 'MANUAL',
          periodo_inicio: rangoActual.inicio.toISOString(),
          periodo_fin: rangoActual.fin.toISOString(),
          fecha_generacion: new Date().toISOString(),
          contenido: 'El análisis lo redacta la IA al generar.',
          cifras: preview.cifras,
        }
      : null

  return (
    <div className={`ui-modal${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-modal="true" aria-label="Generar reporte">
      <div className="ui-modal__caja ui-modal__caja--asistente">
        <div className="ui-asistente__cabeza">
          <div>
            <h2>Generar reporte</h2>
            <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              Las cifras salen de las lecturas; el texto lo redacta la IA.
            </p>
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrarAnimado} />
        </div>

        <ol className="ui-asistente__pasos">
          {PASOS.map((nombrePaso, i) => {
            const numero = i + 1
            return (
              <li
                key={nombrePaso}
                className={`ui-asistente__paso${paso === numero ? ' is-actual' : ''}${paso > numero ? ' is-hecho' : ''}`}
                aria-current={paso === numero ? 'step' : undefined}
              >
                <span className="ui-asistente__numero">{numero}</span>
                <span>{nombrePaso}</span>
              </li>
            )
          })}
        </ol>

        <div className={`ui-asistente__cuerpo${paso === 3 ? ' ui-asistente__cuerpo--vista' : ''}`}>
          <div className="ui-asistente__panel">
            {paso === 1 && (
              <>
                <h3 className="ui-asistente__titulo">¿De qué es el reporte?</h3>
                <div className="ui-asistente__opciones">
                  {ALCANCES.map((opcion) => (
                    <label key={opcion.id} className={`ui-asistente__opcion${alcance === opcion.id ? ' is-elegida' : ''}`}>
                      <input
                        type="radio"
                        name="alcance-reporte"
                        value={opcion.id}
                        checked={alcance === opcion.id}
                        onChange={() => cambiarAlcance(opcion.id)}
                      />
                      <span>
                        <strong>{opcion.titulo}</strong>
                        <span className="ui-muted">{opcion.detalle}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {alcance === 'una' && (
                  <Desplegable
                    label="Área"
                    icon="map-pin"
                    value={area}
                    onChange={setArea}
                    placeholder="Elige un área"
                    options={areas.map((a) => ({ value: String(a.num), label: a.nombre }))}
                  />
                )}
                {alcance === 'varias' && (
                  <div className="nc-field">
                    <span className="nc-field__label">Áreas del reporte</span>
                    <div className="ui-asistente__areas">
                      {areas.map((a) => (
                        <label key={a.num} className="ui-asistente__area">
                          <input
                            type="checkbox"
                            checked={areasElegidas.includes(a.num)}
                            onChange={(e) =>
                              setAreasElegidas((actuales) =>
                                e.target.checked
                                  ? [...actuales, a.num]
                                  : actuales.filter((num) => num !== a.num),
                              )
                            }
                          />
                          <span>{a.nombre}</span>
                        </label>
                      ))}
                    </div>
                    {areasElegidas.length === 0 && (
                      <span className="nc-field__msg">Marca al menos un área.</span>
                    )}
                  </div>
                )}
                {alcance === 'por-area' && (
                  <p className="ui-muted" style={{ margin: 0 }}>
                    Se generará un reporte por cada una de las {areas.length} áreas. Cada uno tendrá su
                    propio PDF.
                  </p>
                )}
              </>
            )}

            {paso === 2 && (
              <>
                <h3 className="ui-asistente__titulo">¿Qué periodo incluye?</h3>
                <div className="ui-asistente__opciones ui-asistente__opciones--periodos">
                  {PERIODOS.map((opcion) => (
                    <label key={opcion.id} className={`ui-asistente__opcion${rango === opcion.id ? ' is-elegida' : ''}`}>
                      <input
                        type="radio"
                        name="periodo-reporte"
                        value={opcion.id}
                        checked={rango === opcion.id}
                        onChange={() => setRango(opcion.id)}
                      />
                      <span>
                        <strong>{opcion.titulo}</strong>
                        <span className="ui-muted">{opcion.detalle}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {rango === 'personalizado' && (
                  <div className="ui-grid-2">
                    <label className={`nc-field${errores.errorDesde ? ' is-error' : ''}`}>
                      <span className="nc-field__label">Desde</span>
                      <span className={`nc-input${errores.errorDesde ? ' is-error' : ''}`}>
                        <input
                          type="date"
                          value={desde}
                          max={fechaLocal(new Date())}
                          aria-invalid={errores.errorDesde ? true : undefined}
                          onChange={(e) => setDesde(e.target.value)}
                        />
                      </span>
                      {errores.errorDesde && (
                        <span className="nc-field__msg nc-field__msg--error">{errores.errorDesde}</span>
                      )}
                    </label>
                    <label className={`nc-field${errores.errorHasta ? ' is-error' : ''}`}>
                      <span className="nc-field__label">Hasta</span>
                      <span className={`nc-input${errores.errorHasta ? ' is-error' : ''}`}>
                        <input
                          type="date"
                          value={hasta}
                          min={desde || undefined}
                          max={fechaLocal(new Date())}
                          aria-invalid={errores.errorHasta ? true : undefined}
                          onChange={(e) => setHasta(e.target.value)}
                        />
                      </span>
                      {errores.errorHasta && (
                        <span className="nc-field__msg nc-field__msg--error">{errores.errorHasta}</span>
                      )}
                    </label>
                  </div>
                )}
                {rangoActual && (
                  <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
                    Se incluirán las lecturas de {periodo(rangoActual.inicio.toISOString(), rangoActual.fin.toISOString())}. El fin elegido
                    cuenta completo.
                  </p>
                )}
              </>
            )}

            {paso === 3 && (
              <>
                <h3 className="ui-asistente__titulo">¿Con qué formato?</h3>
                <Desplegable
                  label="Formato"
                  icon="file-text"
                  value={formato}
                  onChange={setFormato}
                  options={ed.formatos.map((f) => ({ value: f.id, label: etiquetaFormato(f) }))}
                  accion={puedeEditar ? { label: 'Nuevo formato', icon: 'plus', onClick: ed.nuevo } : undefined}
                />
                <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
                  {alcance === 'por-area'
                    ? `La vista previa es la de ${areas[0]?.nombre}; se generará un reporte por área con el formato elegido.`
                    : 'La vista previa usa las cifras reales del alcance y del periodo. El análisis lo redacta la IA al generar.'}
                </p>
                {estado && estado !== 'enviando' && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{estado}</p>}
              </>
            )}
          </div>

          {paso === 3 && (
            <ProveedorZoom ajusteAncho={false}>
              <div className="ui-asistente__vista">
                <div className="ui-asistente__vista-cabeza">
                  <span className="ui-eyebrow">Vista previa</span>
                  <ControlZoom compacto />
                </div>
                <div className="ui-asistente__visor">
                  {cargandoPreview ? (
                    <Skeleton variant="card" />
                  ) : errorPreview ? (
                    <p className="ui-muted">{errorPreview}</p>
                  ) : reportePreview ? (
                    <DashboardReporte r={reportePreview} areas={areas} ed={edPreview} />
                  ) : null}
                </div>
              </div>
            </ProveedorZoom>
          )}
        </div>

        <div className="ui-acciones ui-separado">
          <Button variant="ghost" onClick={() => (paso === 1 ? cerrarAnimado() : setPaso(paso - 1))}>
            {paso === 1 ? 'Cancelar' : 'Atrás'}
          </Button>
          {paso < 3 ? (
            <Button onClick={siguiente} disabled={!puedeSeguir}>
              Siguiente
            </Button>
          ) : (
            <Button icon="sparkles" disabled={!puedeSeguir || estado === 'enviando'} onClick={crear}>
              {estado === 'enviando'
                ? 'Generando…'
                : alcance === 'por-area'
                  ? `Generar ${areas.length} reportes`
                  : 'Generar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
