import { useMemo, useState } from 'react'
import {
  ActivityFeed, Badge, Button, Card, IconCircle, Input, Skeleton, StatusBadge, Tabs,
} from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as alertasApi from '../../services/alertas'
import * as usuariosApi from '../../services/usuarios'
import {
  ESTADO_ALERTA, limiteAlerta, NIVEL_ALERTA, nombreCorto, pagina, puedeEditar, tituloAlerta, valorAlerta, VARIABLE,
} from '../../utils/convertir'
import { esHoy, hora, horaSeg } from '../../utils/formato'

const PESTANAS = [
  ['PENDIENTE', 'Pendientes'],
  ['ATENDIDA', 'Atendidas'],
  ['DESCARTADA', 'Descartadas'],
  ['todas', 'Todas'],
]

async function cargar(rol) {
  const alertas = pagina(await alertasApi.lista())
  let usuarios = []
  if (puedeEditar(rol)) {
    try {
      usuarios = pagina(await usuariosApi.lista())
    } catch {
      usuarios = []
    }
  }
  return { alertas: alertas.sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1)), usuarios }
}

function Detalle({ a, usuarios, editable, alResolver }) {
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const n = NIVEL_ALERTA[a.nivel]
  const est = ESTADO_ALERTA[a.estado]
  const quien = usuarios.find((u) => u.num === a.atendida_por)
  const linea = [
    { level: n.level, title: 'Creada', meta: `Lectura de ${valorAlerta(a)} a las ${horaSeg(a.lectura_fecha_hora)}`, time: hora(a.fecha_hora) },
    { level: 'info', icon: 'bell', title: 'Notificada', meta: 'Correo a los responsables del área', time: hora(a.fecha_hora) },
    a.estado === 'PENDIENTE'
      ? { level: 'info', icon: 'clock', title: 'Pendiente de atención', meta: 'Atiende o descarta con una nota', time: '—', unread: true }
      : {
          level: a.estado === 'ATENDIDA' ? 'normal' : 'offline',
          icon: est.icon,
          title: est.label,
          meta: `${quien ? `Por ${nombreCorto(quien)}` : ''}${a.observaciones ? ` · ${a.observaciones}` : ''}`,
          time: hora(a.fecha_atencion),
        },
  ]
  const resolver = async (accion) => {
    setEnviando(true)
    setError(null)
    try {
      const nueva = await (accion === 'atender' ? alertasApi.atender(a.num, nota) : alertasApi.descartar(a.num, nota))
      setNota('')
      alResolver(nueva)
    } catch (e) {
      setError(e.status === 409 ? 'Alguien más ya resolvió esta alerta.' : 'No se pudo guardar. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }
  return (
    <div className="ui-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconCircle name={n.icon} tone={n.tone} size="md" />
        <div className="ui-titulo-fila">
          <strong style={{ fontSize: 17, lineHeight: '24px' }}>{tituloAlerta(a)}</strong>
          <span>{a.dispositivo_nombre}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 48, lineHeight: '52px', fontWeight: 700, letterSpacing: '-0.03em' }} className="ui-num">
          {Number(a.lectura_valor).toFixed(VARIABLE[a.variable].decimales)}
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-muted)' }}> {a.unidad}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: 6 }}>
          {limiteAlerta(a).replace(/^m/, 'M')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <StatusBadge status={n.status} />
        <Badge tone={est.tone} icon={est.icon}>
          {est.label}
        </Badge>
      </div>
      <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
        <span className="ui-eyebrow">Línea de tiempo</span>
        <ActivityFeed items={linea} />
      </div>
      {a.estado === 'PENDIENTE' && editable && (
        <>
          <Input
            label="Nota"
            placeholder="Qué hiciste o por qué la descartas"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            error={error ?? undefined}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="secondary" icon="circle-x" className="ui-flex" disabled={enviando} onClick={() => resolver('descartar')}>
              Descartar
            </Button>
            <Button icon="circle-check" className="ui-flex ui-flex--2" disabled={enviando} onClick={() => resolver('atender')}>
              Marcar como atendida
            </Button>
          </div>
        </>
      )}
      {a.estado === 'PENDIENTE' && !editable && (
        <p className="ui-muted" style={{ margin: 0, fontSize: 13 }}>
          Solo administradores y supervisores pueden atender o descartar alertas.
        </p>
      )}
    </div>
  )
}

export function AlertasPage() {
  const { rol, organizacion } = useSesion()
  const avisos = useAvisos()
  const { estado, datos, reintentar, actualizar } = useDatos(() => cargar(rol), [rol])
  const [pestana, setPestana] = useState('PENDIENTE')
  const [elegida, setElegida] = useState(null)

  const alertas = useMemo(() => datos?.alertas ?? [], [datos])
  const cuenta = (k) => alertas.filter((a) => a.estado === k).length
  const filas = alertas.filter((a) => pestana === 'todas' || a.estado === pestana)
  const seleccion = filas.find((a) => a.num === elegida) ?? filas[0]
  const pendientes = alertas.filter((a) => a.estado === 'PENDIENTE')
  const ultimaPend = pendientes[0]

  const alResolver = (nueva) => {
    actualizar((d) => ({ ...d, alertas: d.alertas.map((x) => (x.num === nueva.num ? nueva : x)) }))
    avisos.recargar()
  }

  const cifras = datos
    ? {
        principal: {
          etiqueta: 'Alertas pendientes',
          valor: pendientes.length,
          unidad: 'por atender',
          tonoValor: 'verde',
          tonoUnidad: 'claro',
          sub: ultimaPend
            ? `${pendientes.filter((a) => a.nivel === 'PELIGRO').length} crítica · la más reciente a las ${hora(ultimaPend.fecha_hora)}`
            : 'Todo atendido',
        },
        cifras: [
          { etiqueta: 'Atendidas', valor: cuenta('ATENDIDA') },
          { etiqueta: 'Descartadas', valor: cuenta('DESCARTADA') },
          { etiqueta: 'Total', valor: alertas.length, sub: `${alertas.filter((a) => esHoy(a.fecha_hora)).length} de hoy` },
        ],
      }
    : { principal: { etiqueta: 'Alertas pendientes', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow={datos ? `${organizacion} · ${pendientes.length} pendientes · ${pendientes.filter((a) => a.nivel === 'PELIGRO').length} crítica` : organizacion}
      titulo="Alertas"
      cifras={cifras}
    >
      {estado === 'error' ? (
        <EstadoError reintentar={reintentar} />
      ) : (
        <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
          <Card className="nc-grow">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <Tabs
                items={PESTANAS.map(([id, label]) => ({ id, label, count: id === 'todas' ? alertas.length : cuenta(id) }))}
                value={pestana}
                onChange={(v) => {
                  setPestana(v)
                  setElegida(null)
                }}
              />
              <Button variant="secondary" size="sm" icon="download">
                Exportar
              </Button>
            </div>
            <div className="ui-alerta ui-alerta--cabecera">
              <span />
              <span>Alerta</span>
              <span>Valor</span>
              <span>Detección</span>
            </div>
            <div className="nc-scroll">
              {estado === 'cargando' && <Skeleton variant="card" />}
              {filas.map((a) => {
                const n = NIVEL_ALERTA[a.nivel]
                const est = ESTADO_ALERTA[a.estado]
                const quien = datos.usuarios.find((u) => u.num === a.atendida_por)
                return (
                  <button
                    key={a.num}
                    type="button"
                    className={`ui-alerta${seleccion?.num === a.num ? ' is-selected' : ''}`}
                    onClick={() => setElegida(a.num)}
                  >
                    <IconCircle name={n.icon} tone={n.tone} size="md" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <div className="ui-titulo-fila">
                        <strong>{tituloAlerta(a)}</strong>
                        <span>{a.dispositivo_nombre}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusBadge status={n.status} />
                        <Badge tone={est.tone} icon={est.icon}>
                          {est.label}
                        </Badge>
                        {quien && (
                          <span className="ui-muted" style={{ fontSize: 12 }}>
                            por {nombreCorto(quien)} · {hora(a.fecha_atencion)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="ui-valor">{valorAlerta(a)}</span>
                      <span className="ui-muted" style={{ fontSize: 12 }}>
                        {limiteAlerta(a)}
                      </span>
                    </div>
                    <div className="ui-num" style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Lectura {hora(a.lectura_fecha_hora)}</span>
                      <span className="ui-muted" style={{ fontSize: 12 }}>
                        Alerta {hora(a.fecha_hora)}
                      </span>
                    </div>
                  </button>
                )
              })}
              {estado === 'listo' && filas.length === 0 && <ActivityFeed items={[]} />}
            </div>
          </Card>
          <Card className="nc-grow">
            {seleccion ? (
              <Detalle key={seleccion.num} a={seleccion} usuarios={datos.usuarios} editable={puedeEditar(rol)} alResolver={alResolver} />
            ) : (
              <div className="ui-centro">
                <ActivityFeed items={[]} />
              </div>
            )}
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
