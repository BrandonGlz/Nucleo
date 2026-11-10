import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Badge, Button, Icon, IconButton, IconCircle, Tabs } from '../design-system/componentes/index.js'
import { useAvisos } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { esHoy, hora } from '../utils/formato'
import { nombreCompleto } from '../utils/convertir'

const TEMAS = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
]
const NOTIFICACIONES_MENU = 5
const fechaCorta = (iso) =>
  esHoy(iso) ? hora(iso) : new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

// Encabezado de cada pantalla (clases nc-header del sistema de diseño) con los menús de la
// campana y del avatar. Los menús se cierran al hacer clic fuera o con Escape.
export function Encabezado({ eyebrow, titulo, acciones }) {
  const [menu, setMenu] = useState(null)
  const ref = useRef(null)
  const navegar = useNavigate()
  const { usuario, rol, logout, temaAplicado, setTema } = useSesion()
  // El administrador de plataforma no tiene alertas, notificaciones ni perfil de organización.
  const plataforma = rol === 'ADMINPLAT'
  const { notificaciones, noLeidas, marcarLeidas } = useAvisos()

  useEffect(() => {
    if (!menu) return undefined
    const fuera = (e) => ref.current && !ref.current.contains(e.target) && setMenu(null)
    const tecla = (e) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [menu])

  const ir = (ruta) => {
    setMenu(null)
    navegar(ruta)
  }
  const salir = async () => {
    setMenu(null)
    await logout()
    navegar('/acceso', { replace: true })
  }
  const recientes = notificaciones.slice(0, NOTIFICACIONES_MENU)
  const nombre = nombreCompleto(usuario)

  return (
    <div ref={ref}>
      <header className="nc-header">
        <div className="nc-header__titles">
          {eyebrow && <span className="nc-header__eyebrow">{eyebrow}</span>}
          <h1 className="nc-header__title">{titulo}</h1>
        </div>
        <div className="nc-header__actions">
          {acciones}
          {!plataforma && (
            <IconButton
              icon="bell"
              label="Notificaciones"
              badge={noLeidas || undefined}
              aria-expanded={menu === 'notif'}
              onClick={() => setMenu(menu === 'notif' ? null : 'notif')}
            />
          )}
          <button
            type="button"
            className="ui-avatar-btn"
            aria-label="Menú de tu cuenta"
            aria-expanded={menu === 'usuario'}
            onClick={() => setMenu(menu === 'usuario' ? null : 'usuario')}
          >
            <Avatar name={nombre} size={44} />
          </button>
        </div>
      </header>

      {menu === 'notif' && (
        <div className="ui-popover ui-popover--notif" role="dialog" aria-label="Notificaciones">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 8px' }}>
            <strong style={{ fontSize: 17, lineHeight: '24px' }}>Notificaciones</strong>
            {noLeidas > 0 && <Badge tone="danger">{noLeidas} sin leer</Badge>}
            <div style={{ flex: 1 }} />
            {noLeidas > 0 && (
              <button type="button" className="ui-link" onClick={() => marcarLeidas()}>
                Marcar como leídas
              </button>
            )}
          </div>
          <span className="ui-eyebrow" style={{ padding: '8px 12px 4px' }}>
            Recientes
          </span>
          {recientes.length === 0 && (
            <span className="ui-muted" style={{ padding: '8px 12px 12px', fontSize: 14 }}>
              Sin notificaciones.
            </span>
          )}
          {recientes.map((n) => (
            <button
              key={n.num}
              type="button"
              className={`ui-item ui-item--boton${n.leida ? '' : ' is-unread'}`}
              onClick={() => {
                marcarLeidas([n.num])
                ir('/alertas')
              }}
            >
              <IconCircle name={n.icon} tone={n.tone} size="sm" />
              <div className="ui-titulo-fila" style={{ flex: 1 }}>
                <strong style={{ fontSize: 14, lineHeight: '20px' }}>{n.titulo}</strong>
                <span style={{ fontSize: 12, lineHeight: '18px' }}>{n.meta}</span>
              </div>
              <span className="ui-hora" style={{ fontSize: 12 }}>
                {fechaCorta(n.fecha)}
              </span>
              <span className="ui-punto" />
            </button>
          ))}
          <div style={{ padding: '8px 4px 4px', marginTop: 4, borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" icon="bell" block onClick={() => ir('/notificaciones')}>
              Ver todas las notificaciones
            </Button>
          </div>
        </div>
      )}

      {menu === 'usuario' && (
        <div className="ui-popover ui-popover--usuario" role="menu" aria-label="Tu cuenta">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 14px' }}>
            <Avatar name={nombre} size={44} />
            <div className="ui-titulo-fila">
              <strong>{nombre}</strong>
              <span className="ui-popover__correo">{usuario?.correo}</span>
            </div>
          </div>
          <div className="ui-divisor" style={{ marginTop: 0 }} />
          {!plataforma && (
            <>
              <button type="button" role="menuitem" className="ui-menuitem" onClick={() => ir('/perfil')}>
                <Icon name="user" size={18} />
                Ver perfil
              </button>
              <button type="button" role="menuitem" className="ui-menuitem" onClick={() => ir('/notificaciones')}>
                <Icon name="bell" size={18} />
                Notificaciones
                {noLeidas > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>
                    {noLeidas}
                  </span>
                )}
              </button>
            </>
          )}
          <div className="ui-menuitem" style={{ justifyContent: 'space-between', cursor: 'default' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="settings" size={18} />
              Tema
            </span>
            <Tabs items={TEMAS} value={temaAplicado} onChange={setTema} />
          </div>
          <div className="ui-divisor" />
          <button type="button" role="menuitem" className="ui-menuitem ui-menuitem--peligro" onClick={salir}>
            <Icon name="log-out" size={18} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
