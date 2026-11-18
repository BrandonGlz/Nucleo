import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, Logo } from '../../design-system/componentes/index.js'
import nicoAsoma from '../../assets/nico/nico-asoma.webp'
import * as auth from '../../services/auth'

// Sin sesión: /recuperar pide el enlace por correo y /restablecer?uid&token (el enlace del correo)
// guarda la contraseña nueva. Usa el mismo marco que la pantalla de acceso.
export function RecuperarPage() {
  const [busqueda] = useSearchParams()
  const uid = busqueda.get('uid')
  const token = busqueda.get('token')
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
        {uid && token ? <Restablecer uid={uid} token={token} /> : <Pedir />}
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
        <p style={{ margin: 0, fontSize: 16, lineHeight: '26px', color: 'var(--text-secondary)' }}>{texto}</p>
      </div>
    </>
  )
}

function Pedir() {
  const [correo, setCorreo] = useState('')
  const [estado, setEstado] = useState('inicio')
  const [error, setError] = useState()

  const enviar = async (e) => {
    e.preventDefault()
    if (!correo.includes('@')) {
      setError('Escribe el correo de tu cuenta.')
      return
    }
    setError(undefined)
    setEstado('enviando')
    try {
      await auth.recuperar(correo.trim())
      setEstado('enviado')
    } catch (err) {
      setError(
        err.status === 429
          ? 'Ya pediste varios enlaces. Espera una hora e intenta de nuevo.'
          : 'No pudimos conectar con Núcleo. Intenta de nuevo en unos minutos.',
      )
      setEstado('inicio')
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="acceso__form">
        <Encabezado
          titulo="Revisa tu correo"
          texto={`Si ${correo} tiene una cuenta activa, te llegará un enlace para elegir una contraseña nueva. Vale una sola vez y caduca en una hora.`}
        />
        <Link to="/acceso" className="nc-btn nc-btn--lg nc-btn--block nc-btn--secondary">
          Volver a iniciar sesión
        </Link>
      </div>
    )
  }
  return (
    <form className="acceso__form" onSubmit={enviar} noValidate>
      <Encabezado
        titulo="Recupera tu contraseña"
        texto="Escribe el correo de tu cuenta y te mandaremos un enlace para elegir una contraseña nueva."
      />
      <Input
        label="Correo"
        type="email"
        icon="mail"
        autoComplete="username"
        value={correo}
        error={error}
        onChange={(e) => setCorreo(e.target.value)}
      />
      <Button type="submit" size="lg" icon="send" block disabled={estado === 'enviando'}>
        {estado === 'enviando' ? 'Enviando…' : 'Enviar enlace'}
      </Button>
      <Link to="/acceso" style={{ fontSize: 14, fontWeight: 600 }}>
        Volver a iniciar sesión
      </Link>
    </form>
  )
}

function Restablecer({ uid, token }) {
  const navegar = useNavigate()
  const [password, setPassword] = useState('')
  const [repetida, setRepetida] = useState('')
  const [error, setError] = useState()
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña necesita al menos 8 caracteres.')
      return
    }
    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setError(undefined)
    setEnviando(true)
    try {
      await auth.restablecer(uid, token, password)
      setListo(true)
    } catch (err) {
      setError(
        err.datos?.password_nueva?.join(' ') ||
          err.datos?.detail ||
          'No pudimos guardar la contraseña. Intenta de nuevo.',
      )
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <div className="acceso__form">
        <Encabezado
          titulo="Contraseña actualizada"
          texto="Ya puedes entrar con tu contraseña nueva. Las sesiones que tenías abiertas se cerraron."
        />
        <Button size="lg" icon="log-in" block onClick={() => navegar('/acceso', { replace: true })}>
          Iniciar sesión
        </Button>
      </div>
    )
  }
  return (
    <form className="acceso__form" onSubmit={enviar} noValidate>
      <Encabezado titulo="Elige una contraseña nueva" texto="Usa al menos 8 caracteres y evita contraseñas comunes." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Input
          label="Contraseña nueva"
          type="password"
          icon="lock"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Repite la contraseña"
          type="password"
          icon="lock"
          autoComplete="new-password"
          value={repetida}
          error={error}
          onChange={(e) => setRepetida(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" icon="key-round" block disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
      <Link to="/recuperar" style={{ fontSize: 14, fontWeight: 600 }}>
        Pedir un enlace nuevo
      </Link>
    </form>
  )
}
