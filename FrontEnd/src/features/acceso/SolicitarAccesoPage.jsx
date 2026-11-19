import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Logo, Select } from '../../design-system/componentes/index.js'
import nicoAsoma from '../../assets/nico/nico-asoma.webp'
import * as solicitudes from '../../services/solicitudes'

const VACIO = {
  organizacion: '',
  area: '',
  nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  correo: '',
  sitio: '',
}

// Sin sesión: la persona pide una cuenta para su organización y área. Nico avisa por correo a los
// administradores, que la dan de alta desde /solicitudes/<num>. Usa el marco de la pantalla de acceso.
export function SolicitarAccesoPage() {
  const [orgs, setOrgs] = useState(null)
  const [f, setF] = useState(VACIO)
  const [errores, setErrores] = useState({})
  const [estado, setEstado] = useState('inicio')
  const [aviso, setAviso] = useState()

  useEffect(() => {
    solicitudes
      .opciones()
      .then(setOrgs)
      .catch(() => {
        setOrgs([])
        setAviso('No pudimos cargar las organizaciones. Intenta de nuevo en unos minutos.')
      })
  }, [])

  const org = orgs?.find((o) => String(o.num) === f.organizacion)
  const campo = (k) => (e) => {
    const valor = e.target.value
    setF((prev) => ({
      ...prev,
      [k]: valor,
      ...(k === 'organizacion' ? { area: '' } : {}),
    }))
    setErrores((prev) => ({ ...prev, [k]: undefined }))
  }

  const validar = () => {
    const e = {}
    if (!f.organizacion) e.organizacion = 'Elige tu organización.'
    if (!f.area) e.area = 'Elige tu área.'
    if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre.'
    if (!f.primer_apellido.trim()) e.primer_apellido = 'Escribe tu primer apellido.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) e.correo = 'Escribe un correo válido.'
    setErrores(e)
    return !Object.keys(e).length
  }

  const enviar = async (e) => {
    e.preventDefault()
    setAviso(undefined)
    if (!validar()) return
    setEstado('enviando')
    try {
      await solicitudes.solicitar({
        ...f,
        organizacion: Number(f.organizacion),
        area: Number(f.area),
        correo: f.correo.trim(),
      })
      setEstado('enviada')
    } catch (err) {
      setEstado('inicio')
      if (err.status === 429) setAviso('Ya enviaste varias solicitudes. Espera una hora e intenta de nuevo.')
      else if (err.status === 400 && err.datos) {
        setErrores(Object.fromEntries(Object.entries(err.datos).map(([k, v]) => [k, [].concat(v).join(' ')])))
      } else setAviso('No pudimos conectar con Núcleo. Intenta de nuevo en unos minutos.')
    }
  }

  return (
    <div className="acceso">
      <div className="acceso__anillo" aria-hidden="true">
        <img className="acceso__nico" src={nicoAsoma} alt="" />
      </div>
      <div className="acceso__lema">
        <Logo size={48} inverse />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="ui-eyebrow" style={{ color: '#9DA39E' }}>
            Plataforma IoT
          </span>
          <h2>Temperatura, humedad y calidad del aire, claras y bajo control.</h2>
        </div>
      </div>
      <div className="acceso__panel">
        {estado === 'enviada' ? (
          <div className="acceso__form">
            <Encabezado
              titulo="Solicitud enviada"
              texto={`Nico le avisó al administrador de ${org?.nombre ?? 'tu organización'}. Cuando apruebe tu cuenta, te llegará a ${f.correo.trim()} un correo de bienvenida con tus credenciales.`}
            />
            <Link to="/acceso" className="nc-btn nc-btn--lg nc-btn--block nc-btn--secondary">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form className="acceso__form" onSubmit={enviar} noValidate>
            <Encabezado
              titulo="Solicita tu acceso"
              texto="Elige tu organización y tu área y escribe tus datos. El administrador revisará tu solicitud."
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Select
                label="Organización"
                icon="building-2"
                value={f.organizacion}
                onChange={campo('organizacion')}
                error={errores.organizacion}
                disabled={!orgs}
                options={[
                  {
                    value: '',
                    label: orgs ? 'Elige una organización' : 'Cargando…',
                  },
                  ...(orgs ?? []).map((o) => ({
                    value: String(o.num),
                    label: o.nombre,
                  })),
                ]}
              />
              <Select
                label="Área"
                icon="map-pin"
                value={f.area}
                onChange={campo('area')}
                error={errores.area}
                disabled={!org}
                options={[
                  {
                    value: '',
                    label: org ? 'Elige un área' : 'Primero la organización',
                  },
                  ...(org?.areas ?? []).map((a) => ({
                    value: String(a.num),
                    label: a.nombre,
                  })),
                ]}
              />
              <div className="ui-grid-2">
                <Input
                  label="Nombre"
                  autoComplete="given-name"
                  value={f.nombre}
                  onChange={campo('nombre')}
                  error={errores.nombre}
                />
                <Input
                  label="Primer apellido"
                  autoComplete="family-name"
                  value={f.primer_apellido}
                  onChange={campo('primer_apellido')}
                  error={errores.primer_apellido}
                />
              </div>
              <Input
                label="Segundo apellido (opcional)"
                value={f.segundo_apellido}
                onChange={campo('segundo_apellido')}
                error={errores.segundo_apellido}
              />
              <Input
                label="Correo"
                type="email"
                icon="mail"
                autoComplete="email"
                value={f.correo}
                onChange={campo('correo')}
                error={errores.correo}
              />
              {/* Campo trampa para bots: oculto a las personas y a los lectores de pantalla. */}
              <input
                type="text"
                name="sitio"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={f.sitio}
                onChange={campo('sitio')}
                style={{
                  position: 'absolute',
                  left: -9999,
                  width: 1,
                  height: 1,
                  opacity: 0,
                }}
              />
            </div>
            {aviso && (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
                {aviso}
              </p>
            )}
            <Button type="submit" size="lg" icon="send" block disabled={estado === 'enviando' || !orgs}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
            <Link to="/acceso" style={{ fontSize: 14, fontWeight: 600 }}>
              Volver a iniciar sesión
            </Link>
          </form>
        )}
        <span className="acceso__pie">Núcleo · Monitoreo ambiental</span>
      </div>
    </div>
  )
}

function Encabezado({ titulo, texto }) {
  return (
    <>
      <span className="acceso__logo-movil">
        <Logo size={40} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1>{titulo}</h1>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            lineHeight: '26px',
            color: 'var(--text-secondary)',
          }}
        >
          {texto}
        </p>
      </div>
    </>
  )
}
