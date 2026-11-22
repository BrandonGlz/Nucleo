import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActivityFeed, Badge, Button, Card, EmptyState, Icon, IconCircle, Input, Skeleton, Tabs,
} from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useDatos } from '../../hooks/useDatos'
import { CONSULTA_MOVIL } from '../../hooks/useMenuMovil'
import * as adminApi from '../../services/admin'
import { pagina } from '../../utils/convertir'
import { esHoy, fechaCorta, hora } from '../../utils/formato'
import { useAviso } from '../../consola/utilidades'
import { ESTADO_ALERTA, NIVEL_ALERTA, TIPO_ALERTA } from '../catalogos'
import { Confirmar, ErrorCarga, Recorte } from '../comunes'
import { mensajeError, useDiferido } from '../utilidades'

const PESTANAS = [
  ['nueva', 'Nuevas'],
  ['revisada', 'Revisadas'],
  ['descartada', 'Descartadas'],
  ['todas', 'Todas'],
]
const NIVELES = [
  { value: '', label: 'Todos los niveles' },
  { value: 'critico', label: 'Crítico' },
  { value: 'advertencia', label: 'Advertencia' },
]
const TIPOS = [
  { value: '', label: 'Todos los tipos' },
  ...['ip_fallidos', 'cuenta_fallidos', 'ip_nueva', 'cuenta_bloqueada'].map((t) => ({ value: t, label: TIPO_ALERTA[t].label })),
]
// Revisar o descartar se hace en el panel de detalle, con una nota opcional (máx. 255, como la API).
const NOTA_MAX = 255
const ACCION = {
  revisada: {
    etiqueta: 'Nota de la revisión (opcional)',
    ejemplo: 'Ej.: era la propia persona desde su casa',
    boton: 'Guardar como revisada',
    icono: 'circle-check',
    hecho: 'Alerta revisada.',
  },
  descartada: {
    etiqueta: 'Motivo del descarte (opcional)',
    ejemplo: 'Ej.: olvidó su contraseña',
    boton: 'Descartar alerta',
    icono: 'circle-x',
    hecho: 'Alerta descartada.',
  },
}

const nivelDe = (a) => NIVEL_ALERTA[a.nivel] ?? NIVEL_ALERTA.advertencia
const cuando = (iso) => (iso ? (esHoy(iso) ? hora(iso) : `${fechaCorta(iso)}, ${hora(iso)}`) : '—')
const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`
// Cuenta e IP en una línea (subtítulo de la fila y del detalle).
const origen = (a) => [a.usuario?.correo, a.ip].filter(Boolean).join(' · ') || TIPO_ALERTA[a.tipo]?.label

function Detalle({ a, alCerrar }) {
  const [accion, setAccion] = useState(null)
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const nivel = nivelDe(a)
  const est = ESTADO_ALERTA[a.estado]
  const tipo = TIPO_ALERTA[a.tipo]
  const nueva = a.estado === 'nueva'
  const quien = a.revisada_por ?? 'el sistema'
  const linea = [
    { level: a.nivel === 'critico' ? 'critical' : 'warning', icon: tipo?.icon, title: 'Creada', meta: a.detalle, time: cuando(a.creada) },
    ...(a.eventos > 1 && a.ultimo_evento !== a.creada
      ? [{ level: 'info', icon: 'clock', title: 'Último evento', meta: `${plural(a.eventos, 'evento')} en total`, time: cuando(a.ultimo_evento) }]
      : []),
    nueva
      ? { level: 'info', icon: 'bell', title: 'Pendiente de revisión', meta: 'Revísala o descártala', time: '—', unread: true }
      : {
          level: a.estado === 'revisada' ? 'normal' : 'offline',
          icon: est.icon,
          title: `${est.label} por ${quien}`,
          meta: a.nota ? `«${a.nota}»` : 'Sin nota',
          time: cuando(a.fecha_revision),
        },
  ]
  const elegir = (cual) => {
    setAccion(cual)
    setNota('')
    setError(null)
  }
  const cerrar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const hacer = accion === 'revisada' ? adminApi.revisarAlerta : adminApi.descartarAlerta
      await hacer(a.num, nota.trim())
      alCerrar(ACCION[accion].hecho)
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar. Intenta de nuevo.'))
      setEnviando(false)
    }
  }
  const form = accion ? ACCION[accion] : null
  return (
    <div className="ui-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconCircle name={tipo?.icon ?? nivel.icon} tone={nivel.tone} size="md" />
        <div className="ui-titulo-fila">
          <strong style={{ fontSize: 17, lineHeight: '24px' }}>{a.titulo}</strong>
          <span>{tipo?.label ?? a.tipo}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 48, lineHeight: '52px', fontWeight: 700, letterSpacing: '-0.03em' }} className="ui-num">
          {a.eventos}
          <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-muted)' }}> {a.eventos === 1 ? 'evento' : 'eventos'}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', paddingBottom: 6 }}>
          Último · {cuando(a.ultimo_evento)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Badge tone={nivel.tone} icon={nivel.icon}>
          {nivel.label}
        </Badge>
        <Badge tone={est.tone} icon={est.icon}>
          {est.label}
        </Badge>
      </div>
      <div className="ui-separado ui-admin-datos-alerta">
        <div className="ui-dato">
          <span className="ui-eyebrow">Cuenta</span>
          {a.usuario ? (
            <div className="ui-titulo-fila">
              <strong className="ui-admin-recorte-linea" title={a.usuario.nombre || a.usuario.correo}>
                {a.usuario.nombre || a.usuario.correo}
              </strong>
              {a.usuario.nombre && (
                <span className="ui-admin-recorte-linea" title={a.usuario.correo}>
                  {a.usuario.correo}
                </span>
              )}
            </div>
          ) : (
            <strong className="ui-muted">—</strong>
          )}
        </div>
        <div className="ui-dato">
          <span className="ui-eyebrow">IP</span>
          <strong className="ui-admin-mono ui-admin-recorte-linea" title={a.ip ?? ''}>
            {a.ip ?? '—'}
          </strong>
        </div>
        <div className="ui-dato">
          <span className="ui-eyebrow">Eventos</span>
          <strong className="ui-num">{a.eventos}</strong>
        </div>
        <div className="ui-dato">
          <span className="ui-eyebrow">Fecha</span>
          <strong className="ui-num">{cuando(a.creada)}</strong>
        </div>
      </div>
      {!nueva && (
        <div className="ui-separado ui-resolucion" style={{ paddingTop: 16 }}>
          <span className="ui-eyebrow">{a.estado === 'descartada' ? 'Motivo del descarte' : 'Nota de la revisión'}</span>
          <p className={`ui-resolucion__texto${a.nota ? '' : ' is-vacio'}`}>{a.nota || 'No se registró una nota.'}</p>
          <span className="ui-muted ui-num" style={{ fontSize: 12 }}>
            {est.label} por {quien}
            {a.fecha_revision ? ` · ${fechaCorta(a.fecha_revision)}, ${hora(a.fecha_revision)}` : ''}
          </span>
        </div>
      )}
      <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
        <span className="ui-eyebrow">Línea de tiempo</span>
        <ActivityFeed items={linea} />
      </div>
      {nueva && !form && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" icon="circle-x" className="ui-flex" onClick={() => elegir('descartada')}>
            Descartar
          </Button>
          <Button icon="circle-check" className="ui-flex ui-flex--2" onClick={() => elegir('revisada')}>
            Marcar como revisada
          </Button>
        </div>
      )}
      {nueva && form && (
        <form
          className="ui-resolucion"
          onSubmit={(e) => {
            e.preventDefault()
            cerrar()
          }}
        >
          <Input
            label={form.etiqueta}
            value={nota}
            maxLength={NOTA_MAX}
            autoFocus
            disabled={enviando}
            placeholder={form.ejemplo}
            error={error || undefined}
            hint={error ? undefined : `${nota.trim().length}/${NOTA_MAX}`}
            onChange={(e) => {
              setNota(e.target.value)
              setError(null)
            }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="button" variant="secondary" className="ui-flex" disabled={enviando} onClick={() => elegir(null)}>
              Cancelar
            </Button>
            <Button type="submit" icon={form.icono} className="ui-flex ui-flex--2" disabled={enviando}>
              {enviando ? 'Guardando…' : form.boton}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// Alertas de seguridad de todas las organizaciones: se abren solas al ocurrir el evento (accesos
// fallidos, IP nueva, cuenta bloqueada) y avisan por la campana y por correo (ver Notificaciones).
// Mismo diseño que la página Alertas de la web: lista compacta y detalle con línea de tiempo.
export default function AlertasAdmin() {
  const { recargar: recargarAvisos } = useAvisos()
  const [pestana, setPestana] = useState('nueva')
  const [nivel, setNivel] = useState('')
  const [tipo, setTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState(null)
  const detalle = useRef(null)
  const q = useDiferido(busqueda.trim())
  const lista = useDatos(() => adminApi.alertas({ estado: pestana === 'todas' ? '' : pestana, nivel, tipo, q }), [pestana, nivel, tipo, q])
  // Contadores de las pestañas con los mismos filtros (solo el total de cada estado).
  const conteos = useDatos(
    () =>
      Promise.all(
        PESTANAS.map(([id]) => adminApi.alertas({ estado: id === 'todas' ? '' : id, nivel, tipo, q, page_size: 1 })),
      ).then((r) => Object.fromEntries(PESTANAS.map(([id], i) => [id, r[i]?.count ?? pagina(r[i]).length]))),
    [nivel, tipo, q],
  )
  const resumen = useDatos(adminApi.resumenAlertas, [], { cadaMs: 60000 })
  const [todas, setTodas] = useState(false)
  const [aviso, avisar] = useAviso()
  const alertas = pagina(lista.datos)
  const seleccion = alertas.find((a) => a.num === elegida) ?? alertas[0]
  const r = resumen.datos
  const hayFiltros = nivel || tipo || q

  const refrescar = () => {
    lista.reintentar()
    conteos.reintentar()
    resumen.reintentar()
    recargarAvisos?.()
  }

  const cifras = r
    ? {
        principal: {
          etiqueta: 'Alertas nuevas',
          valor: r.nuevas,
          unidad: 'por revisar',
          tonoValor: r.criticas ? undefined : 'verde',
          sub: r.nuevas ? `${r.criticas} crítica${r.criticas === 1 ? '' : 's'}` : 'Todo en orden',
        },
        cifras: [
          { etiqueta: 'Críticas', valor: r.criticas, tono: r.criticas ? 'peligro' : undefined },
          { etiqueta: 'Últimos 30 días', valor: r.ultimos_30_dias },
          ...r.por_tipo
            .filter((x) => x.tipo === 'ip_fallidos' || x.tipo === 'ip_nueva')
            .map((x) => ({ etiqueta: `${TIPO_ALERTA[x.tipo].label} (30 días)`, valor: x.total })),
        ],
      }
    : { principal: { etiqueta: 'Alertas nuevas', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow="Seguridad de todas las organizaciones"
      titulo="Alertas"
      cifras={cifras}
      acciones={
        <>
          <Link to="/notificaciones" className="nc-btn nc-btn--secondary nc-btn--sm">
            <Icon name="bell" size={16} /> Notificaciones
          </Link>
          <Button size="sm" icon="circle-check" disabled={!r?.nuevas} onClick={() => setTodas(true)}>
            Marcar todas revisadas
          </Button>
        </>
      }
    >
      {r?.sin_2fa > 0 && (
        <Card className="ui-admin-aviso-2fa">
          <div className="ui-item">
            <IconCircle name={TIPO_ALERTA.sin_2fa.icon} tone="warning" size="md" />
            <div className="ui-titulo-fila">
              <strong>
                {r.sin_2fa} cuenta{r.sin_2fa === 1 ? '' : 's'} sin la verificación en dos pasos obligatoria
              </strong>
              <span>
                Se les pedirá configurarla la próxima vez que entren. Revísalas en <Link to="/usuarios">Usuarios</Link> o cambia
                los roles que la exigen en <Link to="/politicas">Políticas</Link>.
              </span>
            </div>
          </div>
        </Card>
      )}
      <div className="ui-filtros ui-admin-filtros">
        <Select label="Nivel" value={nivel} options={NIVELES} onChange={(e) => setNivel(e.target.value)} />
        <Select label="Tipo" value={tipo} options={TIPOS} onChange={(e) => setTipo(e.target.value)} />
        <div style={{ flex: 1 }} />
        {aviso}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por cuenta o IP…" />
      </div>
      {lista.estado === 'error' ? (
        <ErrorCarga error={lista.error} reintentar={lista.reintentar} />
      ) : (
        <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
          <Card className="nc-grow">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <Tabs
                items={PESTANAS.map(([id, label]) => ({ id, label, count: conteos.datos?.[id] }))}
                value={pestana}
                onChange={(v) => {
                  setPestana(v)
                  setElegida(null)
                }}
              />
            </div>
            <div className="ui-alerta ui-alerta--cabecera">
              <span />
              <span>Alerta</span>
              <span>Eventos</span>
              <span>Último evento</span>
            </div>
            <div className="nc-scroll">
              {lista.estado === 'cargando' && <Skeleton variant="card" />}
              {lista.estado === 'listo' &&
                alertas.map((a) => {
                  const n = nivelDe(a)
                  const est = ESTADO_ALERTA[a.estado]
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
                      <IconCircle name={TIPO_ALERTA[a.tipo]?.icon ?? n.icon} tone={n.tone} size="md" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                        <div className="ui-titulo-fila">
                          <strong>{a.titulo}</strong>
                          <span className="ui-admin-recorte-linea" title={origen(a)}>
                            {origen(a)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Badge tone={n.tone} icon={n.icon}>
                            {n.label}
                          </Badge>
                          <Badge tone={est.tone} icon={est.icon}>
                            {est.label}
                          </Badge>
                          {a.estado !== 'nueva' && (
                            <span className="ui-muted" style={{ fontSize: 12 }}>
                              por {a.revisada_por ?? 'el sistema'} · {cuando(a.fecha_revision)}
                            </span>
                          )}
                        </div>
                        {a.estado !== 'nueva' && a.nota && (
                          <span className="ui-alerta__nota" title={a.nota}>
                            <Icon name={est.icon} size={14} />
                            <span>{a.nota}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span className="ui-valor">{a.eventos}</span>
                        <span className="ui-muted" style={{ fontSize: 12 }}>
                          {a.eventos === 1 ? 'evento' : 'eventos'}
                        </span>
                      </div>
                      <div className="ui-num" style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{cuando(a.ultimo_evento)}</span>
                        <span className="ui-muted" style={{ fontSize: 12 }}>
                          Creada {cuando(a.creada)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              {lista.estado === 'listo' && !alertas.length && (
                <EmptyState
                  icon="shield-check"
                  compact
                  title={hayFiltros ? 'Ninguna alerta coincide' : pestana === 'nueva' ? 'Sin alertas nuevas' : 'Sin alertas'}
                  message={hayFiltros ? 'Prueba con otros filtros.' : 'No hay nada que revisar por ahora.'}
                />
              )}
            </div>
            <Recorte datos={lista.datos} mostrados={alertas.length} />
          </Card>
          <Card className={`nc-grow ui-detalle-alerta${seleccion ? '' : ' is-vacio'}`} ref={detalle}>
            {seleccion ? (
              <Detalle
                key={seleccion.num}
                a={seleccion}
                alCerrar={(texto) => {
                  avisar(texto)
                  refrescar()
                }}
              />
            ) : (
              <div className="ui-centro">
                <EmptyState icon="shield-check" compact title="Sin alerta elegida" message="Elige una alerta para ver su detalle." />
              </div>
            )}
          </Card>
        </div>
      )}
      {todas && (
        <Confirmar
          titulo="Marcar todas como revisadas"
          mensaje={`Las ${r?.nuevas ?? ''} alertas nuevas pasarán a revisadas.`}
          boton="Marcar todas"
          cerrar={() => setTodas(false)}
          hacer={async () => {
            const { revisadas } = await adminApi.revisarTodas()
            avisar(`${revisadas} alerta${revisadas === 1 ? '' : 's'} revisada${revisadas === 1 ? '' : 's'}.`)
            refrescar()
          }}
        />
      )}
    </Pantalla>
  )
}
