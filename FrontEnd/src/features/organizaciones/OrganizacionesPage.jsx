import { Avatar, Badge, Button, Card, IconButton, IconCircle, Skeleton } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as organizacionesApi from '../../services/organizaciones'
import * as usuariosApi from '../../services/usuarios'
import { nombreCompleto, nombreCorto, pagina } from '../../utils/convertir'

async function cargar() {
  const [o, a, d, u] = await Promise.all([
    organizacionesApi.propia(),
    organizacionesApi.areas(),
    dispositivosApi.lista(),
    usuariosApi.lista(),
  ])
  return { organizaciones: pagina(o), areas: pagina(a), dispositivos: pagina(d), usuarios: pagina(u) }
}

// El administrador ve su propia organización y gestiona sus áreas.
export function OrganizacionesPage() {
  const { estado, datos, reintentar } = useDatos(cargar, [])
  const org = datos?.organizaciones[0]
  const cifras = datos
    ? {
        principal: { etiqueta: 'Organización', titulo: org?.nombre, sub: `${org?.ciudad} · ${org?.estado === 'ACTIVA' ? 'Activa' : org?.estado}`, tonoSub: 'lima' },
        cifras: [
          { etiqueta: 'Áreas', valor: datos.areas.length, tono: 'lima' },
          { etiqueta: 'Dispositivos', valor: datos.dispositivos.length },
          { etiqueta: 'Usuarios', valor: datos.usuarios.length },
        ],
      }
    : { principal: { etiqueta: 'Organización', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Administración" titulo="Organización y áreas" acciones={<Button icon="plus">Agregar área</Button>} cifras={cifras}>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-fila" style={{ gridTemplateColumns: '320px minmax(0,1fr)' }}>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Organización</h3>
                <p className="nc-card__sub">Datos de contacto</p>
              </div>
            </div>
            <div className="nc-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {datos.organizaciones.map((o) => (
                <div key={o.num} className="ui-item is-selected" style={{ gap: 12, padding: 12 }}>
                  <IconCircle name="building-2" tone="ink" size="md" />
                  <div className="ui-titulo-fila" style={{ flex: 1 }}>
                    <strong>{o.nombre}</strong>
                    <span style={{ fontSize: 12, lineHeight: '16px' }}>
                      {o.ciudad} · {datos.areas.length} áreas · {datos.dispositivos.length} dispositivos
                    </span>
                  </div>
                </div>
              ))}
              {org && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 12px' }}>
                  <div className="ui-dato">
                    <span className="ui-eyebrow">Dirección</span>
                    <strong>
                      {org.dir_calle} {org.dir_numero}, {org.dir_colonia}
                    </strong>
                  </div>
                  <div className="ui-dato">
                    <span className="ui-eyebrow">Teléfono</span>
                    <strong>{org.telefono}</strong>
                  </div>
                  <div className="ui-dato">
                    <span className="ui-eyebrow">Estado</span>
                    <div>
                      <Badge tone="success" dot>
                        {org.estado === 'ACTIVA' ? 'Activa' : org.estado}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ paddingTop: 16 }}>
              <Button variant="secondary" icon="settings" block>
                Editar datos
              </Button>
            </div>
          </Card>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Áreas de {org?.nombre}</h3>
                <p className="nc-card__sub">Los responsables reciben las alertas por correo</p>
              </div>
            </div>
            <div className="nc-table-wrap nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Área</th>
                    <th>Disp.</th>
                    <th>Supervisor</th>
                    <th>Alertas por correo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {datos.areas.map((a) => {
                    const sup = datos.usuarios.find((u) => u.area === a.num && u.rol === 'SUPER')
                    const resp = datos.usuarios.filter((u) => (u.area === a.num && u.rol === 'SUPER') || u.rol === 'ADMIN')
                    return (
                      <tr key={a.num}>
                        <td style={{ paddingTop: 14, paddingBottom: 14 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong className="ui-strong">{a.nombre}</strong>
                            <span className="ui-muted" style={{ fontSize: 12 }}>
                              {a.descripcion}
                            </span>
                          </div>
                        </td>
                        <td className="ui-num">{datos.dispositivos.filter((d) => d.area === a.num).length}</td>
                        <td>
                          {sup ? (
                            <div className="nc-table__device">
                              <Avatar name={nombreCompleto(sup)} size={28} />
                              <span>{nombreCompleto(sup)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {resp.map((u) => (
                              <Badge key={u.num} tone="neutral" icon="mail">
                                {nombreCorto(u)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <IconButton icon="ellipsis" label="Más opciones" variant="ghost" size="sm" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
