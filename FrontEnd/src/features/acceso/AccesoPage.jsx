import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, Logo, LogoMark } from '../../design-system/componentes/index.js'
import { useSesion } from '../../context/SesionContext'

// Inicio de sesión a pantalla completa: lema sobre fondo oscuro y formulario en el panel claro.
export function AccesoPage() {
  const { login } = useSesion()
  const navegar = useNavigate()
  const location = useLocation()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError(undefined)
    if (!correo || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setEnviando(true)
    try {
      await login(correo, password)
      navegar(location.state?.desde || '/panel', { replace: true })
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
      <div className="acceso__anillo" />
      <div className="acceso__marca">
        <LogoMark tone="lima" size={560} />
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
        <form className="acceso__form" onSubmit={enviar} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1>Inicia sesión</h1>
            <p style={{ margin: 0, fontSize: 16, lineHeight: '26px', color: 'var(--text-secondary)' }}>
              Entra con la cuenta que te dio el administrador de tu organización.
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
              autoComplete="current-password"
              value={password}
              error={error}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a href="mailto:" style={{ fontSize: 14, fontWeight: 600 }}>
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </div>
          <Button type="submit" size="lg" icon="log-in" block disabled={enviando}>
            {enviando ? 'Entrando…' : 'Iniciar sesión'}
          </Button>
          <p style={{ margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--text-muted)' }}>
            ¿Necesitas acceso? Pídelo al administrador de tu organización.
          </p>
        </form>
        <span className="acceso__pie">Núcleo · Monitoreo ambiental</span>
      </div>
    </div>
  )
}
