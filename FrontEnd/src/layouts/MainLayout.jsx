import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Avatar, Icon, Logo, LogoApp } from '../design-system/componentes/index.js'
import { AgenteProvider } from '../context/AgenteContext'
import { AvisosProvider, useAvisos } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { useLatido } from '../hooks/useLatido'
import { modulos, puedeVer } from '../features'
import { limiteAlerta, nombreCompleto, ROL, tituloAlerta, valorAlerta } from '../utils/convertir'
import { haceCuanto, hora } from '../utils/formato'

const SECCIONES = ['Plataforma', 'Monitoreo', 'Análisis', 'Áreas', 'Configuración']

// Menú compacto (solo íconos): se alterna con el logo y se recuerda en este navegador.
const CLAVE_COMPACTO = 'nucleo.menu-compacto'
function leerCompacto() {
  try {
    return localStorage.getItem(CLAVE_COMPACTO) === '1'
  } catch {
    return false
  }
}
function guardarCompacto(v) {
  try {
    localStorage.setItem(CLAVE_COMPACTO, v ? '1' : '0')
  } catch {
    // sin almacenamiento (modo privado): solo dura esta visita
  }
}

// Alerta crítica pendiente más reciente: se ve en todas las pantallas, sobre la tarjeta del usuario.
function AlertaCritica({ compacto }) {
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
      aria-label={compacto ? `${tituloAlerta(a)} · ${a.dispositivo_nombre}` : undefined}
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
  const [compacto, setCompacto] = useState(leerCompacto)
  const visibles = modulos.filter((m) => m.seccion && puedeVer(m, rol))
  const alternar = () => {
    guardarCompacto(!compacto)
    setCompacto(!compacto)
  }
  return (
    <nav className={`nc-sidebar${compacto ? ' is-compacto' : ''}`} aria-label="Navegación principal">
      <button
        type="button"
        className="nc-sidebar__brand ui-menu-logo"
        onClick={alternar}
        aria-expanded={!compacto}
        title={compacto ? 'Expandir menú' : 'Contraer menú'}
      >
        {compacto ? <LogoApp size={48} label="Núcleo" /> : <Logo size={32} inverse />}
      </button>
      {SECCIONES.map((seccion) => {
        const items = visibles.filter((m) => m.seccion === seccion)
        if (!items.length) return null
        return (
          <div key={seccion} className="app__nav-group">
            <span className="nc-sidebar__section">{compacto ? '' : seccion}</span>
            <ul>
              {items.map((m) => (
                <li key={m.ruta}>
                  <NavLink
                    to={m.ruta}
                    title={compacto ? m.titulo : undefined}
                    aria-label={compacto ? m.titulo : undefined}
                    className={({ isActive }) => `nc-navitem${isActive ? ' is-active' : ''}`}
                  >
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
        <AlertaCritica compacto={compacto} />
        <div className="nc-sidebar__user" title={compacto ? `${nombreCompleto(usuario)} · ${ROL[rol]}` : undefined}>
          <Avatar name={nombreCompleto(usuario)} size={36} />
          <div>
            <strong>{nombreCompleto(usuario)}</strong>
            <span>{ROL[rol]}</span>
          </div>
        </div>
        <Version />
      </div>
    </nav>
  )
}

// Versión de la web desplegada (la fija vite.config.js al compilar en cada deploy).
function Version() {
  const { VITE_VERSION: version, VITE_BUILD: build } = import.meta.env
  if (!version) return null
  return <p className="ui-version">{`v${version}${build ? ` · build ${build}` : ''}`}</p>
}

// Marco de las pantallas con sesión: menú lateral y columna de contenido que llena la ventana.
export function MainLayout() {
  useLatido()
  return (
    <AvisosProvider>
      <AgenteProvider>
        <div className="app">
          <MenuLateral />
          <main className="app__main">
            <Outlet />
          </main>
        </div>
      </AgenteProvider>
    </AvisosProvider>
  )
}
