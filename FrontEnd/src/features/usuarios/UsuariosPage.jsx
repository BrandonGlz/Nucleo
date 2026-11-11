import { useState } from 'react'
import {
  Avatar, Badge, Button, Card, Chip, Icon, IconButton, Input, Skeleton,
} from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import { useCierre } from '../../hooks/useSalida'
import * as dispositivosApi from '../../services/dispositivos'
import * as organizacionesApi from '../../services/organizaciones'
import * as usuariosApi from '../../services/usuarios'
import { nombreCompleto, pagina, ROL, ROL_TONO } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'

const FILTROS = [
  ['todos', 'Todos'],
  ['ADMIN', 'Administradores'],
  ['SUPER', 'Supervisores'],
  ['ANALISTA', 'Analistas'],
  ['OPER', 'Operadores'],
]
const ROLES_ALTA = ['ADMIN', 'SUPER', 'ANALISTA', 'OPER']
const sinAcentos = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

async function cargar() {
  const [u, a, d, o] = await Promise.all([
    usuariosApi.lista(),
    organizacionesApi.areas(),
    dispositivosApi.lista(),
    organizacionesApi.propia(),
  ])
  return { usuarios: pagina(u), areas: pagina(a), dispositivos: pagina(d), organizacion: pagina(o)[0] }
}

// Alta y edición de un usuario. Con `usuario` edita; sin él, agrega.
function FormUsuario({ usuario, areas, roles, cerrar, guardado }) {
  const [saliendo, cerrarAnimado] = useCierre(cerrar)
  const [f, setF] = useState(() =>
    usuario
      ? { nombre: usuario.nombre, primer_apellido: usuario.primer_apellido, correo: usuario.correo, rol: usuario.rol, area: usuario.area == null ? '' : String(usuario.area) }
      : { nombre: '', primer_apellido: '', correo: '', password: '', rol: 'OPER', area: String(areas[0]?.num ?? '') },
  )
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const valido =
    f.nombre.trim() && f.primer_apellido.trim() && /.+@.+\..+/.test(f.correo) && (usuario || f.password.length >= 8)
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const cuerpo = { ...f, area: f.area ? Number(f.area) : null }
      guardado(await (usuario ? usuariosApi.actualizar(usuario.num, cuerpo) : usuariosApi.crear(cuerpo)))
    } catch {
      setError(
        usuario
          ? 'No se pudo guardar. Intenta de nuevo.'
          : 'No se pudo agregar. Revisa que el correo no esté registrado y que la contraseña no sea muy común.',
      )
      setEnviando(false)
    }
  }
  return (
    <div className={`ui-modal${saliendo ? ' is-saliendo' : ''}`} role="dialog" aria-modal="true" aria-label={usuario ? 'Editar usuario' : 'Agregar usuario'}>
      <div className="ui-modal__caja">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2>{usuario ? `Editar a ${usuario.nombre}` : 'Agregar usuario'}</h2>
            <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '22px' }}>
              {usuario
                ? 'Los cambios de rol y área aplican desde su siguiente acción.'
                : 'Comparte con la persona su contraseña inicial; podrá cambiarla desde su perfil.'}
            </p>
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrarAnimado} />
        </div>
        <div className="ui-grid-2">
          <Input label="Nombre" value={f.nombre} onChange={campo('nombre')} />
          <Input label="Primer apellido" value={f.primer_apellido} onChange={campo('primer_apellido')} />
        </div>
        <Input label="Correo" type="email" icon="mail" value={f.correo} onChange={campo('correo')} error={error ?? undefined} />
        {!usuario && (
          <Input
            label="Contraseña inicial"
            type="password"
            icon="key-round"
            value={f.password}
            onChange={campo('password')}
            hint="Al menos 8 caracteres."
          />
        )}
        <div className="ui-grid-2">
          <Select label="Rol" value={f.rol} onChange={campo('rol')} options={roles.map((r) => ({ value: r, label: ROL[r] }))} />
          <Select
            label="Área"
            icon="map-pin"
            value={f.area}
            onChange={campo('area')}
            options={[{ value: '', label: 'Todas las áreas' }, ...areas.map((a) => ({ value: String(a.num), label: a.nombre }))]}
          />
        </div>
        <p className="ui-muted" style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
          Un operador solo ve el dispositivo que tiene asignado, desde la app móvil. El dispositivo se asigna desde su detalle.
        </p>
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrarAnimado}>
            Cancelar
          </Button>
          <Button icon={usuario ? 'circle-check' : 'plus'} disabled={!valido || enviando} onClick={enviar}>
            {usuario ? 'Guardar cambios' : 'Agregar usuario'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function UsuariosPage() {
  const { usuario: yo, rol } = useSesion()
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState(null)
  const [aviso, setAviso] = useState(null)
  const usuarios = datos?.usuarios ?? []
  const cuenta = (r) => usuarios.filter((u) => u.rol === r).length
  const texto = sinAcentos(busqueda.trim())
  const lista = usuarios.filter(
    (u) => (filtro === 'todos' || u.rol === filtro) && (!texto || sinAcentos(`${nombreCompleto(u)} ${u.correo}`).includes(texto)),
  )
  const org = datos?.organizacion?.nombre ?? ''
  // Un supervisor no puede dar ni quitar el rol de administrador.
  const roles = rol === 'ADMIN' ? ROLES_ALTA : ROLES_ALTA.filter((r) => r !== 'ADMIN')

  const reemplazar = (u) => actualizar((d) => ({ ...d, usuarios: d.usuarios.map((x) => (x.num === u.num ? u : x)) }))
  const avisar = (t, tono = 'success') => {
    setAviso({ t, tono })
    setTimeout(() => setAviso((a) => (a?.t === t ? null : a)), 3500)
  }
  const cambiar = async (u, cambios, mensaje) => {
    try {
      reemplazar(await usuariosApi.actualizar(u.num, cambios))
      avisar(mensaje)
    } catch {
      avisar(`No se pudo actualizar a ${nombreCompleto(u)}.`, 'danger')
    }
  }
  const acciones = (u) => {
    const activo = u.estado_usuario === 'ACT'
    const propio = u.num === yo?.num
    const bloqueado = rol !== 'ADMIN' && u.rol === 'ADMIN'
    return [
      { label: 'Editar usuario', icon: 'pencil', disabled: bloqueado, onClick: () => setModal({ usuario: u }) },
      u.rol === 'OPER' && {
        label: u.acceso_agente ? 'Quitar Nico AI' : 'Permitir Nico AI',
        icon: 'sparkles',
        nota: 'En la app móvil',
        onClick: () =>
          cambiar(u, { acceso_agente: !u.acceso_agente }, u.acceso_agente ? `${u.nombre} ya no ve Nico AI.` : `${u.nombre} ya puede usar Nico AI.`),
      },
      { label: 'Copiar correo', icon: 'mail', onClick: () => navigator.clipboard?.writeText(u.correo).then(() => avisar('Correo copiado.')).catch(() => {}) },
      {
        label: activo ? 'Desactivar cuenta' : 'Reactivar cuenta',
        icon: activo ? 'user-x' : 'user-check',
        peligro: activo,
        disabled: propio || bloqueado,
        nota: propio ? 'No puedes desactivar tu propia cuenta' : undefined,
        onClick: () =>
          cambiar(u, { estado_usuario: activo ? 'INA' : 'ACT' }, activo ? `${nombreCompleto(u)} ya no puede entrar.` : `${nombreCompleto(u)} puede volver a entrar.`),
      },
    ]
  }

  const cifras = datos
    ? {
        principal: { etiqueta: 'Usuarios', valor: usuarios.length, unidad: 'cuentas', sub: `${usuarios.filter((u) => u.estado_usuario === 'ACT').length} activas · ${org}` },
        cifras: [
          { etiqueta: 'Administradores', valor: cuenta('ADMIN') },
          { etiqueta: 'Supervisores', valor: cuenta('SUPER'), tono: 'verde' },
          { etiqueta: 'Analistas', valor: cuenta('ANALISTA') },
          { etiqueta: 'Operadores', valor: cuenta('OPER') },
        ],
      }
    : { principal: { etiqueta: 'Usuarios', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow={datos ? `${org} · ${usuarios.length} personas` : ''}
      titulo="Usuarios"
      acciones={
        <Button icon="plus" disabled={!datos} onClick={() => setModal({})}>
          Agregar usuario
        </Button>
      }
      cifras={cifras}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {FILTROS.map(([id, label]) => (
          <Chip key={id} selected={filtro === id} count={id === 'todos' ? usuarios.length : cuenta(id)} onClick={() => setFiltro(id)}>
            {label}
          </Chip>
        ))}
        <div style={{ flex: 1 }} />
        {aviso && (
          <span className={`ui-aviso ui-aviso--${aviso.tono}`} role="status">
            {aviso.t}
          </span>
        )}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por nombre o correo…" />
      </div>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <Card className="nc-grow">
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Área</th>
                  <th>Dispositivo asignado</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => {
                  const disp = datos.dispositivos.find((d) => d.operador === u.num)
                  const activo = u.estado_usuario === 'ACT'
                  return (
                    <tr key={u.num}>
                      <td style={{ paddingTop: 12, paddingBottom: 12 }}>
                        <div className="nc-table__device">
                          <Avatar name={nombreCompleto(u)} size={36} />
                          <div>
                            <strong>{nombreCompleto(u)}</strong>
                            <span>{u.correo}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Badge tone={ROL_TONO[u.rol]}>{ROL[u.rol]}</Badge>
                          {u.rol === 'OPER' && u.acceso_agente && (
                            <span className="ui-etiqueta-ia" title="Puede usar Nico AI en la app">
                              <Icon name="sparkles" size={12} /> IA
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{datos.areas.find((a) => a.num === u.area)?.nombre ?? 'Todas las áreas'}</td>
                      <td>{disp ? disp.nombre : '—'}</td>
                      <td>
                        <Badge tone={activo ? 'success' : 'offline'} dot>
                          {activo ? 'Activo' : u.estado_usuario === 'BLQ' ? 'Bloqueado' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td>{haceCuanto(u.ultimo_acceso)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <MenuAcciones label={`Opciones de ${nombreCompleto(u)}`} items={acciones(u)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {lista.length === 0 && (
              <p className="ui-muted" style={{ textAlign: 'center', padding: 32, margin: 0 }}>
                Nadie coincide con «{busqueda}».
              </p>
            )}
          </div>
        </Card>
      )}
      {modal && (
        <FormUsuario
          usuario={modal.usuario}
          areas={datos.areas}
          roles={roles}
          cerrar={() => setModal(null)}
          guardado={(u) => {
            if (modal.usuario) reemplazar(u)
            else actualizar((d) => ({ ...d, usuarios: [...d.usuarios, u] }))
            avisar(modal.usuario ? `${nombreCompleto(u)} guardado.` : `${nombreCompleto(u)} agregado.`)
            setModal(null)
          }}
        />
      )}
    </Pantalla>
  )
}
