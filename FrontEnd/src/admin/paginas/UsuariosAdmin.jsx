import { useState } from 'react'
import { Avatar, Badge, Button, Card, EmptyState, Icon, Input, Skeleton } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
import { Select } from '../../components/Desplegable'
import { MenuAcciones } from '../../components/MenuAcciones'
import { Modal } from '../../components/Modal'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { pagina, ROL, ROL_TONO } from '../../utils/convertir'
import { haceCuanto } from '../../utils/formato'
import { useAviso } from '../../consola/utilidades'
import { ESTADO_USUARIO, opcionesRol, ROLES } from '../catalogos'
import { Confirmar, ErrorCarga, FiltroOrganizacion, Recorte } from '../comunes'
import { erroresDeCampo, mensajeError, useDiferido, useOrganizaciones } from '../utilidades'
import { fotoDe } from '../../utils/foto'

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACT', label: 'Activos' },
  { value: 'INA', label: 'De baja' },
  { value: 'BLQ', label: 'Bloqueados' },
]
const opcionesAreas = (org) => [
  { value: '', label: 'Todas las áreas' },
  ...(org?.areas ?? []).map((a) => ({ value: String(a.num), label: a.nombre })),
]

// Alta de un usuario en cualquier organización: primero la organización y luego su área.
function AltaUsuario({ organizaciones, cerrar, creado }) {
  const [f, setF] = useState({
    organizacion: organizaciones.length === 1 ? String(organizaciones[0].num) : '',
    area: '',
    rol: 'OPER',
    nombre: '',
    primer_apellido: '',
    segundo_apellido: '',
    correo: '',
    password: '',
  })
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const org = organizaciones.find((o) => String(o.num) === f.organizacion)
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const valido =
    f.organizacion && f.nombre.trim() && f.primer_apellido.trim() && /.+@.+\..+/.test(f.correo) && f.password.length >= 8
  const enviar = async () => {
    setEnviando(true)
    setErrores({})
    try {
      const cuerpo = {
        ...f,
        organizacion: Number(f.organizacion),
        area: f.area ? Number(f.area) : null,
        correo: f.correo.trim(),
        segundo_apellido: f.segundo_apellido.trim() || undefined,
      }
      creado(await adminApi.crearUsuario(cuerpo))
    } catch (e) {
      const porCampo = erroresDeCampo(e)
      setErrores(Object.keys(porCampo).length ? porCampo : { general: mensajeError(e, 'No se pudo agregar al usuario.') })
      setEnviando(false)
    }
  }
  // Los errores que no son de un campo del formulario se muestran abajo.
  const visibles = ['organizacion', 'area', 'rol', 'nombre', 'primer_apellido', 'segundo_apellido', 'correo', 'password']
  const otros = Object.entries(errores).filter(([k]) => !visibles.includes(k))
  return (
    <Modal
      titulo="Agregar usuario"
      sub="Comparte con la persona su contraseña inicial; podrá cambiarla desde su perfil."
      cerrar={cerrar}
      acciones={
        <Button icon="plus" disabled={!valido || enviando} onClick={enviar}>
          {enviando ? 'Agregando…' : 'Agregar usuario'}
        </Button>
      }
    >
      <div className="ui-grid-2">
        <div>
          <Select
            label="Organización"
            icon="building-2"
            value={f.organizacion}
            placeholder="Elige una organización"
            options={organizaciones.map((o) => ({ value: String(o.num), label: o.nombre }))}
            onChange={(e) => setF({ ...f, organizacion: e.target.value, area: '' })}
            error={errores.organizacion}
          />
        </div>
        <div>
          <Select label="Área" icon="map-pin" value={f.area} disabled={!org} options={opcionesAreas(org)} onChange={campo('area')} error={errores.area} />
        </div>
      </div>
      <Select label="Rol" value={f.rol} options={opcionesRol()} onChange={campo('rol')} error={errores.rol} />
      <div className="ui-grid-2">
        <Input label="Nombre" value={f.nombre} error={errores.nombre} onChange={campo('nombre')} />
        <Input label="Primer apellido" value={f.primer_apellido} error={errores.primer_apellido} onChange={campo('primer_apellido')} />
      </div>
      <Input
        label="Segundo apellido (opcional)"
        value={f.segundo_apellido}
        error={errores.segundo_apellido}
        onChange={campo('segundo_apellido')}
      />
      <Input label="Correo" type="email" icon="mail" value={f.correo} error={errores.correo} onChange={campo('correo')} />
      <Input
        label="Contraseña inicial"
        type="password"
        icon="key-round"
        autoComplete="new-password"
        value={f.password}
        error={errores.password}
        hint="Al menos 8 caracteres."
        onChange={campo('password')}
      />
      {otros.map(([k, v]) => (
        <p key={k} className="ui-admin-error" role="alert">
          {v}
        </p>
      ))}
    </Modal>
  )
}

// Editar rol, área y estado. El superusuario no se cambia a sí mismo el rol ni el estado.
function EditarUsuario({ usuario, organizaciones, propio, cerrar, guardado }) {
  const org = organizaciones.find((o) => o.num === usuario.organizacion?.num)
  const inicial = { rol: usuario.rol, area: usuario.area ? String(usuario.area.num) : '', estado_usuario: usuario.estado_usuario }
  const [f, setF] = useState(inicial)
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const cambios = Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== inicial[k]))
  const enviar = async () => {
    setEnviando(true)
    setErrores({})
    try {
      const cuerpo = { ...cambios }
      if ('area' in cuerpo) cuerpo.area = cuerpo.area ? Number(cuerpo.area) : null
      guardado(await adminApi.editarUsuario(usuario.num, cuerpo))
    } catch (e) {
      const porCampo = erroresDeCampo(e)
      setErrores(Object.keys(porCampo).length ? porCampo : { detail: mensajeError(e) })
      setEnviando(false)
    }
  }
  const estados = [
    { value: 'ACT', label: 'Activo' },
    { value: 'INA', label: 'De baja' },
    ...(usuario.estado_usuario === 'BLQ' ? [{ value: 'BLQ', label: 'Bloqueado' }] : []),
  ]
  const otros = Object.entries(errores).filter(([k]) => !['rol', 'area', 'estado_usuario'].includes(k))
  return (
    <Modal
      titulo={`Editar a ${usuario.nombre_completo}`}
      sub={`${usuario.correo} · ${usuario.organizacion?.nombre ?? 'Plataforma'}. Los cambios aplican desde su siguiente acción.`}
      cerrar={cerrar}
      acciones={
        <Button icon="circle-check" disabled={!Object.keys(cambios).length || enviando} onClick={enviar}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      }
    >
      <div className="ui-grid-2">
        <div>
          <Select
            label="Rol"
            value={f.rol}
            disabled={propio}
            options={opcionesRol(usuario.rol === 'ADMINPLAT' ? ROLES : undefined)}
            onChange={(e) => setF({ ...f, rol: e.target.value })}
            error={errores.rol}
          />
        </div>
        <div>
          <Select
            label="Área"
            icon="map-pin"
            value={f.area}
            disabled={!org}
            options={opcionesAreas(org)}
            onChange={(e) => setF({ ...f, area: e.target.value })}
            error={errores.area}
          />
        </div>
      </div>
      <Select
        label="Estado"
        value={f.estado_usuario}
        disabled={propio}
        options={estados}
        onChange={(e) => setF({ ...f, estado_usuario: e.target.value })}
        error={errores.estado_usuario}
      />
      {propio && <p className="ui-muted ui-consola-ayuda">Es tu cuenta: no puedes cambiar tu propio rol ni tu estado.</p>}
      {otros.map(([k, v]) => (
        <p key={k} className="ui-admin-error" role="alert">
          {v}
        </p>
      ))}
    </Modal>
  )
}

// Usuarios y roles de todas las organizaciones.
export default function UsuariosAdmin() {
  const { usuario: yo } = useSesion()
  const organizaciones = useOrganizaciones()
  const [organizacion, setOrganizacion] = useState('')
  const [rol, setRol] = useState('')
  const [estadoUsuario, setEstadoUsuario] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const q = useDiferido(busqueda.trim())
  const { estado, datos, error, reintentar, actualizar } = useDatos(
    () => adminApi.usuarios({ organizacion, rol, estado: estadoUsuario, q }),
    [organizacion, rol, estadoUsuario, q],
  )
  const [modal, setModal] = useState(null)
  const [aviso, avisar] = useAviso()
  const usuarios = pagina(datos)
  const hayFiltros = organizacion || rol || estadoUsuario || q

  const reemplazar = (u) => actualizar((d) => ({ ...d, results: pagina(d).map((x) => (x.num === u.num ? u : x)) }))
  const confirmar = (u, opciones) => setModal({ tipo: 'confirmar', usuario: u, ...opciones })

  const acciones = (u) => {
    const propio = u.num === yo?.num
    const nombre = u.nombre_completo
    return [
      { label: 'Editar rol, área o estado', icon: 'pencil', onClick: () => setModal({ tipo: 'editar', usuario: u }) },
      {
        label: 'Restablecer contraseña',
        icon: 'key-round',
        nota: 'Le llega un enlace por correo',
        onClick: () =>
          confirmar(u, {
            titulo: 'Restablecer contraseña',
            mensaje: `${nombre} recibirá en ${u.correo} un enlace para crear una contraseña nueva. Su contraseña actual deja de servir cuando la cambie.`,
            boton: 'Enviar enlace',
            icono: 'send',
            hacer: async () => avisar((await adminApi.restablecerPassword(u.num))?.detail || 'Enlace enviado.'),
          }),
      },
      {
        label: 'Quitar verificación en dos pasos',
        icon: 'shield-off',
        disabled: !u.segundo_factor,
        nota: u.segundo_factor ? undefined : 'No la tiene configurada',
        onClick: () =>
          confirmar(u, {
            titulo: 'Quitar verificación en dos pasos',
            mensaje: `${nombre} podrá entrar solo con su contraseña. Si su rol la exige, tendrá que configurarla de nuevo al entrar.`,
            boton: 'Quitar verificación',
            icono: 'shield-off',
            peligro: true,
            hacer: async () => {
              const r = await adminApi.quitarSegundoFactor(u.num)
              reemplazar({ ...u, segundo_factor: false })
              avisar(r?.detail || 'Verificación en dos pasos quitada.')
            },
          }),
      },
      {
        label: 'Cerrar sus sesiones',
        icon: 'log-out',
        disabled: !u.sesiones,
        nota: u.sesiones ? `${u.sesiones} abierta${u.sesiones === 1 ? '' : 's'}` : 'Sin sesiones abiertas',
        onClick: () =>
          confirmar(u, {
            titulo: 'Cerrar sus sesiones',
            mensaje: `${nombre} tendrá que volver a entrar en todos sus navegadores y celulares.`,
            boton: 'Cerrar sesiones',
            icono: 'log-out',
            peligro: true,
            hacer: async () => {
              const r = await adminApi.cerrarSesionesDe(u.num)
              reemplazar({ ...u, sesiones: Math.max(0, u.sesiones - (r?.cerradas ?? u.sesiones)) })
              avisar(`${r?.cerradas ?? 0} sesión${r?.cerradas === 1 ? '' : 'es'} cerrada${r?.cerradas === 1 ? '' : 's'}.`)
            },
          }),
      },
      u.estado_usuario === 'BLQ' && {
        label: 'Desbloquear',
        icon: 'lock-open',
        disabled: propio,
        onClick: () =>
          confirmar(u, {
            titulo: 'Desbloquear cuenta',
            mensaje: `${nombre} podrá volver a entrar con su contraseña.`,
            boton: 'Desbloquear',
            icono: 'lock-open',
            hacer: async () => {
              reemplazar(await adminApi.editarUsuario(u.num, { estado_usuario: 'ACT' }))
              avisar(`${nombre} ya puede entrar.`)
            },
          }),
      },
      u.estado_usuario === 'INA'
        ? {
            label: 'Reactivar',
            icon: 'user-check',
            disabled: propio,
            onClick: () =>
              confirmar(u, {
                titulo: 'Reactivar cuenta',
                mensaje: `${nombre} podrá volver a entrar a Núcleo.`,
                boton: 'Reactivar',
                icono: 'user-check',
                hacer: async () => {
                  reemplazar(await adminApi.editarUsuario(u.num, { estado_usuario: 'ACT' }))
                  avisar(`${nombre} puede volver a entrar.`)
                },
              }),
          }
        : {
            label: 'Dar de baja',
            icon: 'user-x',
            peligro: true,
            disabled: propio,
            nota: propio ? 'Es tu cuenta' : undefined,
            onClick: () =>
              confirmar(u, {
                titulo: 'Dar de baja',
                mensaje: `${nombre} ya no podrá entrar a Núcleo ni a la app. Sus datos y su historial se conservan; puedes reactivarla después.`,
                boton: 'Dar de baja',
                icono: 'user-x',
                peligro: true,
                hacer: async () => {
                  reemplazar(await adminApi.editarUsuario(u.num, { estado_usuario: 'INA' }))
                  avisar(`${nombre} quedó dado de baja.`)
                },
              }),
          },
    ]
  }

  const cuenta = (fn) => usuarios.filter(fn).length
  const cifras = datos
    ? {
        principal: {
          etiqueta: hayFiltros ? 'Usuarios con estos filtros' : 'Usuarios',
          valor: datos.count ?? usuarios.length,
          unidad: 'cuentas',
          sub: `${cuenta((u) => u.estado_usuario === 'ACT')} activas en la lista`,
        },
        cifras: [
          { etiqueta: 'Administradores', valor: cuenta((u) => u.rol === 'ADMIN') },
          { etiqueta: 'Con 2 pasos', valor: cuenta((u) => u.segundo_factor), tono: 'verde' },
          { etiqueta: 'Bloqueados', valor: cuenta((u) => u.estado_usuario === 'BLQ'), tono: cuenta((u) => u.estado_usuario === 'BLQ') ? 'peligro' : undefined },
          { etiqueta: 'De baja', valor: cuenta((u) => u.estado_usuario === 'INA') },
        ],
      }
    : { principal: { etiqueta: 'Usuarios', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla
      eyebrow="Cuentas de todas las organizaciones"
      titulo="Usuarios"
      acciones={
        <Button icon="plus" disabled={!organizaciones.length} onClick={() => setModal({ tipo: 'alta' })}>
          Agregar usuario
        </Button>
      }
      cifras={cifras}
    >
      <div className="ui-filtros ui-admin-filtros">
        <FiltroOrganizacion organizaciones={organizaciones} value={organizacion} onChange={setOrganizacion} />
        <Select
          label="Rol"
          value={rol}
          options={[{ value: '', label: 'Todos los roles' }, ...opcionesRol(ROLES)]}
          onChange={(e) => setRol(e.target.value)}
        />
        <Select label="Estado" value={estadoUsuario} options={ESTADOS} onChange={(e) => setEstadoUsuario(e.target.value)} />
        <div style={{ flex: 1 }} />
        {aviso}
        <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar por nombre o correo…" />
      </div>
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && !usuarios.length && (
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState
              icon="users"
              title={hayFiltros ? 'Nadie coincide con los filtros' : 'Aún no hay usuarios'}
              message={hayFiltros ? 'Prueba con otra organización, rol o búsqueda.' : 'Agrega el primero con «Agregar usuario».'}
            />
          </div>
        </Card>
      )}
      {estado === 'listo' && usuarios.length > 0 && (
        <Card className="nc-grow">
          <div className="nc-table-wrap nc-scroll">
            <table className="nc-table ui-tabla-tarjetas">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Organización</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Dos pasos</th>
                  <th>Último acceso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const est = ESTADO_USUARIO[u.estado_usuario] ?? { label: u.estado_usuario, tone: 'neutral' }
                  return (
                    <tr key={u.num}>
                      <td style={{ paddingTop: 12, paddingBottom: 12 }}>
                        <div className="nc-table__device">
                          <Avatar name={u.nombre_completo} src={fotoDe(u)} size={36} />
                          <div>
                            <strong>
                              {u.nombre_completo}
                              {u.num === yo?.num && <span className="ui-admin-tu"> (tú)</span>}
                            </strong>
                            <span>{u.correo}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="ui-titulo-fila">
                          <strong className="ui-admin-celda">{u.organizacion?.nombre ?? 'Plataforma'}</strong>
                          <span>{u.area?.nombre ?? (u.organizacion ? 'Todas las áreas' : '—')}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tone={ROL_TONO[u.rol]}>{ROL[u.rol] ?? u.rol}</Badge>
                      </td>
                      <td>
                        <Badge tone={est.tone} dot>
                          {est.label}
                        </Badge>
                      </td>
                      <td>
                        {u.segundo_factor ? (
                          <span className="ui-admin-si">
                            <Icon name="shield-check" size={16} /> Sí
                          </span>
                        ) : (
                          <span className="ui-muted">No</span>
                        )}
                      </td>
                      <td>
                        <div className="ui-titulo-fila">
                          <strong className="ui-admin-celda">{u.ultimo_acceso ? haceCuanto(u.ultimo_acceso) : 'Nunca'}</strong>
                          <span>{u.sesiones ? `${u.sesiones} sesión${u.sesiones === 1 ? '' : 'es'} abierta${u.sesiones === 1 ? '' : 's'}` : 'Sin sesiones'}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <MenuAcciones label={`Opciones de ${u.nombre_completo}`} items={acciones(u)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Recorte datos={datos} mostrados={usuarios.length} />
          </div>
        </Card>
      )}
      {modal?.tipo === 'alta' && (
        <AltaUsuario
          organizaciones={organizaciones}
          cerrar={() => setModal(null)}
          creado={(u) => {
            setModal(null)
            avisar(`${u.nombre_completo} agregado.`)
            reintentar()
          }}
        />
      )}
      {modal?.tipo === 'editar' && (
        <EditarUsuario
          usuario={modal.usuario}
          organizaciones={organizaciones}
          propio={modal.usuario.num === yo?.num}
          cerrar={() => setModal(null)}
          guardado={(u) => {
            reemplazar(u)
            setModal(null)
            avisar(`${u.nombre_completo} guardado.`)
          }}
        />
      )}
      {modal?.tipo === 'confirmar' && (
        <Confirmar
          titulo={modal.titulo}
          mensaje={modal.mensaje}
          boton={modal.boton}
          icono={modal.icono}
          peligro={modal.peligro}
          hacer={modal.hacer}
          cerrar={() => setModal(null)}
        />
      )}
    </Pantalla>
  )
}
