import { NavLink } from 'react-router-dom'
import { modulos } from '../features'

export function MainLayout({ children }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="Núcleo, inicio">
          <span className="brand__mark" aria-hidden="true">
            N
          </span>
          <span className="brand__text">
            Núcleo
            <small>Gestión y monitoreo del ambiente</small>
          </span>
        </NavLink>
      </header>

      <nav className="site-nav" aria-label="Módulos">
        <NavLink to="/" end>
          Inicio
        </NavLink>
        {modulos.map((modulo) => (
          <NavLink key={modulo.ruta} to={modulo.ruta}>
            {modulo.titulo}
          </NavLink>
        ))}
      </nav>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <p>Núcleo · Esqueleto base de la web</p>
      </footer>
    </div>
  )
}
