import { useMemo, useRef, useState } from 'react'
import {
  ActivityFeed, Badge, Button, Card, Icon, IconCircle, Skeleton, StatusBadge, Tabs,
} from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import { CONSULTA_MOVIL } from '../../hooks/useMenuMovil'
import * as alertasApi from '../../services/alertas'
import * as usuariosApi from '../../services/usuarios'
import * as seguridad from '../../services/seguridad'
import { ALERTAS_EXPORTAR } from '../../api'
import {
  ESTADO_ALERTA, limiteAlerta, NIVEL_ALERTA, nombreCorto, pagina, puedeEditar, tituloAlerta, valorAlerta, VARIABLE,
} from '../../utils/convertir'
import { esHoy, fechaCorta, hora, horaSeg } from '../../utils/formato'

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

// Nota obligatoria al resolver (mismo mínimo y máximo que la API).
const NOTA_MIN = 5
const NOTA_MAX = 500
const RESOLVER = {
  atender: {
    etiqueta: '¿Qué se hizo para atenderla?',
    ejemplo: 'Ej.: se ventiló el área y la temperatura volvió a la normalidad',
    boton: 'Guardar como atendida',
    icono: 'circle-check',
  },
  descartar: {
    etiqueta: '¿Por qué se descarta?',
    ejemplo: 'Ej.: la puerta del andén estuvo abierta durante la carga',
    boton: 'Descartar alerta',
    icono: 'circle-x',
  },
}

// Nombre de quien la resolvió: de la lista de usuarios o, si no se puede listar, el de la API.
const quienResolvio = (a, usuarios) => {
  const u = usuarios.find((x) => x.num === a.atendida_por)
  return u ? nombreCorto(u) : a.atendida_por_nombre || null
}

// Mensaje del backend al resolver (400 con {observaciones: [...]} o {detail}).
function mensajeError(e) {
  if (e.status === 409) return 'Alguien más ya resolvió esta alerta.'
  const d = e.datos
  const primero = (v) => (Array.isArray(v) ? v[0] : v)
  return primero(d?.observaciones) || primero(d?.detail) || 'No se pudo guardar. Intenta de nuevo.'
}

function Detalle({ a, usuarios, editable, alResolver }) {
  const [accion, setAccion] = useState(null)
  const [nota, setNota] = useState('')
  const [tocada, setTocada] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const n = NIVEL_ALERTA[a.nivel]
  const est = ESTADO_ALERTA[a.estado]
  const quien = quienResolvio(a, usuarios)
  const descartada = a.estado === 'DESCARTADA'
  const linea = [
    { level: n.level, title: 'Creada', meta: `Lectura de ${valorAlerta(a)} a las ${horaSeg(a.lectura_fecha_hora)}`, time: hora(a.fecha_hora) },
    { level: 'info', icon: 'bell', title: 'Notificada', meta: 'Correo a los responsables del área', time: hora(a.fecha_hora) },
    a.estado === 'PENDIENTE'
      ? { level: 'info', icon: 'clock', title: 'Pendiente de atención', meta: 'Atiende o descarta con una nota', time: '—', unread: true }
      : {
          level: a.estado === 'ATENDIDA' ? 'normal' : 'offline',
          icon: est.icon,
          title: est.label,
          meta: quien ? `Por ${quien}` : '',
          time: hora(a.fecha_atencion),
        },
  ]
  const limpia = nota.trim()
  const corta = limpia.length < NOTA_MIN
  const avisoCorta = tocada && corta ? `Escribe al menos ${NOTA_MIN} caracteres.` : null
  const elegir = (cual) => {
    setAccion(cual)
    setError(null)
    setTocada(false)
  }
  const resolver = async () => {
    if (corta) {
      setTocada(true)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const nueva = await (accion === 'atender' ? alertasApi.atender(a.num, limpia) : alertasApi.descartar(a.num, limpia))
      setNota('')
      setAccion(null)
      alResolver(nueva)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  const form = accion ? RESOLVER[accion] : null
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
      {a.estado !== 'PENDIENTE' && (
        <div className="ui-separado ui-resolucion" style={{ paddingTop: 16 }}>
          <span className="ui-eyebrow">{descartada ? 'Motivo del descarte' : 'Qué se hizo'}</span>
          <p className={`ui-resolucion__texto${a.observaciones ? '' : ' is-vacio'}`}>
            {a.observaciones || 'No se registró una nota.'}
          </p>
          <span className="ui-muted ui-num" style={{ fontSize: 12 }}>
            {descartada ? 'Descartada' : 'Atendida'}
            {quien ? ` por ${quien}` : ''}
            {a.fecha_atencion ? ` · ${fechaCorta(a.fecha_atencion)}, ${hora(a.fecha_atencion)}` : ''}
          </span>
        </div>
      )}
      <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
        <span className="ui-eyebrow">Línea de tiempo</span>
        <ActivityFeed items={linea} />
      </div>
      {a.estado === 'PENDIENTE' && editable && !form && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" icon="circle-x" className="ui-flex" onClick={() => elegir('descartar')}>
            Descartar
          </Button>
          <Button icon="circle-check" className="ui-flex ui-flex--2" onClick={() => elegir('atender')}>
            Marcar como atendida
          </Button>
        </div>
      )}
      {a.estado === 'PENDIENTE' && editable && form && (
        <form
          className="ui-resolucion"
          onSubmit={(e) => {
            e.preventDefault()
            resolver()
          }}
        >
          <div className={`nc-field${error || avisoCorta ? ' is-error' : ''}`}>
            <label className="nc-field__label" htmlFor={`nota-alerta-${a.num}`}>
              {form.etiqueta}
            </label>
            <span className={`nc-input ui-nota-alerta${error || avisoCorta ? ' is-error' : ''}`}>
              <textarea
                id={`nota-alerta-${a.num}`}
                rows={3}
                autoFocus
                required
                minLength={NOTA_MIN}
                maxLength={NOTA_MAX}
                placeholder={form.ejemplo}
                value={nota}
                disabled={enviando}
                aria-invalid={error || avisoCorta ? true : undefined}
                onChange={(e) => {
                  setNota(e.target.value)
                  setError(null)
                }}
                onBlur={() => setTocada(true)}
              />
            </span>
            <span className={`nc-field__msg${error || avisoCorta ? ' nc-field__msg--error' : ''}`}>
              {error || avisoCorta || `Obligatorio · ${limpia.length}/${NOTA_MAX}`}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="button" variant="secondary" className="ui-flex" disabled={enviando} onClick={() => elegir(null)}>
              Cancelar
            </Button>
            <Button type="submit" icon={form.icono} className="ui-flex ui-flex--2" disabled={enviando || corta}>
              {enviando ? 'Guardando…' : form.boton}
            </Button>
          </div>
        </form>
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
  const detalle = useRef(null)
  const [exportando, setExportando] = useState(false)
  // CSV de la pestaña actual (GET /alertas/exportar/ con el mismo filtro de estado).
  const exportar = async () => {
    setExportando(true)
    try {
      await seguridad.descargarCsv(ALERTAS_EXPORTAR, { estado: pestana === 'todas' ? '' : pestana })
    } catch {
      window.alert('No se pudo exportar. Intenta de nuevo.')
    } finally {
      setExportando(false)
    }
  }

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
              <Button variant="secondary" size="sm" icon="download" disabled={exportando} onClick={exportar}>
                {exportando ? 'Exportando…' : 'Exportar CSV'}
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
                const quien = quienResolvio(a, datos.usuarios)
                return (
                  <button
                    key={a.num}
                    type="button"
                    className={`ui-alerta${seleccion?.num === a.num ? ' is-selected' : ''}`}
                    onClick={() => {
                      setElegida(a.num)
                      // En el celular el detalle queda debajo de la lista: se lleva a la vista.
                      if (window.matchMedia?.(CONSULTA_MOVIL).matches) {
                        requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                      }
                    }}
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
                            por {quien} · {hora(a.fecha_atencion)}
                          </span>
                        )}
                      </div>
                      {a.estado !== 'PENDIENTE' && a.observaciones && (
                        <span className="ui-alerta__nota" title={a.observaciones}>
                          <Icon name={a.estado === 'DESCARTADA' ? 'circle-x' : 'circle-check'} size={14} />
                          <span>{a.observaciones}</span>
                        </span>
                      )}
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
          <Card className={`nc-grow ui-detalle-alerta${seleccion ? '' : ' is-vacio'}`} ref={detalle}>
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
