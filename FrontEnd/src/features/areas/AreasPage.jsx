import { useRef, useState } from 'react'
import {
  Avatar, Badge, Button, Card, IconCircle, Input, Skeleton, StatusBadge, Tabs,
} from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as organizacionesApi from '../../services/organizaciones'
import * as usuariosApi from '../../services/usuarios'
import { ESTADO_DISPOSITIVO, nombreCompleto, nombreCorto, pagina } from '../../utils/convertir'
import { fotoDe, logoDe } from '../../utils/foto'

async function cargar() {
  const [o, a, d, u] = await Promise.all([
    organizacionesApi.propia(),
    organizacionesApi.areas(),
    dispositivosApi.lista(),
    usuariosApi.lista(),
  ])
  return { organizacion: pagina(o)[0] ?? null, areas: pagina(a), dispositivos: pagina(d), usuarios: pagina(u) }
}

const PESTANAS = [
  { id: 'areas', label: 'Áreas' },
  { id: 'asignacion', label: 'Asignación de dispositivos' },
]
const CAMPOS_EMPRESA = [
  ['nombre', 'Nombre de la empresa'],
  ['dir_calle', 'Calle'],
  ['dir_numero', 'Número'],
  ['dir_colonia', 'Colonia'],
  ['ciudad', 'Ciudad'],
  ['telefono', 'Teléfono'],
]

function EditarEmpresa({ org, cerrar, guardado, actualizarOrg, avisar }) {
  const [f, setF] = useState(() => Object.fromEntries(CAMPOS_EMPRESA.map(([k]) => [k, org[k] ?? ''])))
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      guardado(await organizacionesApi.actualizar(org.num, f))
    } catch {
      setError('No se pudo guardar. Revisa los datos e intenta de nuevo.')
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo="Datos de la empresa"
      sub="Aparecen en los reportes y en los correos de alerta."
      cerrar={cerrar}
      tamano="grande"
      acciones={
        <Button icon="circle-check" disabled={!f.nombre.trim() || enviando} onClick={enviar}>
          Guardar
        </Button>
      }
    >
      <div className="ui-empresa-form">
        <div className="ui-empresa-form__datos">
          <Input
            label="Nombre de la empresa"
            icon="building-2"
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
            error={error ?? undefined}
          />
          <div className="ui-grid-2">
            {CAMPOS_EMPRESA.slice(1).map(([k, label]) => (
              <Input key={k} label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            ))}
          </div>
        </div>
        <div className="ui-empresa-form__marca">
          <MarcaReportes org={org} editable avisar={avisar} guardada={actualizarOrg} />
        </div>
      </div>
    </Modal>
  )
}

function EditarArea({ area, cerrar, guardada }) {
  const [f, setF] = useState({ nombre: area?.nombre ?? '', descripcion: area?.descripcion ?? '' })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      guardada(await (area ? organizacionesApi.actualizarArea(area.num, f) : organizacionesApi.crearArea(f)))
    } catch {
      setError('No se pudo guardar. Revisa que no exista otra área con ese nombre.')
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={area ? `Editar ${area.nombre}` : 'Agregar área'}
      sub="Cada dispositivo pertenece a un área; sus supervisores reciben las alertas por correo."
      cerrar={cerrar}
      tamano="mediano"
      acciones={
        <Button icon={area ? 'circle-check' : 'plus'} disabled={!f.nombre.trim() || enviando} onClick={enviar}>
          {area ? 'Guardar' : 'Agregar área'}
        </Button>
      }
    >
      <div className="ui-grid-2">
        <Input label="Nombre" icon="map-pin" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={error ?? undefined} />
        <Input
          label="Descripción"
          placeholder="Zonas que cubre, separadas por ·"
          value={f.descripcion}
          onChange={(e) => setF({ ...f, descripcion: e.target.value })}
        />
      </div>
    </Modal>
  )
}

function EliminarArea({ area, cerrar, eliminada }) {
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    try {
      await organizacionesApi.eliminarArea(area.num)
      eliminada(area.num)
    } catch (e) {
      setError(e.status === 409 ? 'El área todavía tiene dispositivos o usuarios.' : 'No se pudo eliminar. Intenta de nuevo.')
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={`¿Eliminar ${area.nombre}?`}
      sub="Esta acción no se puede deshacer."
      cerrar={cerrar}
      tamano="chico"
      acciones={
        <Button variant="destructive" icon="trash-2" disabled={enviando} onClick={enviar}>
          Eliminar área
        </Button>
      }
    >
      {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
    </Modal>
  )
}

function TablaAreas({ datos, editar, eliminar, editable }) {
  return (
    <div className="nc-table-wrap nc-scroll ui-areas__tabla ui-areas__tabla--areas">
      <table className="nc-table ui-tabla-tarjetas">
        <thead>
          <tr>
            <th>Área</th>
            <th>Dispositivos</th>
            <th>Supervisor</th>
            <th>Alertas por correo</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {datos.areas.map((a) => {
            const disp = datos.dispositivos.filter((d) => d.area === a.num)
            const sup = datos.usuarios.find((u) => u.area === a.num && u.rol === 'SUPER')
            const resp = datos.usuarios.filter((u) => (u.area === a.num && u.rol === 'SUPER') || u.rol === 'ADMIN')
            const ocupada = disp.length > 0 || datos.usuarios.some((u) => u.area === a.num)
            return (
              <tr key={a.num}>
                <td style={{ paddingTop: 14, paddingBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <strong className="ui-strong">{a.nombre}</strong>
                    <span className="ui-muted ui-areas__descripcion">
                      {a.descripcion || 'Sin descripción'}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 280 }}>
                    {disp.length === 0 && <span className="ui-muted">Sin dispositivos</span>}
                    {disp.map((d) => (
                      <Badge key={d.num} tone="neutral" icon="cpu">
                        {d.nombre.replace('Núcleo ', '')}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td>
                  {sup ? (
                    <div className="nc-table__device">
                      <Avatar name={nombreCompleto(sup)} src={fotoDe(sup)} size={28} />
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
                  {editable && <MenuAcciones
                    label={`Opciones de ${a.nombre}`}
                    items={[
                      { label: 'Editar área', icon: 'pencil', onClick: () => editar(a) },
                      {
                        label: 'Eliminar área',
                        icon: 'trash-2',
                        peligro: true,
                        disabled: ocupada,
                        nota: ocupada ? 'Mueve antes sus dispositivos y usuarios' : undefined,
                        onClick: () => eliminar(a),
                      },
                    ]}
                  />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Asignacion({ datos, mover, guardando, editable }) {
  const opciones = datos.areas.map((a) => ({ value: a.num, label: a.nombre }))
  return (
    <div className="nc-table-wrap nc-scroll ui-areas__tabla">
      <table className="nc-table ui-tabla-tarjetas">
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>Estado</th>
            <th>Operador</th>
            <th style={{ width: 240 }}>Área</th>
          </tr>
        </thead>
        <tbody>
          {datos.dispositivos.map((d) => {
            const op = datos.usuarios.find((u) => u.num === d.operador)
            return (
              <tr key={d.num}>
                <td>
                  <div className="nc-table__device">
                    <IconCircle name="cpu" size="sm" />
                    <div>
                      <strong>{d.nombre}</strong>
                      <span>{d.codigo_mqtt}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <StatusBadge status={ESTADO_DISPOSITIVO[d.estado_dispositivo].status} label={ESTADO_DISPOSITIVO[d.estado_dispositivo].label} />
                </td>
                <td>{op ? nombreCompleto(op) : '—'}</td>
                <td>
                  <Desplegable
                    icon="map-pin"
                    value={d.area}
                    disabled={!editable || guardando === d.num}
                    onChange={(v) => Number(v) !== d.area && mover(d, Number(v))}
                    options={opciones}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const VERDE_MARCA = '#2BC47A'
const LOGO_TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const LOGO_MAXIMO = 2 * 1024 * 1024
const mensajeLogo = (err) => err?.datos?.logo?.[0] || err?.datos?.color_reporte?.[0] || 'No se pudo guardar. Intenta de nuevo.'

// Misma fórmula WCAG que el backend: luminancia relativa y contraste contra blanco.
function contrasteConBlanco(color) {
  const canales = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
  const lineales = canales.map((canal) =>
    canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4,
  )
  const luminancia = 0.2126 * lineales[0] + 0.7152 * lineales[1] + 0.0722 * lineales[2]
  return 1.05 / (luminancia + 0.05)
}

// Sección «Marca en reportes»: logo y color de la organización, ambos opcionales. El logo se
// sirve por la API con sesión y el color tiñe títulos, barras y gráficas del PDF.
function MarcaReportes({ org, editable, guardada, avisar }) {
  const entrada = useRef(null)
  const [color, setColor] = useState(org.color_reporte || VERDE_MARCA)
  const [estado, setEstado] = useState(null) // 'logo' | 'quitar' | 'color' | null
  const [error, setError] = useState('')
  const ocupado = estado !== null
  const personalizado = Boolean(org.color_reporte)
  const colorActual = (org.color_reporte || VERDE_MARCA).toUpperCase()
  const bajoContraste = color.toUpperCase() !== VERDE_MARCA && contrasteConBlanco(color) < 3

  async function elegir(e) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setError('')
    if (!LOGO_TIPOS.includes(archivo.type)) return setError('Elige una imagen PNG, JPEG o WebP.')
    if (archivo.size > LOGO_MAXIMO) return setError('El logo no puede pasar de 2 MB.')
    setEstado('logo')
    try {
      guardada(await organizacionesApi.subirLogo(org.num, archivo))
      avisar('Logo actualizado.')
    } catch (err) {
      setError(mensajeLogo(err))
    } finally {
      setEstado(null)
    }
  }

  async function quitar() {
    setError('')
    setEstado('quitar')
    try {
      guardada(await organizacionesApi.quitarLogo(org.num))
      avisar('Logo quitado.')
    } catch (err) {
      setError(mensajeLogo(err))
    } finally {
      setEstado(null)
    }
  }

  async function aplicar(valor) {
    if (valor && contrasteConBlanco(valor) < 3) {
      setError('Con este color el texto no se leería sobre blanco.')
      return
    }
    setError('')
    setEstado('color')
    try {
      const nuevo = await organizacionesApi.actualizar(org.num, { color_reporte: valor })
      guardada(nuevo)
      setColor(nuevo.color_reporte || VERDE_MARCA)
      avisar(valor ? 'Color de reportes actualizado.' : 'Color de reportes restablecido.')
    } catch (err) {
      setError(mensajeLogo(err))
    } finally {
      setEstado(null)
    }
  }

  return (
    <div className="ui-marca">
      <span className="ui-eyebrow">Marca en reportes</span>
      <div className="ui-marca__logo">
        {org.logo_url ? (
          <img src={logoDe(org)} alt={`Logo de ${org.nombre}`} />
        ) : (
          <span className="ui-marca__vacio">
            <IconCircle name="image" size="sm" />
            Sin logo
          </span>
        )}
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={elegir}
      />
      {editable ? (
        <div className="ui-marca__acciones">
          <Button variant="secondary" size="sm" icon="image" disabled={ocupado} onClick={() => entrada.current?.click()}>
            {estado === 'logo' ? 'Subiendo…' : org.logo_url ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {org.logo_url && (
            <Button variant="ghost" size="sm" icon="trash-2" disabled={ocupado} onClick={quitar}>
              {estado === 'quitar' ? 'Quitando…' : 'Quitar logo'}
            </Button>
          )}
        </div>
      ) : (
        <p className="ui-muted" style={{ margin: 0, fontSize: 12 }}>
          Solo el administrador cambia el logo y el color.
        </p>
      )}
      <div className="ui-marca__color">
        <label htmlFor="color-reportes">Color de los reportes</label>
        <div className="ui-marca__fila">
          <input
            id="color-reportes"
            type="color"
            value={color}
            disabled={!editable || ocupado}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
          />
          <code>{personalizado ? org.color_reporte : 'Verde de Núcleo'}</code>
          {editable && (
            <Button
              variant="secondary"
              disabled={ocupado || bajoContraste || color.toUpperCase() === colorActual}
              onClick={() => aplicar(color.toUpperCase())}
            >
              {estado === 'color' ? 'Aplicando…' : 'Aplicar color'}
            </Button>
          )}
        </div>
        {bajoContraste && (
          <span className="ui-marca__error" role="alert">
            Con este color el texto no se leería sobre blanco.
          </span>
        )}
        {editable && personalizado && (
          <button type="button" className="ui-link" disabled={ocupado} onClick={() => aplicar(null)}>
            Volver al verde de Núcleo
          </button>
        )}
      </div>
      {error && (
        <span className="ui-marca__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

// El administrador gestiona los datos de su empresa, sus áreas y a qué área pertenece cada
// dispositivo. El supervisor las consulta (la API solo deja editarlas al administrador).
export function AreasPage() {
  const { rol } = useSesion()
  const editable = rol === 'ADMIN'
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [pestana, setPestana] = useState('areas')
  const [modal, setModal] = useState(null)
  const [guardando, setGuardando] = useState(null)
  const [aviso, setAviso] = useState(null)
  const org = datos?.organizacion

  const avisar = (texto, tono = 'success') => {
    setAviso({ texto, tono })
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 3500)
  }
  const mover = async (d, area) => {
    setGuardando(d.num)
    try {
      const nuevo = await dispositivosApi.cambiarArea(d.num, area)
      actualizar((x) => ({ ...x, dispositivos: x.dispositivos.map((y) => (y.num === nuevo.num ? nuevo : y)) }))
      avisar(`${d.nombre} ahora está en ${datos.areas.find((a) => a.num === area)?.nombre}.`)
    } catch {
      avisar(`No se pudo mover ${d.nombre}. Intenta de nuevo.`, 'danger')
    } finally {
      setGuardando(null)
    }
  }

  const cifras = datos
    ? {
        principal: { etiqueta: 'Áreas', valor: datos.areas.length, unidad: org ? `en ${org.nombre}` : '', sub: org ? `${org.ciudad} · ${org.estado === 'ACTIVA' ? 'Activa' : org.estado}` : '' },
        cifras: [
          { etiqueta: 'Dispositivos', valor: datos.dispositivos.length, tono: 'verde' },
          { etiqueta: 'Supervisores', valor: datos.usuarios.filter((u) => u.rol === 'SUPER').length },
          { etiqueta: 'Usuarios', valor: datos.usuarios.length },
        ],
      }
    : { principal: { etiqueta: 'Áreas', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow={org ? `${org.nombre} · Administración` : 'Administración'}
      titulo="Empresa y áreas"
      acciones={
        editable && (
          <Button icon="plus" disabled={!datos} onClick={() => setModal({ tipo: 'area' })}>
            Agregar área
          </Button>
        )
      }
      cifras={cifras}
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <div className="ui-fila ui-areas" style={{ gridTemplateColumns: 'clamp(280px, 30%, 340px) minmax(0,1fr)' }}>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Empresa</h3>
                <p className="nc-card__sub">Datos de contacto</p>
              </div>
            </div>
            {org && (
              <div className="ui-empresa">
                <div className="ui-item is-selected ui-empresa__identidad">
                  <IconCircle name="building-2" tone="ink" size="md" />
                  <div className="ui-titulo-fila" style={{ flex: 1 }}>
                    <strong>{org.nombre}</strong>
                    <span>
                      {org.ciudad} · {datos.areas.length} áreas · {datos.dispositivos.length} dispositivos
                    </span>
                  </div>
                </div>
                <div className="ui-empresa__datos">
                  <div className="ui-dato">
                    <span className="ui-eyebrow">Dirección</span>
                    <strong>
                      {org.dir_calle} {org.dir_numero}, {org.dir_colonia}
                    </strong>
                  </div>
                  <div className="ui-dato">
                    <span className="ui-eyebrow">Teléfono</span>
                    <strong>{org.telefono || '—'}</strong>
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
                <div className="ui-empresa__marca">
                  <span className="ui-eyebrow">Marca en reportes</span>
                  <span className="ui-empresa__logo">
                    {org.logo_url ? <img src={logoDe(org)} alt={`Logo de ${org.nombre}`} /> : 'Sin logo'}
                  </span>
                  <span className="ui-empresa__separador" aria-hidden>·</span>
                  <span
                    className="ui-empresa__color"
                    style={{ background: org.color_reporte || VERDE_MARCA }}
                    aria-hidden
                  />
                  <span className="ui-muted ui-empresa__color-nombre">
                    {org.color_reporte || 'Verde de Núcleo'}
                  </span>
                </div>
              </div>
            )}
            {editable ? (
              <div style={{ paddingTop: 16 }}>
                <Button variant="secondary" icon="pencil" block disabled={!org} onClick={() => setModal({ tipo: 'empresa' })}>
                  Editar datos
                </Button>
              </div>
            ) : (
              <p className="ui-muted" style={{ margin: 0, paddingTop: 16, fontSize: 13 }}>
                Solo el administrador puede editar la empresa, las áreas y la asignación de dispositivos.
              </p>
            )}
          </Card>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 8, alignItems: 'center' }}>
              <Tabs items={PESTANAS} value={pestana} onChange={setPestana} />
              <div style={{ flex: 1 }} />
              {aviso && (
                <span className={`ui-aviso ui-aviso--${aviso.tono}`} role="status">
                  {aviso.texto}
                </span>
              )}
            </div>
            <p className="nc-card__sub" style={{ margin: '0 0 8px' }}>
              {pestana === 'areas'
                ? 'Los supervisores de cada área y los administradores reciben las alertas por correo.'
                : 'Elige el área de cada dispositivo. Si el operador asignado es de otra área, se le quita el dispositivo.'}
            </p>
            {pestana === 'areas' ? (
              <TablaAreas datos={datos} editable={editable} editar={(a) => setModal({ tipo: 'area', area: a })} eliminar={(a) => setModal({ tipo: 'eliminar', area: a })} />
            ) : (
              <Asignacion datos={datos} mover={mover} guardando={guardando} editable={editable} />
            )}
          </Card>
        </div>
      )}
      {modal?.tipo === 'empresa' && (
        <EditarEmpresa
          org={org}
          cerrar={() => setModal(null)}
          avisar={avisar}
          actualizarOrg={(o) => actualizar((x) => ({ ...x, organizacion: o }))}
          guardado={(o) => {
            actualizar((x) => ({ ...x, organizacion: o }))
            setModal(null)
            avisar('Datos de la empresa guardados.')
          }}
        />
      )}
      {modal?.tipo === 'area' && (
        <EditarArea
          area={modal.area}
          cerrar={() => setModal(null)}
          guardada={(a) => {
            actualizar((x) => ({
              ...x,
              areas: x.areas.some((y) => y.num === a.num) ? x.areas.map((y) => (y.num === a.num ? a : y)) : [...x.areas, a],
            }))
            setModal(null)
            setPestana('areas')
            avisar(modal.area ? `${a.nombre} guardada.` : `${a.nombre} agregada.`)
          }}
        />
      )}
      {modal?.tipo === 'eliminar' && (
        <EliminarArea
          area={modal.area}
          cerrar={() => setModal(null)}
          eliminada={(num) => {
            actualizar((x) => ({ ...x, areas: x.areas.filter((a) => a.num !== num) }))
            setModal(null)
            avisar(`${modal.area.nombre} eliminada.`)
          }}
        />
      )}
    </Pantalla>
  )
}
