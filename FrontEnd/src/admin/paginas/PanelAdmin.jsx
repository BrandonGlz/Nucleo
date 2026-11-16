import { BarChart, Card, Skeleton } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { BarrasHorizontales } from '../../consola/comunes'
import { ErrorCarga } from '../comunes'

const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
const miles = (n) => Number(n ?? 0).toLocaleString('es-MX')
const porcentaje = (n, total) => (total ? `${Math.round((n / total) * 100)} %` : '0 %')
// La barra resaltada al abrir: la de mayor valor.
const mayor = (serie, campo) => serie.reduce((m, x, i) => (x[campo] > serie[m][campo] ? i : m), 0)

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

// Panel de la consola de administración: solo cifras y gráficas. Las alertas de seguridad
// tienen su propio módulo («Alertas»).
export default function PanelAdmin() {
  const { estado, datos: d, error, reintentar } = useDatos(adminApi.resumen, [], { cadaMs: 60000 })
  const alertas = d?.alertas_seguridad
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
          { etiqueta: 'Fallidos 24 h', valor: miles(d.accesos.fallidos_24h), tono: d.accesos.fallidos_24h ? 'peligro' : undefined },
          {
            etiqueta: 'Alertas nuevas',
            valor: miles(alertas?.nuevas),
            tono: alertas?.criticas ? 'peligro' : undefined,
          },
          { etiqueta: 'Dispositivos en línea', valor: `${miles(d.dispositivos.en_linea)} / ${miles(d.dispositivos.total)}` },
        ],
      }
    : { principal: { etiqueta: 'Sesiones abiertas', valor: '—', tonoValor: 'apagado' } }

  const totalSesiones = d ? d.sesiones.web + d.sesiones.app : 0
  return (
    <Pantalla eyebrow="Seguridad de todas las organizaciones" titulo="Panel" cifras={cifras}>
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {d && (
        <div className="ui-consola-dash ui-admin-dash">
          <Card title="Accesos" subtitle="Inicios de sesión de los últimos 14 días.">
            <SerieAccesos serie={d.serie_accesos} />
          </Card>
          <Card title="Sesiones abiertas" subtitle={`${miles(totalSesiones)} entre la web y la app.`}>
            <BarrasHorizontales
              filas={[
                { clave: 'web', etiqueta: 'Web', valor: d.sesiones.web, color: 'var(--accent)', nota: porcentaje(d.sesiones.web, totalSesiones) },
                { clave: 'app', etiqueta: 'App', valor: d.sesiones.app, color: 'var(--success)', nota: porcentaje(d.sesiones.app, totalSesiones) },
              ]}
            />
          </Card>
          <Card title="Intentos fallidos por día" subtitle="Contraseña o código incorrectos, últimos 14 días.">
            <BarChart
              className="ui-admin-barras-fallidos"
              data={d.serie_accesos.map((x) => ({ label: dia(x.dia), value: x.fallidos }))}
              decimals={0}
              unit="fallidos"
              height={200}
              label="Intentos fallidos por día"
              activeIndex={mayor(d.serie_accesos, 'fallidos')}
            />
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
          <Card title="Horario de acceso" subtitle="Inicios de sesión por hora del día (hora de Tijuana), últimos 14 días.">
            <BarChart
              data={d.accesos_por_hora.map((x) => ({ label: x.hora % 3 === 0 ? `${x.hora} h` : '', value: x.total }))}
              decimals={0}
              unit="accesos"
              height={200}
              label="Accesos por hora"
              activeIndex={mayor(d.accesos_por_hora, 'total')}
            />
          </Card>
          <Card title="Dispositivos" subtitle={`${miles(d.dispositivos.total)} equipos ESP32 registrados en total.`}>
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
