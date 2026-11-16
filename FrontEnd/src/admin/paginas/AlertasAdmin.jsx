import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, Icon, Input, Skeleton, Tabs } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { pagina } from '../../utils/convertir'
import { fecha, useAviso } from '../../consola/utilidades'
import { ESTADO_ALERTA, NIVEL_ALERTA, TIPO_ALERTA } from '../catalogos'
import { Confirmar, ErrorCarga, Recorte } from '../comunes'
import { useDiferido } from '../utilidades'

const PESTANAS = [
  { id: 'nueva', label: 'Nuevas' },
  { id: 'revisada', label: 'Revisadas' },
  { id: 'descartada', label: 'Descartadas' },
  { id: 'todas', label: 'Todas' },
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
const ACCION = {
  revisada: { titulo: 'Marcar como revisada', boton: 'Marcar revisada', icono: 'circle-check', hecho: 'Alerta revisada.' },
  descartada: { titulo: 'Descartar alerta', boton: 'Descartar', icono: 'circle-x', hecho: 'Alerta descartada.' },
}

function Alerta({ a, accion }) {
  const nivel = NIVEL_ALERTA[a.nivel] ?? NIVEL_ALERTA.advertencia
  const estado = ESTADO_ALERTA[a.estado]
  return (
    <li className={`ui-admin-alerta is-${a.nivel}${a.estado === 'nueva' ? '' : ' is-cerrada'}`}>
      <span className="ui-admin-alerta__icono">
        <Icon name={TIPO_ALERTA[a.tipo]?.icon ?? nivel.icon} size={18} />
      </span>
      <div className="ui-admin-alerta__cuerpo">
        <div className="ui-admin-alerta__cabeza">
          <strong>{a.titulo}</strong>
          <span className="ui-admin-alerta__insignias">
            <Badge tone={nivel.tone}>{nivel.label}</Badge>
            {a.estado !== 'nueva' && <Badge tone={estado.tone}>{estado.label}</Badge>}
          </span>
        </div>
        {a.detalle && <p>{a.detalle}</p>}
        <span className="ui-consola-meta">
          <span>{TIPO_ALERTA[a.tipo]?.label ?? a.tipo}</span>
          {a.usuario && (
            <span title={a.usuario.correo}>
              <Icon name="user" size={12} /> {a.usuario.nombre || a.usuario.correo}
            </span>
          )}
          {a.ip && (
            <span className="ui-admin-mono">
              <Icon name="signal" size={12} /> {a.ip}
            </span>
          )}
          {a.eventos > 1 && <span>{a.eventos} eventos</span>}
          <span>
            <Icon name="clock" size={12} /> {fecha(a.ultimo_evento)}
          </span>
        </span>
        {a.estado !== 'nueva' && (
          <p className="ui-admin-alerta__revision">
            {estado.label} por {a.revisada_por ?? 'el sistema'} el {fecha(a.fecha_revision)}
            {a.nota ? ` · «${a.nota}»` : ''}
          </p>
        )}
      </div>
      {a.estado === 'nueva' && (
        <div className="ui-admin-alerta__acciones">
          <Button variant="secondary" size="sm" icon="circle-check" onClick={() => accion(a, 'revisada')}>
            Revisada
          </Button>
          <Button variant="ghost" size="sm" icon="circle-x" onClick={() => accion(a, 'descartada')}>
            Descartar
          </Button>
        </div>
      )}
    </li>
  )
}

// Alertas de seguridad de todas las organizaciones: se abren solas al ocurrir el evento (accesos
// fallidos, IP nueva, cuenta bloqueada) y avisan por la campana y por correo (ver Notificaciones).
export default function AlertasAdmin() {
  const { recargar: recargarAvisos } = useAvisos()
  const [estadoFiltro, setEstadoFiltro] = useState('nueva')
  const [nivel, setNivel] = useState('')
  const [tipo, setTipo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const q = useDiferido(busqueda.trim())
  const lista = useDatos(() => adminApi.alertas({ estado: estadoFiltro === 'todas' ? '' : estadoFiltro, nivel, tipo, q }), [estadoFiltro, nivel, tipo, q])
  const resumen = useDatos(adminApi.resumenAlertas, [], { cadaMs: 60000 })
  const [cerrando, setCerrando] = useState(null)
  const [nota, setNota] = useState('')
  const [todas, setTodas] = useState(false)
  const [aviso, avisar] = useAviso()
  const alertas = pagina(lista.datos)
  const r = resumen.datos
  const hayFiltros = nivel || tipo || q

  const refrescar = () => {
    lista.reintentar()
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
        <div className="ui-admin-alerta ui-admin-aviso-2fa">
          <span className="ui-admin-alerta__icono">
            <Icon name={TIPO_ALERTA.sin_2fa.icon} size={18} />
          </span>
          <div className="ui-admin-alerta__cuerpo">
            <strong>
              {r.sin_2fa} cuenta{r.sin_2fa === 1 ? '' : 's'} sin la verificación en dos pasos obligatoria
            </strong>
            <p>
              Se les pedirá configurarla la próxima vez que entren. Revísalas en <Link to="/usuarios">Usuarios</Link> o cambia
              los roles que la exigen en <Link to="/politicas">Políticas</Link>.
            </p>
          </div>
        </div>
      )}
      <div className="ui-filtros ui-admin-filtros">
        <Tabs items={PESTANAS} value={estadoFiltro} onChange={setEstadoFiltro} />
        <Select label="Nivel" value={nivel} options={NIVELES} onChange={(e) => setNivel(e.target.value)} />
        <Select label="Tipo" value={tipo} options={TIPOS} onChange={(e) => setTipo(e.target.value)} />
        <div style={{ flex: 1 }} />
        {aviso}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por cuenta o IP…" />
      </div>
      {lista.estado === 'error' && <ErrorCarga error={lista.error} reintentar={lista.reintentar} />}
      {lista.estado === 'cargando' && <Skeleton variant="card" />}
      {lista.estado === 'listo' && !alertas.length && (
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState
              icon="shield-check"
              title={hayFiltros ? 'Ninguna alerta coincide' : estadoFiltro === 'nueva' ? 'Sin alertas nuevas' : 'Sin alertas'}
              message={hayFiltros ? 'Prueba con otros filtros.' : 'No hay nada que revisar por ahora.'}
            />
          </div>
        </Card>
      )}
      {lista.estado === 'listo' && alertas.length > 0 && (
        <Card className="nc-grow">
          <ul className="ui-admin-alertas ui-admin-alertas--pagina nc-scroll">
            {alertas.map((a) => (
              <Alerta
                key={a.num}
                a={a}
                accion={(alerta, estado) => {
                  setNota('')
                  setCerrando({ alerta, estado })
                }}
              />
            ))}
          </ul>
          <Recorte datos={lista.datos} mostrados={alertas.length} />
        </Card>
      )}
      {cerrando && (
        <Confirmar
          titulo={ACCION[cerrando.estado].titulo}
          mensaje={cerrando.alerta.titulo}
          boton={ACCION[cerrando.estado].boton}
          icono={ACCION[cerrando.estado].icono}
          cerrar={() => setCerrando(null)}
          hacer={async () => {
            const hacer = cerrando.estado === 'revisada' ? adminApi.revisarAlerta : adminApi.descartarAlerta
            await hacer(cerrando.alerta.num, nota.trim())
            avisar(ACCION[cerrando.estado].hecho)
            refrescar()
          }}
        >
          <Input label="Nota (opcional)" value={nota} maxLength={255} placeholder="p. ej. Era la propia persona" onChange={(e) => setNota(e.target.value)} />
        </Confirmar>
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
