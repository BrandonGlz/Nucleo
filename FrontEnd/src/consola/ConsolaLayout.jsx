import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Avatar, Icon, Logo, LogoApp } from '../design-system/componentes/index.js'
import { AvisosProvider } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { nombreCompleto } from '../utils/convertir'
import { GRUPOS, SECCIONES } from './secciones'

// Mismo marco que la web (menú lateral oscuro contraíble con el logo) con las secciones de la consola.
const CLAVE_COMPACTO = 'nucleo.consola.menu-compacto'
function leerCompacto() {
  try {
    return localStorage.getItem(CLAVE_COMPACTO) === '1'
  } catch {
    return false
  }
}

function MenuConsola() {
  const { usuario } = useSesion()
  const [compacto, setCompacto] = useState(leerCompacto)
  const alternar = () => {
    try {
      localStorage.setItem(CLAVE_COMPACTO, compacto ? '0' : '1')
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
    setCompacto(!compacto)
  }
  return (
    <nav className={`nc-sidebar${compacto ? ' is-compacto' : ''}`} aria-label="Navegación de la consola">
      <button
        type="button"
        className="nc-sidebar__brand ui-menu-logo"
        onClick={alternar}
        aria-expanded={!compacto}
        title={compacto ? 'Expandir menú' : 'Contraer menú'}
      >
        {compacto ? <LogoApp size={48} label="Núcleo" /> : <Logo size={32} inverse />}
      </button>
      {!compacto && <span className="ui-consola-marca">Consola de Nico AI</span>}
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="app__nav-group">
          <span className="nc-sidebar__section">{compacto ? '' : grupo}</span>
          <ul>
            {SECCIONES.filter((s) => s.grupo === grupo).map((s) => (
              <li key={s.ruta}>
                <NavLink
                  to={s.ruta}
                  end={s.ruta === '/'}
                  title={compacto ? s.titulo : undefined}
                  aria-label={compacto ? s.titulo : undefined}
                  className={({ isActive }) => `nc-navitem${isActive ? ' is-active' : ''}`}
                >
                  <Icon name={s.icono} size={20} />
                  <span>{s.titulo}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="nc-sidebar__foot">
        <div className="nc-sidebar__user" title={compacto ? nombreCompleto(usuario) : undefined}>
          <Avatar name={nombreCompleto(usuario)} size={36} />
          <div>
            <strong>{nombreCompleto(usuario)}</strong>
            <span>Superusuario</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

export function ConsolaLayout() {
  return (
    <AvisosProvider>
      <div className="app">
        <MenuConsola />
        <main className="app__main">
          <Suspense fallback={<div className="ui-cargando-seccion" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </AvisosProvider>
  )
}
