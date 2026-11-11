import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  Trash2,
} from 'lucide-react'
import { Button, Icon, Skeleton, TrendChart } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { useCierre } from '../../hooks/useSalida'
import { Pantalla } from '../../components/Pantalla'
import { useAgente } from '../../context/AgenteContext'
import { useSesion } from '../../context/SesionContext'
import { DashboardReporte } from '../reportes/DashboardReporte'
import { descargarPdf } from '../reportes/pdf'
import { asignarFormato, useEdicion } from '../reportes/personalizacion'
import * as reportesApi from '../../services/reportes'
import { esReporte, planDe, respuestaRapida, siguientes } from './proceso'
import { aplicar, interpretar, plantillas } from './edicion'
import { Archivos, Comparativa, Edicion, ElegirPlantilla, GraficaChat } from './Piezas'
import { periodo } from '../../utils/formato'

const SUGERENCIAS = [
  { icono: 'droplets', titulo: 'Picos de humedad', texto: '¿A qué hora hubo picos de humedad esta semana en Sala limpia?' },
  { icono: 'bell', titulo: 'Alertas del mes', texto: '¿Qué dispositivo tuvo más alertas este mes?' },
  { icono: 'thermometer', titulo: 'Temperatura', texto: '¿Cómo estuvo la temperatura en Moldeo esta semana?' },
  { icono: 'wifi-off', titulo: 'Conexión', texto: '¿Qué sensores perdieron conexión en los últimos 7 días?' },
]
// Quienes generan reportes pueden pedírselos al agente; para ellos sustituye a la de conexión.
const SUGERENCIA_REPORTE = { icono: 'file-text', titulo: 'Reporte del mes', texto: 'Genera el reporte de este mes' }
const ROLES_REPORTE = ['ADMIN', 'SUPER', 'ANALISTA']
// Pasos que se muestran mientras el agente prepara la respuesta.
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Marca del agente: el brote de Núcleo dentro de un círculo; gira mientras piensa.
function Marca({ pensando, grande, llega }) {
  return (
    <span className={`ui-ia-marca${pensando ? ' is-pensando' : ''}${grande ? ' ui-ia-marca--grande' : ''}${llega ? ' is-llega' : ''}`} aria-hidden>
      <Icon name="sparkles" size={grande ? 28 : 16} />
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

const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5]
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
  const [zoom, setZoom] = useState(null)
  const [ajuste, setAjuste] = useState(1)
  const caja = useRef(null)
  const ed = useEdicion(resumen.num)
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
  const actual = zoom ?? ajuste
  return (
    <aside ref={caja} className={`ui-ia-visor${ampliado ? ' is-ampliado' : ''}${saliendo ? ' is-saliendo' : ''}`} aria-label="Vista del reporte">
      <header className="ui-ia-visor__barra">
        <span className="ui-ia-visor__titulo">
          <strong>{nombreReporte(resumen)}</strong>
          <span className="ui-muted"> · PDF</span>
        </span>
        <label className="ui-ia-visor__zoom">
          <span className="ui-sr-only">Zoom</span>
          <select value={zoom ?? 'ajustar'} onChange={(e) => setZoom(e.target.value === 'ajustar' ? null : Number(e.target.value))}>
            <option value="ajustar">{`${Math.round(ajuste * 100)} % · Ajustar`}</option>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)} %
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} />
        </label>
        <Button size="sm" icon="download" disabled={!r} onClick={() => descargarPdf(`${nombreReporte(resumen)} · ${ed.formato.nombre}`, caja.current)}>
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
      <div className="ui-ia-visor__hojas nc-scroll" data-zoom={Math.round(actual * 100)}>
        {error ? (
          <span className="ui-aviso ui-aviso--danger" role="alert">
            No se pudo cargar el reporte. Intenta de nuevo o ábrelo en Reportes.
          </span>
        ) : r ? (
          <DashboardReporte r={r} areas={areas} ed={ed} zoom={zoom ?? undefined} alEscalar={setAjuste} />
        ) : (
          <div className="ui-ia-visor__cargando">
            <Skeleton variant="card" />
          </div>
        )}
      </div>
    </aside>
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

function Respuesta({ m, autor, ultima, animar, regenerar, calificar, visualizar, visorAbierto, alTerminar, elegirPlantilla, deshacer }) {
  const navegar = useNavigate()
  const [completa, setCompleta] = useState(!animar)
  const [copiado, setCopiado] = useState(false)
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
            <div className="ui-ia-fuentes">
              <span className="ui-muted">Basado en</span>
              <span className="ui-ia-fuente">
                <Icon name="activity" size={13} /> {m.serie.length} {m.etiquetas ? 'máximos diarios' : 'promedios del periodo'}
              </span>
              <span className="ui-ia-fuente">
                <Icon name="sliders-horizontal" size={13} /> Umbral máx {m.maximo} {m.unidad}
              </span>
            </div>
            <div className="ui-ia-siguientes">
              <Button variant="secondary" size="sm" icon="history" onClick={() => navegar('/mediciones')}>
                Ver en histórico
              </Button>
              <Button variant="ghost" size="sm" icon="file-text" onClick={() => navegar('/reportes')}>
                Generar reporte
              </Button>
            </div>
          </div>
        )}
        {completa && (
          <div className={`ui-ia-acciones${animar ? ' ui-ia-acciones--llega' : ''}`}>
            <button type="button" aria-label={copiado ? 'Copiado' : 'Copiar respuesta'} title="Copiar" onClick={copiar}>
              {copiado ? <Check size={16} /> : <Copy size={16} />}
            </button>
            {ultima && (
              <button type="button" aria-label="Regenerar respuesta" title="Regenerar" onClick={regenerar}>
                <RotateCcw size={16} />
              </button>
            )}
            <button
              type="button"
              aria-label="Buena respuesta"
              title="Buena respuesta"
              aria-pressed={m.voto === 'si'}
              className={m.voto === 'si' ? 'is-activo' : ''}
              onClick={() => calificar(m.voto === 'si' ? null : 'si')}
            >
              <ThumbsUp size={16} />
            </button>
            <button
              type="button"
              aria-label="Mala respuesta"
              title="Mala respuesta"
              aria-pressed={m.voto === 'no'}
              className={m.voto === 'no' ? 'is-activo' : ''}
              onClick={() => calificar(m.voto === 'no' ? null : 'no')}
            >
              <ThumbsDown size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Caja para escribir: crece con el texto, Enter envía y Shift+Enter hace un salto de línea.
function Compositor({ valor, cambiar, enviar, detener, pensando, deshabilitado, enfocar, alcance }) {
  const area = useRef(null)
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
      <textarea
        ref={area}
        rows={1}
        value={valor}
        disabled={deshabilitado}
        placeholder="Pregunta sobre tus sensores, alertas o lecturas…"
        aria-label="Pregunta para Nico AI"
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            enviar()
          }
        }}
      />
      <div className="ui-ia-compositor__barra">
        <span className="ui-ia-alcance">
          <Icon name="cpu" size={14} /> {alcance}
        </span>
        {pensando ? (
          <button type="button" className="ui-ia-enviar is-detener" aria-label="Detener" onClick={detener}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="ui-ia-enviar" aria-label="Enviar" disabled={deshabilitado || !valor.trim()}>
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </form>
  )
}

export function AgentePage() {
  const { usuario } = useSesion()
  const navegarA = useNavigate()
  const ag = useAgente()
  const { conversaciones, actual, conv, pensando, animada, dispositivos, dispositivoAgente } = ag
  const [texto, setTexto] = useState('')
  const [panel, setPanel] = useState(true)
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
  const local = (pregunta) => {
    const rapida = respuestaRapida(pregunta, { nombre: usuario?.nombre?.split(' ')[0], dispositivo: nombreAgente })
    if (rapida) return rapida
    const reporte = visor ?? reportes[0]
    const orden = reporte && puedeReporte ? interpretar(pregunta, reporte.num) : null
    if (orden) {
      const ultimaEdicion = mensajes.findLast((m) => m.edicion?.num === reporte.num && m.edicion.previo)?.edicion
      const r = aplicar(orden, reporte.num, ultimaEdicion)
      return { ...r, reporteEditado: reporte }
    }
    if (puedeReporte && esReporte(pregunta)) {
      const opciones = plantillas()
      if (opciones.length > 1)
        return { texto: '¿Con qué plantilla genero el reporte? Estos son los elementos de cada una.', plantillas: { pregunta, opciones } }
    }
    return null
  }
  const preguntar = (pregunta, base) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    const r = base ? null : local(pregunta)
    if (r) {
      ag.responderLocal(pregunta, r)
      if (r.ir) setTimeout(() => navegarA(r.ir), 900)
      return
    }
    const nuevo = planDe(pregunta, nombreAgente)
    setPlan(nuevo)
    ag.preguntar(pregunta, base, nuevo.ms)
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
  const detener = ag.detener
  const nueva = () => {
    ag.nueva()
    setTexto('')
  }
  const regenerar = () => {
    const i = mensajes.findLastIndex((m) => m.de === 'yo')
    if (i >= 0) preguntar(mensajes[i].texto, mensajes.slice(0, i + 1))
  }
  const borrar = ag.borrar
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
          tema: ultimo.edicion ? 'EDICION' : ultimo.reporte ? 'REPORTE' : undefined,
        })
      : []

  // Las sugerencias visibles se piden de antemano: al tocarlas, la respuesta ya está lista.
  const textosSugeridos = sugerencias.map((x) => x.texto).join('|')
  const precargar = ag.precargar
  useEffect(() => {
    if (!textosSugeridos) return undefined
    const t = setTimeout(() => precargar(textosSugeridos.split('|')), 600)
    return () => clearTimeout(t)
  }, [textosSugeridos, precargar])

  const compositor = (
    <Compositor
      valor={texto}
      cambiar={setTexto}
      enviar={() => preguntar(texto)}
      detener={detener}
      pensando={pensando}
      enfocar={actual}
      alcance={`Sensores de ${nombreAgente}`}
      deshabilitado={!dispositivoAgente}
    />
  )

  return (
    <Pantalla eyebrow="Pregunta sobre los sensores de tu organización" titulo="Nico AI">
      <div className={`ui-ia${panel && !visor ? '' : ' is-sin-panel'}${visor ? ' con-visor' : ''}`}>
        {panel && !visor && (
          <aside className="ui-ia-panel" aria-label="Conversaciones">
            <button type="button" className="ui-ia-nueva" onClick={nueva}>
              <SquarePen size={16} /> Nueva conversación
            </button>
            <span className="ui-eyebrow ui-ia-panel__titulo">Recientes</span>
            <div className="ui-ia-historial nc-scroll">
              {conversaciones.length === 0 && <p className="ui-muted ui-ia-panel__vacio">Tus conversaciones aparecerán aquí.</p>}
              {conversaciones.map((c) => (
                <div key={c.id} className={`ui-ia-conv${c.id === actual ? ' is-actual' : ''}`}>
                  <button type="button" onClick={() => ag.abrir(c.id)} title={c.titulo}>
                    <MessageSquare size={14} />
                    <span className="ui-ia-conv__texto">
                      <span>{c.titulo}</span>
                      {c.agente && <small>{ag.nombreAgente(c.agente)}</small>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ui-ia-conv__borrar"
                    aria-label={`Borrar «${c.titulo}»`}
                    onClick={() => borrar(c.id)}
                  >
                    <Trash2 size={14} />
                  </button>
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
            <Archivos reportes={reportes} visualizar={setVisor} descargar={descargarReporte} />
            <div className="ui-ia-agente">
              <span className="ui-ia-estado__punto" aria-hidden />
              <Desplegable
                icon="cpu"
                value={ag.agente ?? ''}
                onChange={ag.setAgente}
                placeholder="Sin dispositivos"
                disabled={!dispositivos.length}
                options={dispositivos.map((d) => ({ value: d.num, label: `Nico AI · ${d.nombre}` }))}
              />
            </div>
          </div>

          {mensajes.length === 0 && !pensando ? (
            <div className="ui-ia-inicio">
              <Marca grande />
              <h2>
                Hola, <span>{usuario?.nombre ?? 'equipo'}</span>
              </h2>
              <p className="ui-muted">¿Qué quieres saber hoy de {nombreAgente}?</p>
              <div className="ui-ia-inicio__compositor">{compositor}</div>
              <div className="ui-ia-sugerencias">
                {(ROLES_REPORTE.includes(usuario?.rol) ? [...SUGERENCIAS.slice(0, 3), SUGERENCIA_REPORTE] : SUGERENCIAS).map((s) => (
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
                            {m.caido ? 'Nico AI no está disponible por ahora' : 'No se pudo obtener la respuesta'}
                          </strong>
                          <span className="ui-muted">El monitoreo y las alertas siguen funcionando.</span>
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
                        autor={`Nico AI · ${ag.nombreAgente(conv?.agente)}`}
                        ultima={i === mensajes.length - 1 && !pensando}
                        animar={m.clave === animada}
                        regenerar={regenerar}
                        calificar={(voto) => ag.editar(actual, (ms) => ms.map((x, j) => (j === i ? { ...x, voto } : x)))}
                        visualizar={setVisor}
                        visorAbierto={visor?.num}
                        alTerminar={() => setTerminada(m.clave)}
                        elegirPlantilla={elegirPlantilla}
                        deshacer={() => preguntar('Deshaz el último cambio')}
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
