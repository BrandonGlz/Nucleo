import { Badge, Card, EmptyState, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { BarrasHorizontales } from '../../consola/comunes'
import { fecha } from '../../consola/utilidades'
import { NIVEL_ALERTA, TIPO_ALERTA } from '../catalogos'
import { ErrorCarga } from '../comunes'

const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
const miles = (n) => Number(n ?? 0).toLocaleString('es-MX')

// Accesos por día: barra de exitosos con los fallidos encima (rojo).
function SerieAccesos({ serie }) {
  const max = Math.max(1, ...serie.map((x) => x.exitosos + x.fallidos))
  return (
    <div className="ui-admin-serie">
      <ul className="ui-admin-serie__barras" aria-label="Accesos por día">
        {serie.map((x, i) => (
          <li key={x.dia} title={`${dia(x.dia)}: ${x.exitosos} exitosos, ${x.fallidos} fallidos`}>
            <span className="ui-admin-serie__pila" style={{ height: `${((x.exitosos + x.fallidos) / max) * 100}%` }}>
              {x.fallidos > 0 && <span className="is-fallido" style={{ flexGrow: x.fallidos }} />}
              {x.exitosos > 0 && <span style={{ flexGrow: x.exitosos }} />}
            </span>
            <small>{i % 2 === 0 ? dia(x.dia) : ''}</small>
          </li>
        ))}
      </ul>
      <div className="ui-admin-leyenda">
        <span>
          <i className="is-exito" /> Exitosos · {miles(serie.reduce((s, x) => s + x.exitosos, 0))}
        </span>
        <span>
          <i className="is-fallido" /> Fallidos · {miles(serie.reduce((s, x) => s + x.fallidos, 0))}
        </span>
      </div>
    </div>
  )
}

function AlertasSeguridad({ alertas }) {
  if (!alertas.length)
    return <EmptyState compact icon="shield-check" title="Sin alertas de seguridad" message="No hay nada que revisar por ahora." />
  const orden = [...alertas].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1))
  return (
    <ul className="ui-admin-alertas">
      {orden.map((a, i) => {
        const nivel = NIVEL_ALERTA[a.nivel] ?? NIVEL_ALERTA.advertencia
        return (
          <li key={`${a.tipo}-${i}`} className={`ui-admin-alerta is-${a.nivel}`}>
            <span className="ui-admin-alerta__icono">
              <Icon name={TIPO_ALERTA[a.tipo]?.icon ?? nivel.icon} size={18} />
            </span>
            <div className="ui-admin-alerta__cuerpo">
              <div className="ui-admin-alerta__cabeza">
                <strong>{a.titulo}</strong>
                <Badge tone={nivel.tone}>{nivel.label}</Badge>
              </div>
              {a.detalle && <p>{a.detalle}</p>}
              <span className="ui-consola-meta">
                {a.usuario && (
                  <span title={a.usuario.correo}>
                    <Icon name="user" size={12} /> {a.usuario.nombre}
                  </span>
                )}
                {a.ip && (
                  <span className="ui-admin-mono">
                    <Icon name="signal" size={12} /> {a.ip}
                  </span>
                )}
                {a.fecha && (
                  <span>
                    <Icon name="clock" size={12} /> {fecha(a.fecha)}
                  </span>
                )}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Inicio de la consola: cifras de seguridad, accesos de 14 días y alertas.
export default function ResumenAdmin() {
  const { estado, datos: d, error, reintentar } = useDatos(adminApi.resumen, [], { cadaMs: 60000 })
  const criticas = d?.alertas.filter((a) => a.nivel === 'critico').length ?? 0
  const cifras = d
    ? {
        principal: {
          etiqueta: 'Sesiones abiertas',
          valor: miles(d.sesiones_activas),
          unidad: 'ahora',
          sub: `${miles(d.accesos.hoy)} accesos hoy · ${miles(d.accesos.fallidos_7d)} fallidos en 7 días`,
        },
        cifras: [
          { etiqueta: 'Usuarios activos', valor: `${miles(d.usuarios.activos)} / ${miles(d.usuarios.total)}`, tono: 'verde' },
          { etiqueta: 'Bloqueados', valor: miles(d.usuarios.bloqueados), tono: d.usuarios.bloqueados ? 'peligro' : undefined },
          { etiqueta: 'Fallidos 24 h', valor: miles(d.accesos.fallidos_24h), tono: d.accesos.fallidos_24h ? 'peligro' : undefined },
          { etiqueta: 'Equipos en línea', valor: `${miles(d.dispositivos.en_linea)} / ${miles(d.dispositivos.total)}` },
        ],
      }
    : { principal: { etiqueta: 'Sesiones abiertas', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Seguridad de todas las organizaciones" titulo="Resumen" cifras={cifras}>
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {d && (
        <div className="ui-consola-dash ui-admin-dash">
          <Card title="Accesos" subtitle="Inicios de sesión de los últimos 14 días.">
            <SerieAccesos serie={d.serie_accesos} />
          </Card>
          <Card
            title="Alertas de seguridad"
            subtitle={d.alertas.length ? `${d.alertas.length} por revisar${criticas ? ` · ${criticas} críticas` : ''}` : 'Todo en orden.'}
          >
            <AlertasSeguridad alertas={d.alertas} />
          </Card>
          <Card title="Cuentas" subtitle="Usuarios de todas las organizaciones.">
            <BarrasHorizontales
              filas={[
                { clave: 'act', etiqueta: 'Activas', valor: d.usuarios.activos, color: 'var(--success)' },
                { clave: 'ina', etiqueta: 'De baja', valor: d.usuarios.inactivos, color: 'var(--offline)' },
                { clave: 'blq', etiqueta: 'Bloqueadas', valor: d.usuarios.bloqueados, color: 'var(--danger)' },
                { clave: '2fa', etiqueta: 'Sin 2 pasos obligatorio', valor: d.usuarios.sin_2fa_obligatorio, color: 'var(--warning)' },
              ]}
            />
          </Card>
          <Card title="Equipos ESP32" subtitle={`${miles(d.dispositivos.total)} registrados en total.`}>
            <BarrasHorizontales
              filas={[
                { clave: 'linea', etiqueta: 'En línea', valor: d.dispositivos.en_linea, color: 'var(--success)' },
                { clave: 'sin', etiqueta: 'Sin conexión', valor: d.dispositivos.sin_conexion, color: 'var(--offline)' },
                { clave: 'mant', etiqueta: 'Mantenimiento', valor: d.dispositivos.mantenimiento, color: 'var(--warning)' },
                { clave: 'baja', etiqueta: 'Baja', valor: d.dispositivos.baja, color: 'var(--text-muted)' },
              ]}
            />
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
