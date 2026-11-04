import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Chip, EmptyState, IconCircle, TrendChart } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import * as agenteApi from '../../services/agente'
import { hora } from '../../utils/formato'

const SUGERENCIAS = [
  '¿A qué hora hubo picos de humedad esta semana en Sala limpia?',
  '¿Qué dispositivo tuvo más alertas este mes?',
]
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']

function Respuesta({ m }) {
  const navegar = useNavigate()
  if (!m.picos) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderRadius: 24, background: 'var(--surface)', alignSelf: 'flex-start' }}>
        <IconCircle name="sparkles" tone="ink" size="sm" />
        <span style={{ fontSize: 15, lineHeight: '24px', color: 'var(--text-secondary)' }}>{m.texto}</span>
      </div>
    )
  }
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconCircle name="sparkles" tone="ink" size="sm" />
          <strong style={{ fontSize: 14 }}>Agente Núcleo</strong>
          <span className="ui-muted" style={{ fontSize: 12 }}>
            {m.hora}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: '24px', color: 'var(--text-secondary)', textWrap: 'pretty' }}>{m.texto}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
          {m.picos.map((p) => (
            <div key={p.cuando} className="ui-mosaico">
              <span className="ui-eyebrow">{p.cuando}</span>
              <span className="ui-num" style={{ fontSize: 24, lineHeight: '28px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {p.valor.toFixed(1)}
                <span className="ui-muted" style={{ fontSize: 13, fontWeight: 600 }}>
                  {' '}
                  {m.unidad}
                </span>
              </span>
              <span className="ui-muted" style={{ fontSize: 12 }}>
                Máx {m.maximo} {m.unidad}
              </span>
            </div>
          ))}
        </div>
        <TrendChart
          data={m.serie.map((v, i) => ({ label: i % 2 ? '' : DIAS[i / 2], value: v }))}
          unit={m.unidad}
          threshold={{ max: m.maximo }}
          min={40}
          max={80}
          height={110}
          tooltip={false}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon="history" onClick={() => navegar('/mediciones')}>
            Ver en histórico
          </Button>
          <Button variant="ghost" size="sm" icon="file-text" onClick={() => navegar('/reportes')}>
            Generar reporte
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function AgentePage() {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('listo')
  const fin = useRef(null)

  useEffect(() => {
    fin.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [mensajes])

  const preguntar = async (pregunta) => {
    if (!pregunta.trim() || estado === 'pensando') return
    setTexto('')
    setMensajes((m) => [...m, { de: 'yo', texto: pregunta }])
    setEstado('pensando')
    try {
      const r = await agenteApi.preguntar(pregunta)
      setMensajes((m) => [...m, { de: 'agente', hora: hora(new Date().toISOString()), ...r }])
      setEstado('listo')
    } catch (e) {
      setEstado(e.status === 503 ? 'caido' : 'error')
    }
  }
  const caido = estado === 'caido' || estado === 'error'

  return (
    <Pantalla
      eyebrow="Pregunta sobre los sensores de tu organización"
      titulo="Agente IA"
      cifras={{
        principal: {
          etiqueta: 'Agente Núcleo',
          titulo: 'Pregunta lo que quieras sobre tus sensores.',
          sub: caido ? 'No disponible por ahora · el monitoreo sigue funcionando' : 'Responde solo sobre los sensores de tu organización',
          tonoSub: caido ? 'peligro' : 'lima',
        },
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ width: '100%', maxWidth: 820, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>
          {mensajes.map((m, i) =>
            m.de === 'yo' ? (
              <div key={i} className="ui-burbuja">
                {m.texto}
              </div>
            ) : (
              <Respuesta key={i} m={m} />
            ),
          )}
          {estado === 'pensando' && (
            <span className="ui-muted" style={{ fontSize: 14 }}>
              El agente está revisando las lecturas…
            </span>
          )}
          {caido && (
            <div className="ui-centro">
              <Card>
                <div style={{ width: 520, padding: '32px 0' }}>
                  <EmptyState
                    icon="sparkles"
                    title="El agente no está disponible por ahora"
                    message="El monitoreo y las alertas siguen funcionando. Intenta de nuevo en unos minutos."
                    action={
                      <Button variant="secondary" icon="history" onClick={() => setEstado('listo')}>
                        Reintentar
                      </Button>
                    }
                  />
                </div>
              </Card>
            </div>
          )}
          <div ref={fin} />
        </div>
        <div style={{ width: '100%', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!caido && mensajes.length === 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUGERENCIAS.map((s) => (
                <Chip key={s} icon="sparkles" onClick={() => preguntar(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}
          <form
            className="ui-chat-entrada"
            onSubmit={(e) => {
              e.preventDefault()
              preguntar(texto)
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregunta sobre tus sensores…"
              aria-label="Pregunta"
              disabled={caido}
            />
            <Button type="submit" icon="send" disabled={caido || estado === 'pensando' || !texto.trim()}>
              Enviar
            </Button>
          </form>
        </div>
      </div>
    </Pantalla>
  )
}
