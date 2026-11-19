import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Input, Select } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import * as solicitudes from '../../services/solicitudes'

const ESTADO = {
  PENDIENTE: { texto: 'Pendiente', tono: 'warning' },
  APROBADA: { texto: 'Aprobada', tono: 'success' },
  RECHAZADA: { texto: 'Rechazada', tono: 'danger' },
}
const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// Alta de una persona a partir de su solicitud de acceso (enlace del correo de Nico). El
// administrador revisa los datos, elige área y rol y crea la cuenta; Nico le manda la bienvenida
// con una contraseña temporal que debe cambiar al entrar.
export function SolicitudPage() {
  const { num } = useParams()
  const { usuario } = useSesion()
  const [s, setS] = useState(null)
  const [error, setError] = useState()
  const [f, setF] = useState(null)
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    solicitudes
      .detalle(num)
      .then((d) => {
        setS(d)
        setF({
          area: d.area ? String(d.area) : '',
          rol: 'OPER',
          nombre: d.nombre,
          primer_apellido: d.primer_apellido,
          segundo_apellido: d.segundo_apellido || '',
        })
      })
      .catch((err) =>
        setError(
          err.status === 404
            ? 'La solicitud no existe o pertenece a otra organización.'
            : err.status === 403
              ? 'Solo un administrador puede revisar solicitudes de acceso.'
              : 'No pudimos cargar la solicitud. Intenta de nuevo.',
        ),
      )
  }, [num])

  const campo = (k) => (e) => {
    setF({ ...f, [k]: e.target.value })
    setErrores({ ...errores, [k]: undefined })
  }

  const aprobar = async () => {
    const e = {}
    if (!f.area) e.area = 'Elige el área.'
    if (!f.nombre.trim()) e.nombre = 'Escribe el nombre.'
    if (!f.primer_apellido.trim()) e.primer_apellido = 'Escribe el primer apellido.'
    setErrores(e)
    if (Object.keys(e).length) return
    setEnviando(true)
    try {
      const d = await solicitudes.aprobar(num, { ...f, area: Number(f.area) })
      setS(d)
      setResultado({ tipo: 'aprobada', correo: d.correo_enviado })
    } catch (err) {
      const datos = err.datos || {}
      setErrores(Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, [].concat(v).join(' ')])))
      if (!Object.keys(datos).length) setErrores({ detail: 'No pudimos crear la cuenta. Intenta de nuevo.' })
    }
    setEnviando(false)
  }

  const rechazar = async () => {
    if (!window.confirm(`¿Rechazar la solicitud de ${s.nombre}? Nico le avisará por correo.`)) return
    setEnviando(true)
    try {
      setS(await solicitudes.rechazar(num))
      setResultado({ tipo: 'rechazada' })
    } catch (err) {
      setErrores({ detail: [].concat(err.datos?.detail ?? 'No pudimos rechazar la solicitud.').join(' ') })
    }
    setEnviando(false)
  }

  const inicio = usuario?.rol === 'ADMINPLAT' ? '/organizaciones' : '/usuarios'
  if (error) {
    return (
      <Pantalla eyebrow="Usuarios" titulo="Solicitud de acceso">
        <Alert level="critical" title={error} action={<Link to={inicio}>Volver</Link>} />
      </Pantalla>
    )
  }
  if (!s || !f) return <div className="ui-cargando-seccion" aria-busy="true" />

  const nombre = [s.nombre, s.primer_apellido, s.segundo_apellido].filter(Boolean).join(' ')
  const estado = ESTADO[s.estado]
  const pendiente = s.estado === 'PENDIENTE'

  return (
    <Pantalla eyebrow="Usuarios" titulo="Solicitud de acceso">
      <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)' }}>
        <Card className="nc-grow">
          <div className="ui-panel">
            <div className="nc-card__head" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">{nombre}</h3>
                <p className="nc-card__sub">{s.correo}</p>
              </div>
              <Badge tone={estado.tono}>{estado.texto}</Badge>
            </div>
            <dl className="solicitud__datos">
              <dt>Organización</dt>
              <dd>{s.organizacion.nombre}</dd>
              <dt>Área solicitada</dt>
              <dd>{s.areas.find((a) => a.num === s.area)?.nombre ?? '—'}</dd>
              <dt>Fecha de solicitud</dt>
              <dd>{fecha(s.fecha_solicitud)}</dd>
              {!pendiente && (
                <>
                  <dt>Atendida por</dt>
                  <dd>
                    {s.atendida_por ?? '—'} · {fecha(s.fecha_atencion)}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </Card>
        <Card className="nc-grow">
          <div className="ui-panel">
            <div className="nc-card__head" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Dar de alta en {s.organizacion.nombre}</h3>
                <p className="nc-card__sub">
                  Nico le enviará su bienvenida con una contraseña temporal que deberá cambiar al entrar.
                </p>
              </div>
            </div>
            {resultado?.tipo === 'aprobada' && (
              <Alert level="normal" title="Cuenta creada">
                {resultado.correo
                  ? `Nico le envió a ${s.correo} su bienvenida y sus credenciales.`
                  : 'La cuenta se creó, pero el correo de bienvenida no salió. Restablece su contraseña desde Usuarios.'}
              </Alert>
            )}
            {resultado?.tipo === 'rechazada' && <Alert level="info" title="Solicitud rechazada">Nico le avisó por correo.</Alert>}
            {pendiente && s.correo_registrado && (
              <Alert level="warning" title="Ese correo ya tiene una cuenta">
                Revisa en Usuarios; no se puede crear otra con el mismo correo.
              </Alert>
            )}
            {errores.detail && <Alert level="critical" title={errores.detail} />}
            <div className="ui-grid-2">
              <Select
                label="Área"
                icon="map-pin"
                value={f.area}
                onChange={campo('area')}
                error={errores.area}
                disabled={!pendiente}
                options={[{ value: '', label: 'Elige un área' }, ...s.areas.map((a) => ({ value: String(a.num), label: a.nombre }))]}
              />
              <Select
                label="Rol"
                value={f.rol}
                onChange={campo('rol')}
                error={errores.rol}
                disabled={!pendiente}
                options={s.roles.map((r) => ({ value: r.codigo, label: r.nombre }))}
              />
            </div>
            <div className="ui-grid-2">
              <Input label="Nombre" value={f.nombre} onChange={campo('nombre')} error={errores.nombre} disabled={!pendiente} />
              <Input
                label="Primer apellido"
                value={f.primer_apellido}
                onChange={campo('primer_apellido')}
                error={errores.primer_apellido}
                disabled={!pendiente}
              />
            </div>
            <Input
              label="Segundo apellido (opcional)"
              value={f.segundo_apellido}
              onChange={campo('segundo_apellido')}
              disabled={!pendiente}
            />
            <Input label="Correo" type="email" icon="mail" value={s.correo} readOnly hint="Será su usuario para entrar." />
            {pendiente ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <Button variant="ghost" icon="user-x" disabled={enviando} onClick={rechazar}>
                  Rechazar
                </Button>
                <Button icon="user-check" disabled={enviando || s.correo_registrado} onClick={aprobar}>
                  {enviando ? 'Creando…' : 'Crear cuenta y enviar bienvenida'}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Link to={inicio} className="nc-btn nc-btn--md nc-btn--secondary">
                  {usuario?.rol === 'ADMINPLAT' ? 'Ir a Organizaciones' : 'Ir a Usuarios'}
                </Link>
              </div>
            )}
          </div>
        </Card>
      </div>
    </Pantalla>
  )
}
