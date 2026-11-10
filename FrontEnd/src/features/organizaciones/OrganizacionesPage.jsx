import { useState } from 'react'
import { Badge, Button, Card, IconCircle, Input, Skeleton } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as organizacionesApi from '../../services/organizaciones'
import { pagina } from '../../utils/convertir'

const cargar = async () => pagina(await organizacionesApi.lista())

const ESTADO = {
  ACTIVA: { label: 'Activa', tone: 'success' },
  SUSPENDIDA: { label: 'Suspendida', tone: 'warning' },
  BAJA: { label: 'Baja', tone: 'neutral' },
}
const CAMPOS = [
  ['nombre', 'Nombre de la empresa'],
  ['dir_calle', 'Calle'],
  ['dir_numero', 'Número'],
  ['dir_colonia', 'Colonia'],
  ['ciudad', 'Ciudad'],
  ['telefono', 'Teléfono'],
]
const CAMPOS_ADMIN = [
  ['nombre', 'Nombre'],
  ['primer_apellido', 'Primer apellido'],
  ['segundo_apellido', 'Segundo apellido'],
  ['telefono', 'Teléfono'],
]

// Alta o edición de los datos de una organización.
function EditarOrganizacion({ org, cerrar, guardada }) {
  const [f, setF] = useState(() => Object.fromEntries(CAMPOS.map(([k]) => [k, org?.[k] ?? ''])))
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      guardada(await (org ? organizacionesApi.actualizar(org.num, f) : organizacionesApi.crear(f)))
    } catch {
      setError('No se pudo guardar. Revisa los datos e intenta de nuevo.')
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={org ? `Editar ${org.nombre}` : 'Nueva organización'}
      sub={org ? 'Datos de contacto de la empresa cliente.' : 'Se da de alta activa; después se crea su primer administrador.'}
      cerrar={cerrar}
      acciones={
        <Button icon={org ? 'circle-check' : 'plus'} disabled={!f.nombre.trim() || enviando} onClick={enviar}>
          {org ? 'Guardar' : 'Dar de alta'}
        </Button>
      }
    >
      <Input label="Nombre de la empresa" icon="building-2" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={error ?? undefined} />
      <div className="ui-grid-2">
        {CAMPOS.slice(1).map(([k, label]) => (
          <Input key={k} label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
      </div>
    </Modal>
  )
}

// Primer administrador de una organización: después él da de alta al resto de sus usuarios.
function PrimerAdministrador({ org, cerrar, creado }) {
  const [f, setF] = useState({ nombre: '', primer_apellido: '', segundo_apellido: '', telefono: '', correo: '', password: '' })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const completo = f.nombre.trim() && f.primer_apellido.trim() && f.correo.trim() && f.password.length >= 8
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      creado(await organizacionesApi.primerAdministrador(org.num, f))
    } catch (e) {
      setError(
        e.status === 409
          ? 'Esta organización ya tiene un administrador activo.'
          : 'No se pudo crear. Revisa que el correo no esté en uso y que la contraseña sea segura.',
      )
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={`Primer administrador de ${org.nombre}`}
      sub="Entra con este correo y contraseña; desde Usuarios crea a supervisores, analistas y operadores."
      cerrar={cerrar}
      acciones={
        <Button icon="user-check" disabled={!completo || enviando} onClick={enviar}>
          Crear administrador
        </Button>
      }
    >
      <div className="ui-grid-2">
        {CAMPOS_ADMIN.map(([k, label]) => (
          <Input key={k} label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
      </div>
      <Input label="Correo" icon="mail" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} />
      <Input
        label="Contraseña"
        icon="lock"
        type="password"
        hint="Mínimo 8 caracteres."
        value={f.password}
        onChange={(e) => setF({ ...f, password: e.target.value })}
        error={error ?? undefined}
      />
    </Modal>
  )
}

// Suspender, reactivar o dar de baja: los usuarios de una organización que no está activa no entran.
function CambiarEstado({ org, estado, cerrar, cambiado }) {
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const textos = {
    ACTIVA: ['Reactivar', 'Sus usuarios vuelven a poder entrar a la web y a la app.'],
    SUSPENDIDA: ['Suspender', 'Sus usuarios no podrán entrar hasta que se reactive. Los dispositivos siguen enviando lecturas.'],
    BAJA: ['Dar de baja', 'Sus usuarios dejan de poder entrar. Los datos se conservan y se puede reactivar después.'],
  }
  const [accion, detalle] = textos[estado]
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      cambiado(await organizacionesApi.actualizar(org.num, { estado }))
    } catch {
      setError('No se pudo cambiar el estado. Intenta de nuevo.')
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={`${accion} ${org.nombre}`}
      sub={detalle}
      cerrar={cerrar}
      acciones={
        <Button variant={estado === 'ACTIVA' ? 'primary' : 'destructive'} disabled={enviando} onClick={enviar}>
          {accion}
        </Button>
      }
    >
      {error && (
        <span className="ui-aviso ui-aviso--danger" role="alert">
          {error}
        </span>
      )}
    </Modal>
  )
}

// Administrador de plataforma: organizaciones clientes, su estado y su primer administrador.
export function OrganizacionesPage() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [modal, setModal] = useState(null)
  const [aviso, setAviso] = useState(null)
  const orgs = datos ?? []

  const avisar = (texto) => {
    setAviso(texto)
    setTimeout(() => setAviso((a) => (a === texto ? null : a)), 3500)
  }
  const guardar = (o) => actualizar((x) => (x.some((y) => y.num === o.num) ? x.map((y) => (y.num === o.num ? o : y)) : [...x, o]))
  const cuenta = (e) => orgs.filter((o) => o.estado === e).length

  const cifras = datos
    ? {
        principal: { etiqueta: 'Organizaciones', valor: orgs.length, unidad: 'clientes', sub: `${cuenta('ACTIVA')} activas` },
        cifras: [
          { etiqueta: 'Activas', valor: cuenta('ACTIVA'), tono: 'verde' },
          { etiqueta: 'Suspendidas', valor: cuenta('SUSPENDIDA') },
          { etiqueta: 'De baja', valor: cuenta('BAJA') },
        ],
      }
    : { principal: { etiqueta: 'Organizaciones', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow="Plataforma"
      titulo="Organizaciones"
      acciones={
        <Button icon="plus" disabled={!datos} onClick={() => setModal({ tipo: 'editar' })}>
          Nueva organización
        </Button>
      }
      cifras={cifras}
    >
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <Card className="nc-grow">
          <div className="nc-card__head" style={{ marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="nc-card__title">Empresas clientes</h3>
              <p className="nc-card__sub">Solo entran los usuarios de las organizaciones activas.</p>
            </div>
            {aviso && (
              <span className="ui-aviso ui-aviso--success" role="status">
                {aviso}
              </span>
            )}
          </div>
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table">
              <thead>
                <tr>
                  <th>Organización</th>
                  <th>Dirección</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th style={{ width: 56 }} />
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="ui-muted">
                      Aún no hay organizaciones.
                    </td>
                  </tr>
                )}
                {orgs.map((o) => {
                  const e = ESTADO[o.estado] ?? ESTADO.ACTIVA
                  const direccion = [[o.dir_calle, o.dir_numero].filter(Boolean).join(' '), o.dir_colonia, o.ciudad].filter(Boolean).join(', ')
                  return (
                    <tr key={o.num}>
                      <td>
                        <div className="nc-table__device">
                          <IconCircle name="building-2" size="sm" />
                          <div>
                            <strong>{o.nombre}</strong>
                            <span>{o.ciudad || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>{direccion || '—'}</td>
                      <td>{o.telefono || '—'}</td>
                      <td>
                        <Badge tone={e.tone} dot>
                          {e.label}
                        </Badge>
                      </td>
                      <td>{o.fecha_registro ? new Date(o.fecha_registro).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <MenuAcciones
                          label={`Opciones de ${o.nombre}`}
                          items={[
                            { label: 'Editar datos', icon: 'pencil', onClick: () => setModal({ tipo: 'editar', org: o }) },
                            { label: 'Crear primer administrador', icon: 'user-check', onClick: () => setModal({ tipo: 'admin', org: o }) },
                            o.estado === 'ACTIVA'
                              ? { label: 'Suspender', icon: 'circle-x', onClick: () => setModal({ tipo: 'estado', org: o, estado: 'SUSPENDIDA' }) }
                              : { label: 'Reactivar', icon: 'circle-check', onClick: () => setModal({ tipo: 'estado', org: o, estado: 'ACTIVA' }) },
                            ...(o.estado !== 'BAJA'
                              ? [{ label: 'Dar de baja', icon: 'trash-2', peligro: true, onClick: () => setModal({ tipo: 'estado', org: o, estado: 'BAJA' }) }]
                              : []),
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {modal?.tipo === 'editar' && (
        <EditarOrganizacion
          org={modal.org}
          cerrar={() => setModal(null)}
          guardada={(o) => {
            guardar(o)
            setModal(null)
            avisar(modal.org ? `${o.nombre} guardada.` : `${o.nombre} dada de alta.`)
          }}
        />
      )}
      {modal?.tipo === 'admin' && (
        <PrimerAdministrador
          org={modal.org}
          cerrar={() => setModal(null)}
          creado={(u) => {
            setModal(null)
            avisar(`${u.nombre} ya puede entrar como administrador de ${modal.org.nombre}.`)
          }}
        />
      )}
      {modal?.tipo === 'estado' && (
        <CambiarEstado
          org={modal.org}
          estado={modal.estado}
          cerrar={() => setModal(null)}
          cambiado={(o) => {
            guardar(o)
            setModal(null)
            avisar(`${o.nombre}: ${ESTADO[o.estado].label.toLowerCase()}.`)
          }}
        />
      )}
    </Pantalla>
  )
}
