import { useState } from 'react'
import {
  Avatar, Badge, Button, Card, Chip, IconButton, Input, Select, Skeleton,
} from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
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

async function cargar() {
  const [u, a, d, o] = await Promise.all([
    usuariosApi.lista(),
    organizacionesApi.areas(),
    dispositivosApi.lista(),
    organizacionesApi.propia(),
  ])
  return { usuarios: pagina(u), areas: pagina(a), dispositivos: pagina(d), organizacion: pagina(o)[0] }
}

function AgregarUsuario({ areas, cerrar, creado }) {
  const [f, setF] = useState({ nombre: '', primer_apellido: '', correo: '', rol: 'OPER', area: String(areas[0]?.num ?? '') })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const valido = f.nombre.trim() && f.primer_apellido.trim() && /.+@.+\..+/.test(f.correo)
  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      creado(await usuariosApi.crear({ ...f, area: f.area ? Number(f.area) : null }))
    } catch {
      setError('No se pudo agregar. Revisa que el correo no esté registrado.')
      setEnviando(false)
    }
  }
  return (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label="Agregar usuario">
      <div className="ui-modal__caja">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2>Agregar usuario</h2>
            <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '22px' }}>
              Le enviaremos un correo para que cree su contraseña.
            </p>
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrar} />
        </div>
        <div className="ui-grid-2">
          <Input label="Nombre" value={f.nombre} onChange={campo('nombre')} />
          <Input label="Primer apellido" value={f.primer_apellido} onChange={campo('primer_apellido')} />
        </div>
        <Input label="Correo" type="email" icon="mail" value={f.correo} onChange={campo('correo')} error={error ?? undefined} />
        <div className="ui-grid-2">
          <Select label="Rol" value={f.rol} onChange={campo('rol')} options={ROLES_ALTA.map((r) => ({ value: r, label: ROL[r] }))} />
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
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button icon="plus" disabled={!valido || enviando} onClick={enviar}>
            Agregar usuario
          </Button>
        </div>
      </div>
    </div>
  )
}

export function UsuariosPage() {
  const { estado, datos, reintentar, actualizar } = useDatos(cargar, [])
  const [filtro, setFiltro] = useState('todos')
  const [modal, setModal] = useState(false)
  const usuarios = datos?.usuarios ?? []
  const cuenta = (r) => usuarios.filter((u) => u.rol === r).length
  const lista = usuarios.filter((u) => filtro === 'todos' || u.rol === filtro)
  const org = datos?.organizacion?.nombre ?? ''

  const cifras = datos
    ? {
        principal: { etiqueta: 'Usuarios', valor: usuarios.length, unidad: 'cuentas', sub: `${usuarios.filter((u) => u.estado_usuario === 'ACT').length} activas · ${org}` },
        cifras: [
          { etiqueta: 'Administradores', valor: cuenta('ADMIN') },
          { etiqueta: 'Supervisores', valor: cuenta('SUPER'), tono: 'lima' },
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
        <Button icon="plus" disabled={!datos} onClick={() => setModal(true)}>
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
                        <Badge tone={ROL_TONO[u.rol]}>{ROL[u.rol]}</Badge>
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
                        <IconButton icon="ellipsis" label="Más opciones" variant="ghost" size="sm" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {modal && (
        <AgregarUsuario
          areas={datos.areas}
          cerrar={() => setModal(false)}
          creado={(u) => {
            actualizar((d) => ({ ...d, usuarios: [...d.usuarios, u] }))
            setModal(false)
          }}
        />
      )}
    </Pantalla>
  )
}
