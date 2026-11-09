import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { Button, Icon, TrendChart } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { Pantalla } from '../../components/Pantalla'
import { useAgente } from '../../context/AgenteContext'
import { useSesion } from '../../context/SesionContext'

const SUGERENCIAS = [
  { icono: 'droplets', titulo: 'Picos de humedad', texto: '¿A qué hora hubo picos de humedad esta semana en Sala limpia?' },
  { icono: 'bell', titulo: 'Alertas del mes', texto: '¿Qué dispositivo tuvo más alertas este mes?' },
  { icono: 'thermometer', titulo: 'Temperatura', texto: '¿Cómo estuvo la temperatura en Moldeo esta semana?' },
  { icono: 'wifi-off', titulo: 'Conexión', texto: '¿Qué sensores perdieron conexión en los últimos 7 días?' },
]
// Pasos que se muestran mientras el agente prepara la respuesta.
const PASOS = ['Entendiendo la pregunta', 'Consultando las lecturas', 'Comparando con los umbrales', 'Redactando la respuesta']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Marca del agente: el brote de Núcleo dentro de un círculo; gira mientras piensa.
function Marca({ pensando, grande }) {
  return (
    <span className={`ui-ia-marca${pensando ? ' is-pensando' : ''}${grande ? ' ui-ia-marca--grande' : ''}`} aria-hidden>
      <Icon name="sparkles" size={grande ? 28 : 16} />
    </span>
  )
}

// El texto aparece palabra por palabra, como en los asistentes de IA.
function TextoEscrito({ texto, animar, listo }) {
  const palabras = texto.split(' ')
  const [n, setN] = useState(animar && !sinMovimiento() ? 0 : palabras.length)
  useEffect(() => {
    if (n >= palabras.length) {
      listo?.()
      return undefined
    }
    const t = setTimeout(() => setN((x) => x + 1), 28)
    return () => clearTimeout(t)
  }, [n, palabras.length, listo])
  return (
    <p className="ui-ia-texto">
      {palabras.slice(0, n).join(' ')}
      {n < palabras.length && <span className="ui-ia-cursor" />}
    </p>
  )
}

function Pensando() {
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setPaso((p) => Math.min(p + 1, PASOS.length - 1)), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ui-ia-mensaje" aria-live="polite">
      <Marca pensando />
      <div className="ui-ia-cuerpo">
        <span className="ui-ia-brillo">{PASOS[paso]}…</span>
        <ol className="ui-ia-pasos">
          {PASOS.slice(0, paso + 1).map((p, i) => (
            <li key={p} className={i < paso ? 'is-hecho' : ''}>
              {i < paso ? <Check size={13} /> : <span className="ui-ia-punto" />} {p}
            </li>
          ))}
        </ol>
      </div>
    </div>
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

function Respuesta({ m, autor, ultima, animar, regenerar, calificar }) {
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
    <div className="ui-ia-mensaje">
      <Marca />
      <div className="ui-ia-cuerpo">
        <div className="ui-ia-autor">
          <strong>{autor}</strong>
          <span className="ui-muted">{m.hora}</span>
        </div>
        <TextoEscrito texto={m.texto} animar={animar} listo={() => setCompleta(true)} />
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
          <div className="ui-ia-acciones">
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
        aria-label="Pregunta para el agente"
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
  const ag = useAgente()
  const { conversaciones, actual, conv, pensando, animada, dispositivos, dispositivoAgente } = ag
  const [texto, setTexto] = useState('')
  const [panel, setPanel] = useState(true)
  const hilo = useRef(null)

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

  const preguntar = (pregunta, base) => {
    if (!pregunta.trim() || pensando) return
    setTexto('')
    ag.preguntar(pregunta, base)
  }
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
    <Pantalla eyebrow="Pregunta sobre los sensores de tu organización" titulo="Agente IA">
      <div className={`ui-ia${panel ? '' : ' is-sin-panel'}`}>
        {panel && (
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
            <div className="ui-ia-agente">
              <span className="ui-ia-estado__punto" aria-hidden />
              <Desplegable
                icon="cpu"
                value={ag.agente ?? ''}
                onChange={ag.setAgente}
                placeholder="Sin dispositivos"
                disabled={!dispositivos.length}
                options={dispositivos.map((d) => ({ value: d.num, label: `Agente · ${d.nombre}` }))}
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
                {SUGERENCIAS.map((s) => (
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
                <div className="ui-ia-columna">
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
                            {m.caido ? 'El agente no está disponible por ahora' : 'No se pudo obtener la respuesta'}
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
                        autor={`Agente ${ag.nombreAgente(conv?.agente)}`}
                        ultima={i === mensajes.length - 1 && !pensando}
                        animar={m.clave === animada}
                        regenerar={regenerar}
                        calificar={(voto) => ag.editar(actual, (ms) => ms.map((x, j) => (j === i ? { ...x, voto } : x)))}
                      />
                    ),
                  )}
                  {pensando && <Pensando />}
                </div>
              </div>
              <div className="ui-ia-pie">{compositor}</div>
            </>
          )}
          <p className="ui-ia-aviso">
            El agente responde solo sobre los sensores de tu organización y puede equivocarse. Verifica las cifras en Histórico.
          </p>
        </section>
      </div>
    </Pantalla>
  )
}
