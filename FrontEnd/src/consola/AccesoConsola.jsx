import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, Logo, LogoMark } from '../design-system/componentes/index.js'
import { useSesion } from '../context/SesionContext'

// Acceso a la consola: el mismo diseño que el inicio de sesión de la web, solo para el superusuario.
export function AccesoConsola() {
  const { login, logout } = useSesion()
  const navegar = useNavigate()
  const location = useLocation()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    if (!correo || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setError(undefined)
    setEnviando(true)
    try {
      const u = await login(correo, password)
      if (u?.rol !== 'ADMINPLAT') {
        await logout()
        setError('Esta consola es solo para el superusuario de Nico AI.')
        setEnviando(false)
        return
      }
      navegar(location.state?.desde || '/', { replace: true })
    } catch (err) {
      setError(
        err.status === 400 || err.status === 401
          ? 'Correo o contraseña incorrectos. Revisa e intenta de nuevo.'
          : 'No pudimos conectar con Núcleo. Intenta de nuevo en unos minutos.',
      )
      setEnviando(false)
    }
  }

  return (
    <div className="acceso">
      <div className="acceso__anillo" aria-hidden="true">
        <LogoMark tone="verde" size={500} />
      </div>
      <div className="acceso__lema">
        <Logo size={48} inverse />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="ui-eyebrow" style={{ color: '#9DA39E' }}>
            Consola de Nico AI
          </span>
          <h2>Enseña, ajusta y cuida al agente de Núcleo.</h2>
        </div>
      </div>
      <div className="acceso__panel">
        <form className="acceso__form" onSubmit={enviar} noValidate>
          <span className="acceso__logo-movil">
            <Logo size={40} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1>Consola de Nico AI</h1>
            <p style={{ margin: 0, fontSize: 16, lineHeight: '26px', color: 'var(--text-secondary)' }}>
              Entra con la cuenta de superusuario.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Input
              label="Correo"
              type="email"
              icon="mail"
              autoComplete="username"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
            <Input
              label="Contraseña"
              type="password"
              icon="lock"
              autoComplete="current-password"
              value={password}
              error={error}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" icon="log-in" block disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar a la consola'}
          </Button>
        </form>
        <span className="acceso__pie">Núcleo · Consola de Nico AI</span>
      </div>
    </div>
  )
}
