import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Icon, Input, Logo, LogoMark } from '../../design-system/componentes/index.js'
import { useSesion } from '../../context/SesionContext'
import { inicioDe } from '../index'
import { cuentasDemo, PASSWORD_DEMO } from '../../services/auth'
import { USAR_MOCKS } from '../../services/config'
import { nombreCompleto, ROL } from '../../utils/convertir'

const ORDEN_ROL = ['ADMIN', 'SUPER', 'ANALISTA', 'OPER']
// Subdominio que entrega el APK más reciente (lo publica deploy/compilar_apk.sh)
const DESCARGA_APP = 'https://app.bynucleo.com'

// En modo simulado: una tarjeta por cuenta para entrar con un clic y revisar cada rol.
function CuentasDemo({ entrar, enviando }) {
  const cuentas = cuentasDemo().sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol))
  if (!cuentas.length) return null
  return (
    <div className="acceso__demo">
      <span className="ui-eyebrow">
        Cuentas de prueba · {USAR_MOCKS ? 'cualquier contraseña' : `contraseña ${PASSWORD_DEMO}`}
      </span>
      <div className="acceso__demo-lista">
        {cuentas.map((u) => (
          <button
            key={u.num}
            type="button"
            className="acceso__demo-cuenta"
            disabled={enviando}
            title={u.correo}
            onClick={() => entrar(u.correo)}
          >
            <Avatar name={nombreCompleto(u)} size={28} />
            <span>
              <strong>{nombreCompleto(u)}</strong>
              <small>
                {ROL[u.rol]}
                {u.estado_usuario !== 'ACT' ? ' · inactiva' : ''}
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Inicio de sesión a pantalla completa: lema sobre fondo oscuro y formulario en el panel claro.
export function AccesoPage() {
  const { login } = useSesion()
  const navegar = useNavigate()
  const location = useLocation()
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [enviando, setEnviando] = useState(false)

  const entrar = async (c, p) => {
    setError(undefined)
    setEnviando(true)
    try {
      const u = await login(c, p)
      navegar(location.state?.desde || inicioDe(u?.rol), { replace: true })
    } catch (err) {
      setError(
        err.status === 400 || err.status === 401
          ? 'Correo o contraseña incorrectos. Revisa e intenta de nuevo.'
          : err.status === 403
            ? 'Tu cuenta está inactiva. Pide al administrador que la active.'
            : 'No pudimos conectar con Núcleo. Intenta de nuevo en unos minutos.',
      )
      setEnviando(false)
    }
  }
  const enviar = (e) => {
    e.preventDefault()
    if (!correo || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    entrar(correo, password)
  }
  const entrarDemo = (c) => {
    setCorreo(c)
    setPassword(PASSWORD_DEMO)
    entrar(c, PASSWORD_DEMO)
  }

  return (
    <div className="acceso">
      {/* Anillo con el ícono, centrado en el borde del panel: el panel tapa la mitad derecha */}
      <div className="acceso__anillo" aria-hidden="true">
        <LogoMark tone="verde" size={500} />
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
          <span className="acceso__logo-movil">
            <Logo size={40} />
          </span>
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
              icon="lock"
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
          <div className="acceso__app">
            <p>¿Prefieres el celular? Descarga la app móvil de Núcleo para Android.</p>
            <a
              className="nc-btn nc-btn--secondary nc-btn--md nc-btn--block"
              href={DESCARGA_APP}
              rel="noopener"
            >
              <Icon name="smartphone" size={18} />
              <span>Descargar la app móvil</span>
            </a>
          </div>
          <CuentasDemo entrar={entrarDemo} enviando={enviando} />
        </form>
        <span className="acceso__pie">Núcleo · Monitoreo ambiental</span>
      </div>
    </div>
  )
}
