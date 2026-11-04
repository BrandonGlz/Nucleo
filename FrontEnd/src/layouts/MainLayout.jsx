import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Avatar, Icon, Logo } from '../design-system/componentes/index.js'
import { AvisosProvider, useAvisos } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { modulos } from '../features'
import { limiteAlerta, nombreCompleto, ROL, tituloAlerta, valorAlerta } from '../utils/convertir'
import { haceCuanto, hora } from '../utils/formato'

const SECCIONES = ['Monitoreo', 'Análisis', 'Configuración']

// Alerta crítica pendiente más reciente: se ve en todas las pantallas, sobre la tarjeta del usuario.
function AlertaCritica() {
  const { pendientes } = useAvisos()
  const navegar = useNavigate()
  const criticas = pendientes.filter((a) => a.nivel === 'PELIGRO').sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1))
  const a = criticas[0]
  if (!a) return null
  return (
    <button
      type="button"
      className="ui-critica"
      role="alert"
      title={`${tituloAlerta(a)} · ${a.dispositivo_nombre} · ${valorAlerta(a)} (${limiteAlerta(a)}) · ${haceCuanto(a.fecha_hora)}`}
      onClick={() => navegar('/alertas')}
    >
      <span className="ui-critica__pulso">
        <Icon name="octagon-alert" size={16} />
        {criticas.length > 1 && <span className="ui-critica__num">{criticas.length}</span>}
      </span>
      <span className="ui-critica__texto">
        <strong>{tituloAlerta(a)}</strong>
        <span>
          {a.dispositivo_nombre} · {valorAlerta(a)} · {hora(a.fecha_hora)}
        </span>
      </span>
      <Icon name="chevron-right" size={16} />
    </button>
  )
}

function MenuLateral() {
  const { usuario, rol } = useSesion()
  const { pendientes } = useAvisos()
  const visibles = modulos.filter((m) => m.seccion && (!m.roles || m.roles.includes(rol)))
  return (
    <nav className="nc-sidebar" aria-label="Navegación principal">
      <div className="nc-sidebar__brand">
        <Logo size={32} inverse />
      </div>
      {SECCIONES.map((seccion) => {
        const items = visibles.filter((m) => m.seccion === seccion)
        if (!items.length) return null
        return (
          <div key={seccion} className="app__nav-group">
            <span className="nc-sidebar__section">{seccion}</span>
            <ul>
              {items.map((m) => (
                <li key={m.ruta}>
                  <NavLink to={m.ruta} className={({ isActive }) => `nc-navitem${isActive ? ' is-active' : ''}`}>
                    <Icon name={m.icono} size={20} />
                    <span>{m.titulo}</span>
                    {m.ruta === '/alertas' && pendientes.length > 0 && (
                      <span className="nc-navitem__count">{pendientes.length}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <div className="nc-sidebar__foot">
        <AlertaCritica />
        <div className="nc-sidebar__user">
          <Avatar name={nombreCompleto(usuario)} size={36} />
          <div>
            <strong>{nombreCompleto(usuario)}</strong>
            <span>{ROL[rol]}</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

// Marco de las pantallas con sesión: menú lateral y columna de contenido que llena la ventana.
export function MainLayout() {
  return (
    <AvisosProvider>
      <div className="app">
        <MenuLateral />
        <main className="app__main">
          <Outlet />
        </main>
      </div>
    </AvisosProvider>
  )
}
