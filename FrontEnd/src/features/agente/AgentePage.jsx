import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUp,
  Check,
  Copy,
  MessageSquare,
  PanelLeft,
  RotateCcw,
  Square,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { Button, Icon, Skeleton, TrendChart } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { useCierre } from '../../hooks/useSalida'
import { CONSULTA_MOVIL, useEsMovil } from '../../hooks/useMenuMovil'
import { Pantalla } from '../../components/Pantalla'
import { useAgente } from '../../context/AgenteContext'
import { useSesion } from '../../context/SesionContext'
import { DashboardReporte } from '../reportes/DashboardReporte'
import { ControlZoom, ProveedorZoom } from '../reportes/VisorHoja'
import { asignarFormato, useEdicion } from '../reportes/personalizacion'
import * as reportesApi from '../../services/reportes'
import * as agenteApi from '../../services/agente'
import * as alertasApi from '../../services/alertas'
import * as dispositivosApi from '../../services/dispositivos'
import { esReporte, planDe, respuestaRapida, siguientes } from './proceso'
import { filtrar, filtrarAtajos, normalizar, resaltar } from './sugerenciasEscritura'
import { aplicar, interpretar, plantillas } from './edicion'
import { Archivos, Comparativa, Edicion, ElegirPlantilla, GraficaChat } from './Piezas'
import { periodo, hora, fechaCorta, miles } from '../../utils/formato'
import { UNIDAD, VARIABLE } from '../../utils/convertir'
import caraNico from '../../assets/nico/nico-cara.webp'
import { MenuAcciones } from '../../components/MenuAcciones'
import { aviso, confirmar } from '../../components/confirmacion'

// Sugerencias de respaldo mientras llegan las del backend: usan solo el dispositivo elegido.
const SUGERENCIAS_BASE = [
  { icono: 'activity', titulo: 'Últimas lecturas', texto: '¿Cómo está el dispositivo?' },
  { icono: 'bell', titulo: 'Alertas', texto: '¿Qué alertas tengo pendientes?' },
  { icono: 'thermometer', titulo: 'Temperatura', texto: '¿Cómo estuvo la temperatura esta semana?' },
  { icono: 'file-text', titulo: 'Reporte del mes', texto: 'Genera el reporte de este mes' },
]
const ROLES_REPORTE = ['ADMIN', 'SUPER', 'ANALISTA']
// Agrupa las conversaciones guardadas por cercanía y filtra por título o texto.
function gruposConversaciones(conversaciones, busqueda) {
  const q = normalizar(busqueda)
  const visibles = conversaciones.filter((c) => {
    if (!q) return true
    const texto = [c.titulo, ...(c.mensajes ?? []).map((m) => m.texto)].join(' ')
    return normalizar(texto).includes(q)
  })
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const ayer = new Date(hoy)
  ayer.setDate(ayer.getDate() - 1)
  const semana = new Date(hoy)
  semana.setDate(semana.getDate() - 6)
  const grupos = [
    { id: 'hoy', label: 'Hoy', items: [] },
    { id: 'ayer', label: 'Ayer', items: [] },
    { id: 'semana', label: 'Esta semana', items: [] },
    { id: 'anteriores', label: 'Anteriores', items: [] },
  ]
  for (const c of visibles) {
    const fecha = c.creada ? new Date(c.creada) : new Date(0)
    if (fecha >= hoy) grupos[0].items.push(c)
    else if (fecha >= ayer) grupos[1].items.push(c)
    else if (fecha >= semana) grupos[2].items.push(c)
    else grupos[3].items.push(c)
  }
  return grupos.filter((g) => g.items.length)
}
// Pasos que se muestran mientras el agente prepara la respuesta.
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Marca del agente: la cara de Nico dentro de un círculo; un anillo gira alrededor mientras piensa.
function Marca({ pensando, grande, llega }) {
  return (
    <span className={`ui-ia-marca${pensando ? ' is-pensando' : ''}${grande ? ' ui-ia-marca--grande' : ''}${llega ? ' is-llega' : ''}`} aria-hidden>
      <img src={caraNico} alt="" draggable={false} />
    </span>
  )
}

// El texto aparece palabra por palabra, como en los asistentes de IA: cada palabra entra con un
// desvanecido suave (de borrosa a nítida) y un punto brillante va al frente mientras se escribe.
function TextoEscrito({ texto, animar, listo }) {
  const palabras = texto.split(' ')
  const [escribe] = useState(() => animar && !sinMovimiento())
  const [n, setN] = useState(escribe ? 0 : palabras.length)
  useEffect(() => {
    if (n >= palabras.length) {
      listo?.()
      return undefined
    }
    const t = setTimeout(() => setN((x) => x + 1), 32)
    return () => clearTimeout(t)
  }, [n, palabras.length, listo])
  if (!escribe) return <p className="ui-ia-texto">{texto}</p>
  return (
    <p className="ui-ia-texto" aria-label={texto}>
      {palabras.slice(0, n).map((p, i) => (
        <span key={i} className="ui-ia-palabra" aria-hidden>
          {p}{' '}
        </span>
      ))}
      {n < palabras.length && <span className="ui-ia-cursor" aria-hidden />}
    </p>
  )
}

// Mientras prepara la respuesta: los pasos que sigue según la pregunta (planDe), uno tras otro en el
// tiempo mínimo del plan, con una barra de avance. El último paso gira hasta que llega la respuesta.
function Pensando({ plan }) {
  const { pasos, ms } = plan
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, pasos.length - 1)), Math.max(260, ms / pasos.length))
    return () => clearInterval(t)
  }, [pasos.length, ms])
  return (
    <div className="ui-ia-mensaje ui-ia-mensaje--pensando" aria-live="polite">
      <Marca pensando />
      <div className="ui-ia-cuerpo">
        <span key={paso} className="ui-ia-brillo ui-ia-brillo--cambia">
          {pasos[paso]}…
        </span>
        <div className="ui-ia-progreso" aria-hidden>
          <span style={{ '--ia-duracion': `${ms}ms` }} />
        </div>
        <ol className="ui-ia-pasos">
          {pasos.slice(0, paso + 1).map((p, i) => (
            <li key={p} className={i < paso ? 'is-hecho' : ''}>
              {i < paso ? <Check size={13} /> : <span className="ui-ia-punto" />} {p}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const nombreReporte = (resumen) => `Reporte ${resumen.titulo ?? `R-${resumen.num}`}`

// Reporte que generó el agente, como un archivo adjunto: se descarga directo (PDF del servidor)
// o se visualiza en el visor lateral.
function AdjuntoReporte({ resumen, visualizar, abierto }) {
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState(false)
  const descargar = async () => {
    setBajando(true)
    setError(false)
    try {
      await reportesApi.descargarArchivo(resumen.num, nombreReporte(resumen))
    } catch {
      setError(true)
    }
    setBajando(false)
  }
  return (
    <div className={`ui-ia-adjunto${abierto ? ' is-abierto' : ''}`}>
      <button type="button" className="ui-ia-adjunto__archivo" onClick={() => visualizar(resumen)}>
        <span className="ui-ia-adjunto__icono">
          <Icon name="file-text" size={18} />
        </span>
        <span className="ui-ia-adjunto__texto">
          <strong>{nombreReporte(resumen)}</strong>
          <span className="ui-muted">
            Documento · PDF · {periodo(resumen.periodo_inicio, resumen.periodo_fin)}
          </span>
        </span>
      </button>
      <div className="ui-ia-adjunto__botones">
        <Button variant="secondary" size="sm" icon="eye" onClick={() => visualizar(resumen)}>
          Visualizar
        </Button>
        <Button size="sm" icon="download" disabled={bajando} onClick={descargar}>
          {bajando ? 'Descargando…' : 'Descargar PDF'}
        </Button>
      </div>
      {error && (
        <span className="ui-ia-sobre" role="alert">
          No se pudo descargar. Intenta de nuevo.
        </span>
      )}
    </div>
  )
}

// Visor lateral del reporte, como el de un documento adjunto: hojas A4 con zoom, descarga,
// pantalla completa y cierre (también con Escape).
function VisorReporte({ resumen, cerrar: quitar, ampliado, ampliar }) {
  // Al cerrar, el visor primero se desliza hacia la derecha y luego se quita.
  const [saliendo, cerrar] = useCierre(quitar, 280)
  const [r, setR] = useState(null)
  const [error, setError] = useState(false)
  const caja = useRef(null)
  const ed = useEdicion(r ?? resumen.num)
  useEffect(() => {
    let vivo = true
    reportesApi
      .obtener(resumen.num)
      .then((x) => vivo && (x ? setR(x) : setError(true)))
      .catch(() => vivo && setError(true))
    return () => {
      vivo = false
    }
  }, [resumen.num])
  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && (ampliado ? ampliar(false) : cerrar())
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [ampliado, ampliar, cerrar])
  const areas = r ? [{ num: r.area, nombre: resumen.titulo?.split(' · ')[0] ?? 'Todas las áreas' }] : []
  return (
    <ProveedorZoom>
    <aside ref={caja} className={`ui-ia-visor${ampliado ? ' is-ampliado' : ''}${saliendo ? ' is-saliendo' : ''}`} aria-label="Vista del reporte">
      <header className="ui-ia-visor__barra">
        <span className="ui-ia-visor__titulo">
          <strong>{nombreReporte(resumen)}</strong>
          <span className="ui-muted"> · PDF</span>
        </span>
        <ControlZoom compacto />
        <Button
          size="sm"
          icon="download"
          disabled={!r}
          onClick={() =>
            reportesApi
              .descargarArchivo(resumen.num, `${nombreReporte(resumen)} · ${ed.formato.nombre}`)
              .catch(() => aviso('No se pudo descargar el PDF. Intenta de nuevo.', { tipo: 'error' }))
          }
        >
          Descargar como PDF
        </Button>
        <button
          type="button"
          className="ui-ia-icono"
          aria-label={ampliado ? 'Salir de pantalla completa' : 'Pantalla completa'}
          title={ampliado ? 'Reducir' : 'Pantalla completa'}
          onClick={() => ampliar(!ampliado)}
        >
          <Icon name={ampliado ? 'minimize-2' : 'maximize-2'} size={17} />
        </button>
        <button type="button" className="ui-ia-icono" aria-label="Cerrar vista" title="Cerrar" onClick={cerrar}>
          <Icon name="x" size={18} />
        </button>
      </header>
      <div className="ui-ia-visor__hojas">
        {error ? (
          <span className="ui-aviso ui-aviso--danger" role="alert">
            No se pudo cargar el reporte. Intenta de nuevo o ábrelo en Reportes.
          </span>
        ) : r ? (
          <DashboardReporte r={r} areas={areas} ed={ed} />
        ) : (
          <div className="ui-ia-visor__cargando">
            <Skeleton variant="card" />
          </div>
        )}
      </div>
    </aside>
    </ProveedorZoom>
  )
}

// Cifras y gráfica de la respuesta, en una tarjeta aparte dentro del mensaje.
function Hallazgos({ m }) {
  const valores = [...m.serie, m.maximo]
  const holgura = (Math.max(...valores) - Math.min(...valores)) * 0.15 || 1
  return (
    <div className="ui-ia-hallazgos">
      <div className="ui-ia-hallazgos__cabeza">
        <span className="ui-eyebrow">Lecturas sobre el máximo</span>
        <span className="ui-muted">
          Umbral {m.maximo} {m.unidad}
        </span>
      </div>
      <div className="ui-ia-picos">
        {m.picos.map((p) => (
          <div key={p.cuando}>
            <span className="ui-muted">{p.cuando}</span>
            <strong className="ui-num">
              {p.valor.toFixed(1)}
              <small> {m.unidad}</small>
            </strong>
            <span className="ui-ia-sobre">+{(p.valor - m.maximo).toFixed(1)} sobre el máximo</span>
          </div>
        ))}
      </div>
      <TrendChart
        data={m.serie.map((v, i) => ({ label: m.etiquetas ? m.etiquetas[i] : i % 2 ? '' : DIAS[i / 2], value: v }))}
        unit={m.unidad}
        threshold={{ max: m.maximo }}
        min={Math.floor(Math.min(...valores) - holgura)}
        max={Math.ceil(Math.max(...valores) + holgura)}
        height={120}
        tooltip={false}
      />
    </div>
  )
}

function Respuesta({ m, autor, ultima, animar, regenerar, calificar, visualizar, visorAbierto, alTerminar, elegirPlantilla, deshacer, puedeAtender, resolverAlerta }) {
  const navegar = useNavigate()
  const [completa, setCompleta] = useState(!animar)
  const [copiado, setCopiado] = useState(false)
  const [resolviendo, setResolviendo] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [errorResolucion, setErrorResolucion] = useState('')
  const [enviandoResolucion, setEnviandoResolucion] = useState(false)
  const confirmarResolucion = async () => {
    const nota = observaciones.trim()
    if (nota.length < 5) {
      setErrorResolucion('Describe con al menos 5 caracteres.')
      return
    }
    if (nota.length > 500) {
      setErrorResolucion('La nota no puede pasar de 500 caracteres.')
      return
    }
    setEnviandoResolucion(true)
    setErrorResolucion('')
    const error = await resolverAlerta(resolviendo.alerta, resolviendo.accion, nota)
    setEnviandoResolucion(false)
    if (error) setErrorResolucion(error)
    else {
      setResolviendo(null)
      setObservaciones('')
    }
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(m.texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sin permiso de portapapeles no se copia.
    }
  }
  return (
    <div className={`ui-ia-mensaje${animar ? ' ui-ia-mensaje--llega' : ''}`}>
      <Marca llega={animar} />
      <div className="ui-ia-cuerpo">
        <div className="ui-ia-autor">
          <strong>{autor}</strong>
          <span className="ui-muted">{m.hora}</span>
        </div>
        <TextoEscrito texto={m.texto} animar={animar} listo={() => {
            setCompleta(true)
            alTerminar?.()
          }}
        />
        {completa && m.alertas?.length > 0 && (
          <div className="ui-ia-alertas">
            {m.alertas.map((alerta) => (
              <div key={alerta.num} className="ui-ia-alerta">
                <span className={`ui-ia-alerta__nivel is-${alerta.nivel.toLowerCase()}`}>{alerta.nivel === 'PELIGRO' ? 'Peligro' : 'Advertencia'}</span>
                <span className="ui-ia-alerta__texto">
                  <strong>{alerta.variable}</strong> · {alerta.dispositivo} · {alerta.area}
                  <small>
                    {fechaCorta(alerta.fecha)} {hora(alerta.fecha)} · {Number(alerta.valor).toFixed(1)} {alerta.unidad}
                  </small>
                </span>
                {puedeAtender && (
                  <span className="ui-ia-alerta__acciones">
                    <button
                      type="button"
                      onClick={() => {
                        setObservaciones('')
                        setErrorResolucion('')
                        setResolviendo({ alerta, accion: 'atender' })
                      }}
                    >
                      Atender
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setObservaciones('')
                        setErrorResolucion('')
                        setResolviendo({ alerta, accion: 'descartar' })
                      }}
                    >
                      Descartar
                    </button>
                  </span>
                )}
              </div>
            ))}
            {resolviendo && (
              <div className="ui-ia-resolver">
                <strong>
                  {resolviendo.accion === 'atender' ? 'Atender' : 'Descartar'} alerta de {resolviendo.alerta.variable} en {resolviendo.alerta.dispositivo}
                </strong>
                <label>
                  <span>Observaciones</span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={observaciones}
                    placeholder={
                      resolviendo.accion === 'atender'
                        ? 'Escribe qué se hizo para atender la alerta.'
                        : 'Escribe por qué se descarta la alerta.'
                    }
                    onChange={(e) => setObservaciones(e.target.value)}
                  />
                </label>
                {errorResolucion && <span className="ui-ia-resolver__error">{errorResolucion}</span>}
                <div className="ui-ia-resolver__acciones">
                  <button
                    type="button"
                    className="ui-ia-resolver__cancelar"
                    onClick={() => {
                      setResolviendo(null)
                      setObservaciones('')
                      setErrorResolucion('')
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="button" className="ui-ia-resolver__confirmar" disabled={enviandoResolucion} onClick={confirmarResolucion}>
                    {enviandoResolucion ? 'Guardando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {completa && m.reporte && (
          <div className="ui-ia-aparece">
            {m.reporte.variables ? (
              <AdjuntoReporte resumen={m.reporte} visualizar={visualizar} abierto={visorAbierto === m.reporte.num} />
            ) : (
              // Conversaciones guardadas antes del resumen solo traen el número del reporte.
              <div className="ui-ia-siguientes">
                <Button variant="secondary" size="sm" icon="file-text" onClick={() => navegar(`/reportes?reporte=${m.reporte.num}`)}>
                  Ver reporte
                </Button>
              </div>
            )}
          </div>
        )}
        {completa && m.grafica && (
          <div className="ui-ia-aparece">
            <GraficaChat g={m.grafica} />
          </div>
        )}
        {completa && m.comparativa && (
          <div className="ui-ia-aparece">
            <Comparativa c={m.comparativa} />
          </div>
        )}
        {completa && m.plantillas && (
          <div className="ui-ia-aparece">
            <ElegirPlantilla p={m.plantillas} activa={ultima} elegir={elegirPlantilla} />
          </div>
        )}
        {completa && m.edicion && (
          <div className="ui-ia-aparece">
            <Edicion
              e={m.edicion}
              reporte={m.reporteEditado}
              visualizar={visualizar}
              deshacer={ultima && m.edicion.previo ? deshacer : null}
            />
          </div>
        )}
        {completa && m.picos && (
          <div className="ui-ia-aparece">
            <Hallazgos m={m} />
            <div className="ui-ia-siguientes">
              <Button variant="ghost" size="sm" icon="file-text" onClick={() => navegar('/reportes')}>
                Generar reporte
              </Button>
            </div>
          </div>
        )}
        {/* Pasos que el agente siguió de verdad (los arma el backend con lo que entendió). */}
        {completa && m.pasos?.length > 0 && (
          <details className="ui-ia-pasos">
            <summary>Cómo lo resolví</summary>
            <ol>
              {m.pasos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </details>
        )}
        {completa && (m.fuente || m.picos) && (
          <div className="ui-ia-fuentes ui-ia-fuentes--respuesta">
            <span className="ui-muted">Basado en</span>
            <span className="ui-ia-fuente-sep" aria-hidden>·</span>
            {m.fuente &&
              (m.fuente.dispositivo ? (
                <button
                  type="button"
                  className="ui-ia-fuente"
                  title="Ver estas lecturas en el Histórico"
                  onClick={() =>
                    navegar(
                      `/mediciones?dispositivo=${m.fuente.dispositivo}&desde=${encodeURIComponent(m.fuente.desde)}&hasta=${encodeURIComponent(m.fuente.hasta)}`,
                    )
                  }
                >
                  <Icon name="activity" size={13} /> {miles(m.fuente.lecturas)} lecturas · {periodo(m.fuente.desde, m.fuente.hasta)}
                </button>
              ) : (
                <span className="ui-ia-fuente">
                  <Icon name="activity" size={13} /> {miles(m.fuente.lecturas)} lecturas · {periodo(m.fuente.desde, m.fuente.hasta)}
                  {m.fuente.alcance ? ` · ${m.fuente.alcance}` : ''}
                </span>
              ))}
            {m.picos && (
              <>
                <span className="ui-ia-fuente-sep" aria-hidden>·</span>
                <span className="ui-ia-fuente">
                  <Icon name="activity" size={13} /> {m.serie.length} {m.etiquetas ? 'máximos diarios' : 'promedios'}
                </span>
                <span className="ui-ia-fuente-sep" aria-hidden>·</span>
                <span className="ui-ia-fuente">
                  <Icon name="sliders-horizontal" size={13} /> Umbral máx {m.maximo} {m.unidad}
                </span>
              </>
            )}
          </div>
        )}
        {completa && (
          <div className={`ui-ia-acciones-contenedor${animar ? ' ui-ia-acciones--llega' : ''}`}>
          <div className="ui-ia-acciones">
            <button type="button" aria-label={copiado ? 'Copiado' : 'Copiar respuesta'} title="Copiar" onClick={copiar}>
              {copiado ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button type="button" aria-label="Regenerar respuesta" title="Regenerar" onClick={regenerar}>
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              aria-label="Buena respuesta"
              title="Buena respuesta"
              aria-pressed={m.voto === 'si'}
              className={m.voto === 'si' ? 'is-activo' : ''}
              disabled={Boolean(m.voto)}
              onClick={() => calificar('si')}
            >
              <ThumbsUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Mala respuesta"
              title="Mala respuesta"
              aria-pressed={m.voto === 'no'}
              className={m.voto === 'no' ? 'is-activo' : ''}
              disabled={Boolean(m.voto)}
              onClick={() => calificar('no')}
            >
              <ThumbsDown size={16} />
            </button>
            {m.fuente?.dispositivo && (
              <>
                <span className="ui-ia-acciones__divisor" aria-hidden />
                <button
                  type="button"
                  className="ui-ia-accion-texto"
                  onClick={() =>
                    navegar(
                      `/mediciones?dispositivo=${m.fuente.dispositivo}&desde=${encodeURIComponent(m.fuente.desde)}&hasta=${encodeURIComponent(m.fuente.hasta)}`,
                    )
                  }
                >
                  <Icon name="history" size={15} /> Ver en Histórico
                </button>
              </>
            )}
            {m.via === 'IA' && <span className="ui-ia-via">Redactada con IA</span>}
            {m.via === 'BANCO' && <span className="ui-ia-via">Aprendida de tus reacciones</span>}
            {m.via === 'ENRUTADA' && <span className="ui-ia-via">Interpretada con IA</span>}
          </div>
          {m.voto && (
            <span className="ui-ia-nota ui-ia-nota--calificado">La mejora de Nico AI se basa en tus reacciones.</span>
          )}
          </div>
        )}
      </div>
    </div>
  )
}

// Lista que aparece arriba de la caja mientras se escribe: flechas para moverse, Enter para
// preguntar la elegida, Tab para solo completarla y Esc para cerrarla.
function SugerenciasEscritura({ lista, escrito, elegida, elegir, resaltarEn }) {
  return (
    <ul className="ui-ia-sugiere" role="listbox" id="nico-sugerencias" aria-label="Sugerencias">
      {lista.map((s, i) => (
        <li key={s.texto} role="option" id={`nico-sugerencia-${i}`} aria-selected={i === elegida}>
          <button
            type="button"
            tabIndex={-1}
            className={i === elegida ? 'is-elegida' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => resaltarEn(i)}
            onClick={() => elegir(s)}
          >
            <Icon name={s.tipo === 'atajo' ? 'list' : s.tipo === 'consulta' ? 'activity' : s.tipo === 'frecuente' ? 'history' : 'message-square-text'} size={15} />
            <span className="ui-ia-sugiere__texto">
              {resaltar(s.texto, escrito).map((p, j) => (p.marca ? <strong key={j}>{p.texto}</strong> : <span key={j}>{p.texto}</span>))}
            </span>
            <span className={`ui-ia-sugiere__tipo is-${s.tipo}`}>{s.etiqueta}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// Caja para escribir: crece con el texto, Enter envía y Shift+Enter hace un salto de línea.
function Compositor({ valor, cambiar, enviar, detener, pensando, deshabilitado, enfocar, alcance, aviso, sugerencias }) {
  const area = useRef(null)
  const [elegida, setElegida] = useState(-1)
  const [cerradaEn, setCerradaEn] = useState(null)
  const atajos = filtrarAtajos(valor)
  const lista = atajos.length
    ? atajos
    : sugerencias?.activas && cerradaEn !== valor && !pensando
      ? filtrar(sugerencias.lista, valor, sugerencias.maximo)
      : []
  const abierta = lista.length > 0
  // Al cambiar lo escrito, ninguna queda elegida.
  const [escritoAntes, setEscritoAntes] = useState(valor)
  if (escritoAntes !== valor) {
    setEscritoAntes(valor)
    setElegida(-1)
  }
  const elegir = (s) => {
    setCerradaEn(s.texto)
    enviar(s.pregunta ?? s.texto)
  }
  useLayoutEffect(() => {
    const el = area.current
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [valor])
  useEffect(() => {
    if (enfocar) area.current?.focus()
  }, [enfocar])
  return (
    <form
      className={`ui-ia-compositor${deshabilitado ? ' is-deshabilitado' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      {abierta && <SugerenciasEscritura lista={lista} escrito={valor} elegida={elegida} elegir={elegir} resaltarEn={setElegida} />}
      <textarea
        ref={area}
        rows={1}
        value={valor}
        disabled={deshabilitado}
        placeholder={aviso ?? 'Pregunta sobre tus sensores, alertas o lecturas…'}
        aria-label="Pregunta para Nico AI"
        onChange={(e) => cambiar(e.target.value)}
        role="combobox"
        aria-expanded={abierta}
        aria-controls={abierta ? 'nico-sugerencias' : undefined}
        aria-autocomplete="list"
        aria-activedescendant={abierta && elegida >= 0 ? `nico-sugerencia-${elegida}` : undefined}
        onKeyDown={(e) => {
          if (abierta && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            const n = lista.length
            setElegida((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i <= 0 ? n : i) - 1))
            return
          }
          if (abierta && e.key === 'Escape') {
            e.preventDefault()
            setCerradaEn(valor)
            return
          }
          if (abierta && e.key === 'Tab' && !e.shiftKey && elegida >= 0) {
            e.preventDefault()
            setCerradaEn(lista[elegida].texto)
            cambiar(lista[elegida].pregunta ?? lista[elegida].texto)
            return
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (abierta && elegida >= 0) elegir(lista[elegida])
            else enviar()
          }
        }}
      />
      <div className="ui-ia-compositor__barra">
        <span className="ui-ia-alcance">
          <Icon name={alcance.startsWith('Dispositivo') ? 'cpu' : 'map-pin'} size={14} /> <span className="ui-ia-alcance__texto" title={alcance}>{alcance}</span>
        </span>
        <span className="ui-ia-compositor__botones">
        {pensando ? (
          <button type="button" className="ui-ia-enviar is-detener" aria-label="Detener" onClick={detener}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="ui-ia-enviar" aria-label="Enviar" disabled={deshabilitado || !valor.trim()}>
            <ArrowUp size={18} />
          </button>
        )}
        </span>
      </div>
    </form>
  )
}

// `eyebrow`, `acciones` y `consola` (saludo de Nico en primera persona) permiten usar la misma pantalla en la consola de Nico AI (con el selector de
// empresa y área en el encabezado).
export function AgentePage({ eyebrow = 'Pregunta sobre los sensores de tu organización', acciones, consola = false } = {}) {
  const { usuario } = useSesion()
  const navegarA = useNavigate()
  const ag = useAgente()
  const { conversaciones, actual, conv, pensando, animada, dispositivos, dispositivoAgente } = ag
  const [texto, setTexto] = useState('')
  const cambiarTexto = setTexto
  // En el celular las conversaciones se abren encima del chat, así que empiezan ocultas.
  const movil = useEsMovil()
  const [panel, setPanel] = useState(() => !window.matchMedia?.(CONSULTA_MOVIL).matches)
  const [busquedaConv, setBusquedaConv] = useState('')
  const [renombrando, setRenombrando] = useState(null)
  const [tituloEdit, setTituloEdit] = useState('')
  // Sugerencias mientras se escribe: se piden una vez por dispositivo y se filtran aquí.
  const [escritura, setEscritura] = useState(null)
  const numAgente = dispositivoAgente?.num
  useEffect(() => {
    if (!numAgente) return undefined
    let vivo = true
    agenteApi
      .sugerenciasEscritura(numAgente)
      .then((r) => vivo && setEscritura({ activas: r.activas, maximo: r.maximo, lista: r.sugerencias.map((x) => ({ ...x, normal: normalizar(x.texto) })), inicio: r.inicio ?? [], num: numAgente }))
      .catch(() => vivo && setEscritura(null))
    return () => {
      vivo = false
    }
  }, [numAgente])
  const [visor, setVisor] = useState(null)
  const [ampliado, setAmpliado] = useState(false)
  const cerrarVisor = useCallback(() => {
    setVisor(null)
    setAmpliado(false)
  }, [])
  const hilo = useRef(null)
  // Al abrir o cerrar el visor (o el panel) la columna del chat cambia de lugar: en vez de saltar,
  // se desliza desde donde estaba hasta su nueva posición (técnica FLIP).
  const columna = useRef(null)
  const posAntes = useRef(null)
  const disposicion = `${visor?.num ?? ''}|${panel}`
  const dispAntes = useRef(disposicion)
  useLayoutEffect(() => {
    const el = columna.current
    const x = el?.getBoundingClientRect().left ?? null
    const antes = posAntes.current
    const cambio = dispAntes.current !== disposicion
    posAntes.current = x
    dispAntes.current = disposicion
    if (!cambio || x == null || antes == null || Math.abs(antes - x) < 2 || sinMovimiento()) return
    el.animate([{ transform: `translateX(${antes - x}px)` }, { transform: 'none' }], {
      duration: 460,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    })
  })

  const mensajes = conv?.mensajes ?? []
  const enHilo = mensajes.length > 0 || pensando
  const nombreAgente = dispositivoAgente?.nombre ?? 'tu dispositivo'
  const areaAlcance = ag.areas?.find((a) => a.num === ag.areaAlcance) ?? null
  const nombreArea = areaAlcance?.nombre ?? 'tu área'
  const puedeOrganizacion = ['ADMIN', 'SUPER'].includes(usuario?.rol)
  const alcanceTexto =
    ag.alcance === 'AREA'
      ? `Área: ${nombreArea}`
      : ag.alcance === 'ORGANIZACION'
        ? 'Toda la organización'
        : `Dispositivo: ${nombreAgente}`

  // Resumen del equipo en el estado vacío: últimas lecturas, alertas pendientes y conexión.
  // Usa los endpoints que ya existen; no calcula cifras nuevas.
  const [resumen, setResumen] = useState(null)
  useEffect(() => {
    if (enHilo || !dispositivoAgente) {
      setResumen(null)
      return undefined
    }
    let vivo = true
    Promise.all([dispositivosApi.ultimasLecturas(dispositivoAgente.num), alertasApi.lista()])
      .then(([lecturas, alertas]) => {
        if (!vivo) return
        const pendientes = (alertas?.results ?? []).filter(
          (a) => a.dispositivo === dispositivoAgente.num && a.estado === 'PENDIENTE',
        ).length
        const estado = { LINEA: 'En línea', SINCONEX: 'Sin conexión', CALENT: 'Calentando' }[dispositivoAgente.estado_dispositivo] ?? 'Sin conexión'
        setResumen({ lecturas, pendientes, estado })
      })
      .catch(() => vivo && setResumen(null))
    return () => {
      vivo = false
    }
  }, [enHilo, dispositivoAgente])

  useEffect(() => {
    const el = hilo.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: sinMovimiento() ? 'auto' : 'smooth' })
  }, [mensajes.length, pensando])
  // Mientras la respuesta se escribe, el hilo baja con ella (salvo que la persona haya subido a leer).
  useEffect(() => {
    const el = hilo.current
    if (!el) return undefined
    let alFondo = true
    const alDesplazar = () => (alFondo = el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    const obs = new ResizeObserver(() => alFondo && (el.scrollTop = el.scrollHeight))
    el.addEventListener('scroll', alDesplazar)
    obs.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', alDesplazar)
      obs.disconnect()
    }
  }, [actual, enHilo])

  // Plan de lo que Nico AI muestra mientras responde; fija también el tiempo mínimo (1 a 3 s).
  const [plan, setPlan] = useState(() => planDe('', nombreAgente))
  // Reportes generados en la conversación (sin repetir), del más reciente al más antiguo.
  const reportes = [...new Map(mensajes.filter((m) => m.reporte?.num).map((m) => [m.reporte.num, m.reporte])).values()].reverse()
  const puedeReporte = ROLES_REPORTE.includes(usuario?.rol)
  // Lo que se resuelve en el navegador, sin servidor ni IA: saludos y ayuda, ir a otra sección,
  // editar la plantilla del reporte de la conversación y elegir plantilla antes de generar.
  const local = async (pregunta) => {
    // Con un reporte preparado, «ok» o «cancela» los responde el servidor (confirma o descarta).
    if (mensajes.at(-1)?.accion) return null
    const rapida = respuestaRapida(pregunta, { nombre: usuario?.nombre?.split(' ')[0], dispositivo: nombreAgente })
    if (rapida) return rapida
    const reporte = visor ?? reportes[0]
    const orden = reporte && puedeReporte ? await interpretar(pregunta, reporte) : null
    if (orden) {
      const ultimaEdicion = mensajes.findLast((m) => m.edicion?.num === reporte.num && m.edicion.previo)?.edicion
      const r = await aplicar(orden, reporte, ultimaEdicion, usuario?.rol)
      return { ...r, reporteEditado: reporte }
    }
    if (puedeReporte && esReporte(pregunta)) {
      const opciones = await plantillas()
      if (opciones.length > 1)
        return { texto: '¿Con qué plantilla genero el reporte? Estos son los elementos de cada una.', plantillas: { pregunta, opciones } }
    }
    return null
  }
  const preguntar = async (pregunta, base) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    const r = base ? null : await local(pregunta)
    if (r) {
      ag.responderLocal(pregunta, r)
      if (r.ir) setTimeout(() => navegarA(r.ir), 900)
      return
    }
    const previa = (base ?? mensajes).filter((m) => m.de === 'yo' && m.texto !== pregunta).at(-1)?.texto ?? ''
    const nuevo = planDe(pregunta, nombreAgente, previa)
    setPlan(nuevo)
    // La plantilla elegida acompaña al reporte hasta que se confirma (o se completa el periodo).
    const pendiente = base ? null : mensajes.at(-1)
    const formato = pendiente?.de === 'agente' && (pendiente.accion || pendiente.faltan) ? pendiente.formato : null
    ag.preguntar(pregunta, base, nuevo.ms, formato ? { extra: { formato } } : undefined)
  }
  const elegirPlantilla = (pregunta, opcion) => {
    if (pensando) return
    const nuevo = planDe(pregunta, nombreAgente)
    setPlan(nuevo)
    ag.preguntar(pregunta, mensajes, nuevo.ms, { mostrar: `Con la plantilla «${opcion.nombre}»`, extra: { formato: opcion.id } })
  }
  // El reporte generado con una plantilla elegida queda asignado a ella.
  const delHilo = conv?.mensajes
  useEffect(() => {
    for (const m of delHilo ?? []) if (m.reporte?.num && m.formato) asignarFormato(m.reporte.num, m.formato)
  }, [delHilo])
  const descargarReporte = (r) => reportesApi.descargarArchivo(r.num, nombreReporte(r)).catch(() => {})
  const resolverAlerta = useCallback(
    async (alerta, accion, observaciones) => {
      try {
        await (accion === 'atender' ? alertasApi.atender : alertasApi.descartar)(alerta.num, observaciones)
        ag.agregarRespuesta({
          texto: `Listo, la alerta de ${alerta.variable} en ${alerta.dispositivo} quedó ${
            accion === 'atender' ? 'atendida' : 'descartada'
          }.`,
        })
        return null
      } catch (e) {
        return e.datos?.observaciones?.[0] ?? e.message ?? 'No se pudo resolver la alerta. Intenta de nuevo.'
      }
    },
    [ag],
  )
  const detener = () => ag.detener()
  const nueva = () => {
    ag.nueva()
    setTexto('')
  }
  const regenerarMensaje = (indice) => {
    const i = mensajes.slice(0, indice).findLastIndex((m) => m.de === 'yo')
    if (i >= 0) preguntar(mensajes[i].texto, mensajes.slice(0, i + 1))
  }
  const borrar = ag.borrar
  const grupos = useMemo(() => gruposConversaciones(conversaciones, busquedaConv), [conversaciones, busquedaConv])
  const borrarConversacion = async (c) => {
    const ok = await confirmar({
      titulo: 'Borrar conversación',
      mensaje: `¿Borrar «${c.titulo}»? Esta acción no se puede deshacer.`,
      confirmar: 'Borrar',
      peligro: true,
    })
    if (ok) borrar(c.id)
  }
  const guardarTitulo = (id) => {
    ag.renombrar(id, tituloEdit)
    setRenombrando(null)
    setTituloEdit('')
  }
  // Banco de preguntas sugeridas, justo arriba de la caja de texto: aparece cuando la última
  // respuesta termina de escribirse y cambia según su tema. Todas responden al instante.
  const [terminada, setTerminada] = useState(null)
  // Al elegir una sugerencia, el botón sube y se desvanece (como si se enviara) y luego se pregunta.
  const [elegida, setElegida] = useState(null)
  const elegir = (texto) => {
    if (sinMovimiento()) return preguntar(texto)
    setElegida(texto)
    setTimeout(() => {
      setElegida(null)
      preguntar(texto)
    }, 240)
  }
  const ultimo = mensajes.at(-1)
  const listo = ultimo?.de === 'agente' && !pensando && (ultimo.clave !== animada || terminada === ultimo.clave)
  // Mientras se elige plantilla no se sugiere nada; tras una edición, se sugieren más ediciones.
  const sugerencias =
    listo && !ultimo.plantillas
      ? siguientes(mensajes.findLast((x) => x.de === 'yo')?.texto ?? '', {
          reporte: puedeReporte,
          hechas: mensajes.filter((x) => x.de === 'yo').map((x) => x.texto),
          tema: ultimo.accion ? 'ACCION' : ultimo.edicion ? 'EDICION' : ultimo.reporte ? 'REPORTE' : undefined,
        })
      : []

  // Las sugerencias visibles se piden de antemano: al tocarlas, la respuesta ya está lista.
  const textosSugeridos = sugerencias.map((x) => x.texto).join('|')
  const conAccion = Boolean(ultimo?.accion)
  const precargar = ag.precargar
  useEffect(() => {
    // Confirmar o cancelar no se precargan: harían la acción antes de que el usuario la elija.
    if (!textosSugeridos || conAccion) return undefined
    const t = setTimeout(() => precargar(textosSugeridos.split('|')), 600)
    return () => clearTimeout(t)
  }, [textosSugeridos, precargar, conAccion])

  // Estado con texto en la cabecera; el punto se conserva como señal visual.
  const estadoTexto = ag.agenteActivo ? 'En línea' : ag.modoPruebas ? 'Modo de pruebas' : 'Sin conexión'
  const avisoPuente = !ag.agenteActivo
    ? ag.motivo ||
      (usuario?.rol === 'ADMIN'
        ? 'El equipo puente está desconectado. Como administrador puedes probar a Nico; los demás usuarios no podrán usarlo hasta que vuelva.'
        : `Nico AI no está disponible: ${nombreAgente} no está activo (su ESP32 no está conectado).`)
    : null
  const horaActual = new Date().getHours()
  const saludo = `${
    horaActual < 12 ? 'Buenos días' : horaActual < 19 ? 'Buenas tardes' : 'Buenas noches'
  }, ${usuario?.nombre?.split(' ')[0] ?? 'equipo'}`
  const sugerenciasInicio =
    escritura && escritura.num === numAgente && escritura.inicio?.length
      ? escritura.inicio
      : SUGERENCIAS_BASE.map((s) => ({ ...s, texto: s.texto.replace('el dispositivo', nombreAgente) }))
  const compositor = (
    <Compositor
      valor={texto}
      cambiar={cambiarTexto}
      enviar={(elegido) => (typeof elegido === 'string' ? preguntar(elegido) : preguntar(texto))}
      detener={detener}
      sugerencias={escritura?.num === numAgente ? escritura : null}
      pensando={pensando}
      enfocar={actual}
      alcance={alcanceTexto}
      deshabilitado={!dispositivoAgente || !ag.agenteDisponible}
      aviso={dispositivoAgente && !ag.agenteDisponible ? `Nico AI no disponible: ${nombreAgente} no está activo` : undefined}
    />
  )

  return (
    <Pantalla eyebrow={eyebrow} titulo="Nico AI" acciones={acciones}>
      <div className={`ui-ia${panel && !visor ? '' : ' is-sin-panel'}${visor ? ' con-visor' : ''}`}>
        {panel && !visor && (
          <aside className="ui-ia-panel" aria-label="Conversaciones">
            <button
              type="button"
              className="ui-ia-nueva"
              onClick={() => {
                nueva()
                if (movil) setPanel(false)
              }}
            >
              <SquarePen size={16} /> Nueva conversación
            </button>
            <span className="ui-eyebrow ui-ia-panel__titulo">Recientes</span>
            <label className="ui-ia-buscador">
              <Icon name="search" size={14} />
              <input
                type="search"
                value={busquedaConv}
                placeholder="Buscar conversaciones…"
                aria-label="Buscar conversaciones"
                onChange={(e) => setBusquedaConv(e.target.value)}
              />
            </label>
            <div className="ui-ia-historial nc-scroll">
              {conversaciones.length === 0 && <p className="ui-muted ui-ia-panel__vacio">Tus conversaciones aparecerán aquí.</p>}
              {conversaciones.length > 0 && grupos.length === 0 && (
                <p className="ui-muted ui-ia-panel__vacio">No hay conversaciones que coincidan.</p>
              )}
              {grupos.map((grupo) => (
                <div key={grupo.id} className="ui-ia-grupo">
                  <span className="ui-eyebrow">{grupo.label}</span>
                  {grupo.items.map((c) => (
                    <div key={c.id} className={`ui-ia-conv${c.id === actual ? ' is-actual' : ''}`}>
                      {renombrando === c.id ? (
                        <input
                          className="ui-ia-conv__titulo-input"
                          value={tituloEdit}
                          autoFocus
                          aria-label={`Nuevo título de ${c.titulo}`}
                          onChange={(e) => setTituloEdit(e.target.value)}
                          onBlur={() => guardarTitulo(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              guardarTitulo(c.id)
                            }
                            if (e.key === 'Escape') {
                              setRenombrando(null)
                              setTituloEdit('')
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            ag.abrir(c.id)
                            if (movil) setPanel(false)
                          }}
                          title={c.titulo}
                        >
                          <MessageSquare size={14} />
                          <span className="ui-ia-conv__texto">
                            <span>{c.titulo}</span>
                            {(c.etiqueta || c.agente) && <small>{c.etiqueta ?? ag.nombreAgente(c.agente)}</small>}
                          </span>
                        </button>
                      )}
                      <span className="ui-ia-conv__menu" onClick={(e) => e.stopPropagation()}>
                        <MenuAcciones
                          label={`Opciones de ${c.titulo}`}
                          items={[
                            {
                              label: 'Renombrar',
                              icon: 'pencil',
                              onClick: () => {
                                setRenombrando(c.id)
                                setTituloEdit(c.titulo)
                              },
                            },
                            {
                              label: 'Borrar',
                              icon: 'trash-2',
                              peligro: true,
                              onClick: () => borrarConversacion(c),
                            },
                          ]}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        )}
        <section className="ui-ia-principal">
          <div className="ui-ia-barra">
            <button
              type="button"
              className="ui-ia-icono"
              aria-label={panel ? 'Ocultar conversaciones' : 'Mostrar conversaciones'}
              onClick={() => setPanel((p) => !p)}
            >
              <PanelLeft size={18} />
            </button>
            <span className="ui-ia-barra__titulo">{conv?.titulo ?? 'Nueva conversación'}</span>
            <span className="ui-ia-divisor" aria-hidden />
            <Archivos reportes={reportes} visualizar={setVisor} descargar={descargarReporte} />
            <span className="ui-ia-divisor" aria-hidden />
            <div className="ui-ia-agente">
              <span className={`ui-ia-estado${ag.agenteActivo ? ' is-activo' : ''}`}>
                <span className="ui-ia-estado__punto" aria-hidden />
                {estadoTexto}
              </span>
              {/* Un solo selector de alcance: dispositivos, áreas visibles y, para ADMIN y SUPER, toda la organización. */}
              <Desplegable
                icon={ag.alcance === 'DISPOSITIVO' ? 'cpu' : 'map-pin'}
                value={ag.alcance === 'DISPOSITIVO' ? `d:${ag.agente ?? ''}` : ag.alcance === 'AREA' ? `a:${ag.areaAlcance ?? ''}` : 'org'}
                onChange={(valor) => {
                  const [tipo, num] = String(valor).split(':')
                  if (tipo === 'd') {
                    ag.setAlcance('DISPOSITIVO')
                    ag.setAgente(Number(num))
                  } else if (tipo === 'a') {
                    ag.setAreaAlcance(num)
                    ag.setAlcance('AREA')
                  } else {
                    ag.setAlcance('ORGANIZACION')
                  }
                }}
                placeholder="Sin dispositivos"
                disabled={!dispositivos.length && !ag.areas?.length}
                options={[
                  ...dispositivos.map((d) => ({ value: `d:${d.num}`, label: `Dispositivo: ${d.nombre}` })),
                  ...(ag.areas ?? []).map((a) => ({ value: `a:${a.num}`, label: `Área: ${a.nombre}` })),
                  ...(puedeOrganizacion ? [{ value: 'org', label: 'Toda la organización' }] : []),
                ]}
              />
            </div>
          </div>
          {avisoPuente && (
            <div className="ui-ia-aviso-puente" role="status">
              <Icon name="triangle-alert" size={16} />
              <span>{avisoPuente}</span>
            </div>
          )}

          {mensajes.length === 0 && !pensando ? (
            <div className="ui-ia-inicio">
              <Marca grande />
              <h2>{consola ? <>Hola, soy <span>Nico</span></> : saludo}</h2>
              <p className="ui-muted">
                Pregunta sobre lecturas, alertas y reportes de{' '}
                {ag.alcance === 'AREA' ? nombreArea : ag.alcance === 'ORGANIZACION' ? 'toda la organización' : nombreAgente}
              </p>
              {/* El resumen es del dispositivo elegido; con alcance de área u organización no aplica. */}
              {ag.alcance === 'DISPOSITIVO' && (
              <div className="ui-ia-resumen" aria-label="Resumen del equipo">
                <div className="ui-ia-resumen__bloque">
                  <span className="ui-eyebrow">Últimas lecturas</span>
                  {resumen?.lecturas?.length ? (
                    <span className="ui-ia-resumen__variable">
                      {['TEMP', 'HUM', 'AIRE'].map((codigo) => {
                        const lectura = resumen.lecturas.find((l) => l.variable === codigo)
                        if (!lectura) return null
                        return (
                          <span key={codigo} className="ui-ia-resumen__dato">
                            <strong className="ui-num">
                              {Number(lectura.valor).toFixed(VARIABLE[codigo].decimales)} {UNIDAD[codigo]}
                            </strong>
                            <small>{hora(lectura.fecha_hora)}</small>
                          </span>
                        )
                      })}
                    </span>
                  ) : (
                    <strong className="ui-muted">Sin lecturas recientes</strong>
                  )}
                </div>
                <div className="ui-ia-resumen__bloque">
                  <span className="ui-eyebrow">Pendientes · este dispositivo</span>
                  <strong className="ui-num">{resumen?.pendientes ?? 0}</strong>
                </div>
                <div className="ui-ia-resumen__bloque">
                  <span className="ui-eyebrow">Conexión</span>
                  <strong>{resumen?.estado ?? 'Sin conexión'}</strong>
                </div>
              </div>
              )}
              <div className="ui-ia-inicio__compositor">{compositor}</div>
              <div className="ui-ia-sugerencias">
                {sugerenciasInicio.map((s) => (
                  <button key={s.texto} type="button" onClick={() => preguntar(s.texto)}>
                    <span className="ui-ia-sugerencias__icono">
                      <Icon name={s.icono} size={16} />
                    </span>
                    <strong>{s.titulo}</strong>
                    <span>{s.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="ui-ia-hilo nc-scroll" ref={hilo}>
                <div ref={columna} className="ui-ia-columna">
                  {mensajes.map((m, i) =>
                    m.de === 'yo' ? (
                      <div key={i} className="ui-ia-mio">
                        {m.texto}
                      </div>
                    ) : m.de === 'error' ? (
                      <div key={i} className="ui-ia-mensaje">
                        <Marca />
                        <div className="ui-ia-cuerpo ui-ia-error">
                          <strong>
                            {m.motivo ||
                              (m.inactivo
                                ? `Nico AI no está disponible: ${nombreAgente} no está activo`
                                : m.caido
                                  ? 'Nico AI no está disponible por ahora'
                                  : 'No se pudo obtener la respuesta')}
                          </strong>
                          <span className="ui-muted">
                            {m.inactivo
                              ? 'Su ESP32 no está conectado (sin corriente o sin WiFi). El monitoreo y las alertas siguen funcionando.'
                              : 'El monitoreo y las alertas siguen funcionando.'}
                          </span>
                          {i === mensajes.length - 1 && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="history"
                              onClick={() => preguntar(m.pregunta, mensajes.slice(0, i))}
                            >
                              Reintentar
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Respuesta
                        key={m.clave ?? i}
                        m={m}
                        autor={`Nico AI · ${conv?.etiqueta ?? ag.nombreAgente(conv?.agente)}`}
                        ultima={i === mensajes.length - 1 && !pensando}
                        animar={m.clave === animada}
                        regenerar={() => regenerarMensaje(i)}
                        calificar={(voto) => {
                          ag.editar(actual, (ms) => ms.map((x, j) => (j === i ? { ...x, voto } : x)))
                          if (m.registro) agenteApi.calificar(m.registro, voto).catch(() => {})
                        }}
                        visualizar={setVisor}
                        visorAbierto={visor?.num}
                        alTerminar={() => setTerminada(m.clave)}
                        elegirPlantilla={elegirPlantilla}
                        deshacer={() => preguntar('Deshaz el último cambio')}
                        puedeAtender={['ADMIN', 'SUPER'].includes(usuario?.rol)}
                        resolverAlerta={resolverAlerta}
                      />
                    ),
                  )}
                  {pensando && <Pensando plan={plan} />}
                </div>
              </div>
              <div className="ui-ia-pie">
                {sugerencias.length > 0 && (
                  <div
                    key={ultimo?.clave ?? mensajes.length}
                    className={`ui-ia-seguir${elegida ? ' is-eligiendo' : ''}`}
                    aria-label="Preguntas sugeridas"
                  >
                    {sugerencias.map((x) => (
                      <button
                        key={x.texto}
                        type="button"
                        className={elegida === x.texto ? 'is-elegida' : ''}
                        disabled={!!elegida}
                        onClick={() => elegir(x.texto)}
                      >
                        <span className="ui-ia-seguir__icono">
                          <Icon name={x.icono} size={14} />
                        </span>
                        {x.texto}
                        <span className="ui-ia-seguir__enviar" aria-hidden>
                          <Icon name="arrow-up-right" size={14} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {compositor}
              </div>
            </>
          )}
          <p className="ui-ia-aviso">
            Nico AI responde solo sobre los sensores de tu organización y puede equivocarse. Verifica las cifras en Histórico.
          </p>
        </section>
        {visor && <VisorReporte key={visor.num} resumen={visor} cerrar={cerrarVisor} ampliado={ampliado} ampliar={setAmpliado} />}
      </div>
    </Pantalla>
  )
}
