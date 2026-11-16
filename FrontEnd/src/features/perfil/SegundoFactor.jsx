import { useState } from 'react'
import { Alert, Badge, Button, Card, Input } from '../../design-system/componentes/index.js'
import { Modal } from '../../components/Modal'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as auth from '../../services/auth'

const mensaje = (err, porDefecto) =>
  err?.datos?.codigo?.[0] || err?.datos?.password?.[0] || err?.datos?.detail || porDefecto

// Códigos de recuperación recién generados: solo se muestran esta vez.
function Codigos({ codigos, cerrar }) {
  const [copiados, setCopiados] = useState(false)
  const copiar = () =>
    navigator.clipboard
      ?.writeText(codigos.join('\n'))
      .then(() => setCopiados(true))
      .catch(() => {})
  return (
    <Modal
      titulo="Guarda tus códigos de recuperación"
      sub="Cada uno sirve una sola vez para entrar si no tienes el teléfono. No se volverán a mostrar."
      cerrar={cerrar}
      acciones={
        <Button icon="circle-check" onClick={cerrar}>
          Ya los guardé
        </Button>
      }
    >
      <ul className="ui-codigos">
        {codigos.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div>
        <Button variant="secondary" size="sm" icon="copy" onClick={copiar}>
          {copiados ? 'Copiados' : 'Copiar todos'}
        </Button>
      </div>
    </Modal>
  )
}

// Pide el código actual (y la contraseña al desactivar) antes de una acción sensible.
function Confirmar({ titulo, sub, conPassword, boton, peligro, accion, cerrar }) {
  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState()
  const [enviando, setEnviando] = useState(false)
  const enviar = async () => {
    setEnviando(true)
    setError(undefined)
    try {
      await accion({ codigo: codigo.trim(), password })
    } catch (err) {
      setError(mensaje(err, 'No se pudo completar. Revisa el código.'))
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={titulo}
      sub={sub}
      cerrar={cerrar}
      acciones={
        <Button variant={peligro ? 'destructive' : 'primary'} disabled={enviando || !codigo || (conPassword && !password)} onClick={enviar}>
          {boton}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {conPassword && (
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <Input
          label="Código de tu app (o de recuperación)"
          icon="shield-check"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={codigo}
          error={error}
          onChange={(e) => setCodigo(e.target.value)}
        />
      </div>
    </Modal>
  )
}

// Verificación en dos pasos (TOTP) en Mi perfil: configurar con QR, activar, códigos y desactivar.
export function SegundoFactor() {
  const { marcarSegundoFactor, segundoFactorPendiente } = useSesion()
  const { estado, datos, reintentar } = useDatos(() => auth.segundoFactor(), [])
  const [config, setConfig] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState()
  const [codigos, setCodigos] = useState(null)
  const [modal, setModal] = useState(null)

  const empezar = async () => {
    setError(undefined)
    try {
      setConfig(await auth.configurarSegundoFactor())
    } catch (err) {
      setError(mensaje(err, 'No se pudo generar el código QR.'))
    }
  }
  const activar = async () => {
    setError(undefined)
    try {
      const r = await auth.activarSegundoFactor(codigo.trim())
      setConfig(null)
      setCodigo('')
      setCodigos(r.codigos_recuperacion)
      marcarSegundoFactor(false)
      reintentar()
    } catch (err) {
      setError(mensaje(err, 'El código no es válido. Revisa la hora del teléfono.'))
    }
  }

  const activo = datos?.activo
  return (
    <Card className="nc-grow" id="seguridad">
      <div className="ui-panel">
        <div className="nc-card__head" style={{ margin: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="nc-card__title">Verificación en dos pasos</h3>
            <p className="nc-card__sub">Además de la contraseña, un código de tu teléfono al entrar</p>
          </div>
          {estado === 'listo' && (
            <Badge tone={activo ? 'success' : 'offline'} dot>
              {activo ? 'Activa' : 'Inactiva'}
            </Badge>
          )}
        </div>
        {(segundoFactorPendiente || (datos?.obligatorio && !activo)) && (
          <Alert level="warning" title="Tu rol exige la verificación en dos pasos">
            Configúrala para seguir usando Núcleo. Mientras tanto solo puedes abrir tu perfil.
          </Alert>
        )}
        {estado === 'error' && (
          <Alert level="warning" title="No pudimos consultar la verificación en dos pasos">
            Intenta de nuevo en unos minutos.
          </Alert>
        )}
        {estado === 'listo' && activo && (
          <>
            <p className="ui-muted" style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
              Al entrar te pediremos el código de tu app de autenticación. Te quedan{' '}
              <strong>{datos.codigos_restantes}</strong> códigos de recuperación.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="secondary" icon="key-round" onClick={() => setModal('codigos')}>
                Nuevos códigos de recuperación
              </Button>
              {!datos.obligatorio && (
                <Button variant="ghost" icon="x" onClick={() => setModal('desactivar')}>
                  Desactivar
                </Button>
              )}
            </div>
          </>
        )}
        {estado === 'listo' && !activo && !config && (
          <>
            <p className="ui-muted" style={{ margin: 0, fontSize: 14, lineHeight: '22px' }}>
              Usa una app como Google Authenticator o Microsoft Authenticator. Aunque alguien conozca tu
              contraseña, no podrá entrar sin tu teléfono.
            </p>
            {error && <span className="ui-aviso ui-aviso--danger">{error}</span>}
            <div>
              <Button icon="shield-check" onClick={empezar}>
                Configurar
              </Button>
            </div>
          </>
        )}
        {config && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {/* SVG generado por la API de Núcleo (reportlab) a partir del URI otpauth */}
            <div className="ui-qr" dangerouslySetInnerHTML={{ __html: config.qr_svg }} />
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 14 }}>
                1. Escanea el código con tu app. Si no puedes, escribe esta clave:
              </span>
              <span className="ui-secreto">{config.secreto}</span>
              <Input
                label="2. Escribe el código de 6 dígitos que muestra la app"
                icon="shield-check"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={codigo}
                error={error}
                onChange={(e) => setCodigo(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button icon="circle-check" disabled={codigo.trim().length < 6} onClick={activar}>
                  Activar
                </Button>
                <Button variant="ghost" onClick={() => setConfig(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      {codigos && <Codigos codigos={codigos} cerrar={() => setCodigos(null)} />}
      {modal === 'codigos' && (
        <Confirmar
          titulo="Nuevos códigos de recuperación"
          sub="Los códigos anteriores dejarán de servir."
          boton="Generar"
          cerrar={() => setModal(null)}
          accion={async ({ codigo: c }) => {
            const r = await auth.nuevosCodigos(c)
            setModal(null)
            setCodigos(r.codigos_recuperacion)
            reintentar()
          }}
        />
      )}
      {modal === 'desactivar' && (
        <Confirmar
          titulo="Desactivar la verificación en dos pasos"
          sub="Tu cuenta quedará protegida solo con la contraseña."
          boton="Desactivar"
          peligro
          conPassword
          cerrar={() => setModal(null)}
          accion={async ({ codigo: c, password }) => {
            await auth.desactivarSegundoFactor(password, c)
            setModal(null)
            reintentar()
          }}
        />
      )}
    </Card>
  )
}
