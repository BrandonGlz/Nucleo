import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Card, IconCircle, Input, Tabs, Toggle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useAvisos } from '../../context/AvisosContext'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as auth from '../../services/auth'
import * as dispositivosApi from '../../services/dispositivos'
import * as organizacionesApi from '../../services/organizaciones'
import * as reportesApi from '../../services/reportes'
import { nombreCompleto, pagina, ROL, ROL_TONO } from '../../utils/convertir'
import { accesoCorto } from '../../utils/formato'

const TEMAS = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
]
const CLAVE_PREFS = 'nucleo.preferencias'
const PREFS = [
  ['criticas', 'Correo cuando haya una alerta crítica', true],
  ['advertencias', 'Correo con las advertencias', false],
  ['resumen', 'Resumen diario de mi área', true],
  ['sonido', 'Sonido en el navegador para alertas críticas', true],
]
const leerPrefs = () => {
  try {
    return { ...Object.fromEntries(PREFS.map(([k, , v]) => [k, v])), ...JSON.parse(localStorage.getItem(CLAVE_PREFS)) }
  } catch {
    return Object.fromEntries(PREFS.map(([k, , v]) => [k, v]))
  }
}

async function cargar(usuario) {
  // El operador no tiene acceso a reportes: no se piden sus programaciones
  const verReportes = usuario.rol !== 'OPER'
  const [d, a, p] = await Promise.all([
    dispositivosApi.lista(),
    organizacionesApi.areas(),
    verReportes ? reportesApi.programaciones().catch(() => []) : [],
  ])
  const dispositivos = pagina(d).filter((x) => !usuario.area || x.area === usuario.area)
  return {
    dispositivos,
    area: pagina(a).find((x) => x.num === usuario.area),
    programados: pagina(p).filter((x) => x.destinatarios.includes(usuario.num)).length,
  }
}

export function PerfilPage() {
  const { usuario, logout, tema, setTema } = useSesion()
  const { alertas } = useAvisos()
  const navegar = useNavigate()
  const { datos } = useDatos(() => cargar(usuario), [usuario?.num])
  const [prefs, setPrefs] = useState(leerPrefs)
  const [pass, setPass] = useState({ actual: '', nueva: '' })
  const [avisoPass, setAvisoPass] = useState(null)

  const nombre = nombreCompleto(usuario)
  const atendidas = alertas.filter((a) => a.atendida_por === usuario.num).length
  const area = datos?.area?.nombre ?? 'Todas las áreas'

  const cambiarPref = (k, v) => {
    const nuevo = { ...prefs, [k]: v }
    setPrefs(nuevo)
    try {
      localStorage.setItem(CLAVE_PREFS, JSON.stringify(nuevo))
    } catch {
      // Sin almacenamiento la preferencia dura hasta recargar.
    }
  }
  const cambiarPassword = async () => {
    setAvisoPass(null)
    try {
      await auth.cambiarPassword(pass.actual, pass.nueva)
      await logout()
      navegar('/acceso', { replace: true })
    } catch {
      setAvisoPass('Revisa tu contraseña actual; la nueva necesita al menos 8 caracteres.')
    }
  }
  const salir = async () => {
    await logout()
    navegar('/acceso', { replace: true })
  }

  return (
    <Pantalla
      eyebrow="Tu cuenta"
      titulo="Mi perfil"
      cifras={{
        principal: { etiqueta: 'Mi perfil', titulo: nombre, sub: `${ROL[usuario.rol]} · ${area} · ${usuario.correo}` },
        cifras: [
          { etiqueta: 'Dispositivos', valor: datos ? datos.dispositivos.length : '—', sub: usuario.area ? 'En tu área' : 'En la organización', tono: 'verde' },
          { etiqueta: 'Atendidas', valor: atendidas, sub: 'Alertas resueltas' },
          { etiqueta: 'Reportes', valor: datos ? datos.programados : '—', sub: 'Programados por correo' },
          { etiqueta: 'Último acceso', valor: accesoCorto(usuario.ultimo_acceso), sub: 'Este navegador' },
        ],
      }}
    >
      <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <Card className="nc-grow">
          <div className="ui-panel">
            <div className="nc-card__head" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Datos de la cuenta</h3>
                <p className="nc-card__sub">El administrador asigna tu rol, tu área y tu correo</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ padding: 4, borderRadius: 999, boxShadow: '0 0 0 3px var(--accent)' }}>
                <Avatar name={nombre} size={64} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <strong style={{ fontSize: 18, lineHeight: '24px' }}>{nombre}</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge tone={ROL_TONO[usuario.rol]}>{ROL[usuario.rol]}</Badge>
                  <Badge tone="neutral" icon="map-pin">
                    {area}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="ui-grid-2">
              <Input label="Nombre" value={nombre} readOnly hint="Lo cambia el administrador." />
              <Input label="Correo" type="email" icon="mail" value={usuario.correo} readOnly hint="Lo cambia el administrador." />
            </div>
            <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 15 }}>Contraseña</strong>
                <span className="ui-muted" style={{ fontSize: 13 }}>
                  Al cambiarla se cierra la sesión y tendrás que entrar de nuevo.
                </span>
              </div>
              <div className="ui-grid-2">
                <Input
                  label="Contraseña actual"
                  type="password"
                  autoComplete="current-password"
                  value={pass.actual}
                  onChange={(e) => setPass({ ...pass, actual: e.target.value })}
                  error={avisoPass ?? undefined}
                />
                <Input
                  label="Contraseña nueva"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={pass.nueva}
                  onChange={(e) => setPass({ ...pass, nueva: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" icon="settings" disabled={!pass.actual || !pass.nueva} onClick={cambiarPassword}>
                  Cambiar contraseña
                </Button>
              </div>
            </div>
          </div>
        </Card>
        <Card className="nc-grow">
          <div className="ui-panel">
            <div className="nc-card__head" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Preferencias</h3>
                <p className="nc-card__sub">Se guardan en este navegador</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <strong style={{ fontSize: 14 }}>Tema</strong>
                <span className="ui-muted" style={{ fontSize: 13 }}>
                  Por defecto sigue al sistema
                </span>
              </div>
              <Tabs items={TEMAS} value={tema} onChange={setTema} />
            </div>
            <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <span className="ui-eyebrow">Notificaciones</span>
              {PREFS.map(([k, label]) => (
                <Toggle key={k} label={label} checked={prefs[k]} onChange={(v) => cambiarPref(k, v)} />
              ))}
            </div>
            <div className="ui-separado" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="ui-eyebrow">Sesión</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'var(--surface-muted)' }}>
                <IconCircle name="smartphone" size="sm" />
                <div className="ui-titulo-fila" style={{ flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>Este navegador</strong>
                  <span style={{ fontSize: 12 }}>La sesión caduca tras 7 días sin uso</span>
                </div>
              </div>
              <div>
                <Button variant="secondary" icon="log-out" onClick={salir}>
                  Cerrar sesión
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Pantalla>
  )
}
