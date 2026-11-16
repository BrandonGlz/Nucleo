import { useState } from 'react'
import { Avatar, Badge, Button, Card, EmptyState, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { pagina, ROL } from '../../utils/convertir'
import { esHoy, haceCuanto } from '../../utils/formato'
import { fecha, useAviso } from '../../consola/utilidades'
import { CLIENTE } from '../catalogos'
import { Confirmar, ErrorCarga, FiltroOrganizacion, Recorte } from '../comunes'
import { useDiferido, useOrganizaciones } from '../utilidades'

const CLIENTES = [
  { value: '', label: 'Web y app' },
  { value: 'web', label: 'Solo web' },
  { value: 'app', label: 'Solo app' },
]

// Sesiones abiertas en navegadores y celulares de todas las organizaciones. La sesión con la que
// se ve la consola se marca y no se cierra desde aquí (para eso está «Cerrar sesión» del avatar).
export default function SesionesAdmin() {
  const organizaciones = useOrganizaciones()
  const [organizacion, setOrganizacion] = useState('')
  const [cliente, setCliente] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const q = useDiferido(busqueda.trim())
  const { estado, datos, error, reintentar, actualizar } = useDatos(
    () => adminApi.sesiones({ organizacion, cliente, q }),
    [organizacion, cliente, q],
  )
  const [cerrando, setCerrando] = useState(null)
  const [aviso, avisar] = useAviso()
  const sesiones = pagina(datos)
  const hayFiltros = organizacion || cliente || q
  const personas = new Set(sesiones.map((s) => s.usuario.num)).size

  const cifras = datos
    ? {
        principal: { etiqueta: 'Sesiones abiertas', valor: datos.count ?? sesiones.length, unidad: 'ahora', sub: `${personas} persona${personas === 1 ? '' : 's'}` },
        cifras: [
          { etiqueta: 'En la web', valor: sesiones.filter((s) => s.cliente === 'web').length, tono: 'verde' },
          { etiqueta: 'En la app', valor: sesiones.filter((s) => s.cliente === 'app').length },
          { etiqueta: 'Usadas hoy', valor: sesiones.filter((s) => esHoy(s.ultimo_uso)).length },
        ],
      }
    : { principal: { etiqueta: 'Sesiones abiertas', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Navegadores y celulares con la sesión iniciada" titulo="Sesiones abiertas" cifras={cifras}>
      <div className="ui-filtros ui-admin-filtros">
        <FiltroOrganizacion organizaciones={organizaciones} value={organizacion} onChange={setOrganizacion} />
        <Select label="Desde" value={cliente} options={CLIENTES} onChange={(e) => setCliente(e.target.value)} />
        <div style={{ flex: 1 }} />
        {aviso}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por persona, correo o IP…" />
      </div>
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && !sesiones.length && (
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState
              icon="monitor-smartphone"
              title={hayFiltros ? 'Ninguna sesión coincide' : 'No hay sesiones abiertas'}
              message={hayFiltros ? 'Prueba con otros filtros.' : 'Nadie tiene la sesión iniciada ahora.'}
            />
          </div>
        </Card>
      )}
      {estado === 'listo' && sesiones.length > 0 && (
        <Card className="nc-grow">
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table ui-tabla-tarjetas">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Organización</th>
                  <th>Equipo</th>
                  <th>IP</th>
                  <th>Abierta</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => (
                  <tr key={s.id} className={s.actual ? 'ui-admin-actual' : undefined}>
                    <td style={{ paddingTop: 12, paddingBottom: 12 }}>
                      <div className="nc-table__device">
                        <Avatar name={s.usuario.nombre_completo} size={36} />
                        <div>
                          <strong>{s.usuario.nombre_completo}</strong>
                          <span>{s.usuario.correo}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="ui-titulo-fila">
                        <strong className="ui-admin-celda">{s.usuario.organizacion?.nombre ?? 'Plataforma'}</strong>
                        <span>{ROL[s.usuario.rol] ?? s.usuario.rol}</span>
                      </div>
                    </td>
                    <td>
                      <span className="ui-admin-equipo">
                        <Icon name={CLIENTE[s.cliente]?.icon ?? 'layout-grid'} size={16} />
                        {s.dispositivo || CLIENTE[s.cliente]?.label || s.cliente}
                        {s.actual && <Badge tone="accent">Esta sesión</Badge>}
                      </span>
                    </td>
                    <td className="ui-admin-mono">{s.ip || '—'}</td>
                    <td>{fecha(s.creada)}</td>
                    <td>{haceCuanto(s.ultimo_uso)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {s.actual ? (
                        <span className="ui-muted ui-consola-cuenta" title="Para salir usa «Cerrar sesión» en el menú de tu avatar">
                          Con la que estás aquí
                        </span>
                      ) : (
                        <Button variant="secondary" size="sm" icon="log-out" onClick={() => setCerrando(s)}>
                          Cerrar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Recorte datos={datos} mostrados={sesiones.length} />
          </div>
        </Card>
      )}
      {cerrando && (
        <Confirmar
          titulo="Cerrar sesión"
          mensaje={`${cerrando.usuario.nombre_completo} tendrá que volver a entrar en ${cerrando.dispositivo || 'ese equipo'} (${cerrando.ip || 'IP desconocida'}).`}
          boton="Cerrar sesión"
          icono="log-out"
          peligro
          cerrar={() => setCerrando(null)}
          hacer={async () => {
            await adminApi.cerrarSesion(cerrando.id)
            actualizar((d) => ({ ...d, count: (d.count ?? 1) - 1, results: pagina(d).filter((x) => x.id !== cerrando.id) }))
            avisar('Sesión cerrada.')
          }}
        />
      )}
    </Pantalla>
  )
}
