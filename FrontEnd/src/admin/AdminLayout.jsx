import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Avatar, Icon, IconButton, Logo, LogoMark } from '../design-system/componentes/index.js'
import { useAvisos } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { MenuMovilContext, useEsMovil, useMenuMovil } from '../hooks/useMenuMovil'
import { nombreCompleto, ROL } from '../utils/convertir'
import { etiquetarTablas } from '../utils/tablasMovil'
import { AvisosSeguridadProvider } from './AvisosSeguridad'
import { GRUPOS, SECCIONES } from './secciones'
import { fotoDe } from '../utils/foto'

// Mismo marco que la web (menú lateral oscuro contraíble con el logo) con las secciones de la
// consola. En pantallas chicas el menú es un cajón que se abre con ☰ (del encabezado).
const CLAVE_COMPACTO = 'nucleo.admin.menu-compacto'
function leerCompacto() {
  try {
    return localStorage.getItem(CLAVE_COMPACTO) === '1'
  } catch {
    return false
  }
}

function MenuAdmin() {
  const { usuario, rol } = useSesion()
  const { alertasNuevas } = useAvisos()
  const { abierto, cerrar } = useMenuMovil()
  const movil = useEsMovil()
  const [compactoGuardado, setCompacto] = useState(leerCompacto)
  const compacto = compactoGuardado && !movil
  const alternar = () => {
    try {
      localStorage.setItem(CLAVE_COMPACTO, compacto ? '0' : '1')
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
    setCompacto(!compacto)
  }
  return (
    <nav
      id="menu-principal"
      className={`nc-sidebar${compacto ? ' is-compacto' : ''}${abierto ? ' is-abierto' : ''}`}
      aria-label="Navegación de la consola"
      inert={movil && !abierto}
    >
      {movil ? (
        <div className="nc-sidebar__brand ui-menu-logo">
          <Logo size={32} inverse />
          <IconButton icon="x" label="Cerrar menú" variant="ghost" className="ui-menu-movil__cerrar" onClick={cerrar} />
        </div>
      ) : (
        <button
          type="button"
          className="nc-sidebar__brand ui-menu-logo"
          onClick={alternar}
          aria-expanded={!compacto}
          title={compacto ? 'Expandir menú' : 'Contraer menú'}
          aria-label={compacto ? 'Núcleo: expandir menú' : undefined}
        >
          {compacto ? <LogoMark size={36} tone="verde" /> : <Logo size={32} inverse />}
        </button>
      )}
      {!compacto && <span className="ui-consola-marca">Consola de administración</span>}
      {GRUPOS.map((grupo) => (
        <div key={grupo} className="app__nav-group">
          <span className="nc-sidebar__section">{compacto ? '' : grupo}</span>
          <ul>
            {SECCIONES.filter((s) => s.grupo === grupo).map((s) => (
              <li key={s.ruta}>
                <NavLink
                  to={s.ruta}
                  end={s.ruta === '/'}
                  onClick={cerrar}
                  title={compacto ? s.titulo : undefined}
                  aria-label={compacto ? s.titulo : undefined}
                  className={({ isActive }) => `nc-navitem${isActive ? ' is-active' : ''}`}
                >
                  <Icon name={s.icono} size={20} />
                  <span>{s.titulo}</span>
                  {s.ruta === '/alertas' && alertasNuevas > 0 && <span className="nc-navitem__count">{alertasNuevas}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="nc-sidebar__foot">
        <div className="nc-sidebar__user" title={compacto ? nombreCompleto(usuario) : undefined}>
          <Avatar name={nombreCompleto(usuario)} src={fotoDe(usuario)} size={36} />
          <div>
            <strong>{nombreCompleto(usuario)}</strong>
            <span>{ROL[rol]}</span>
          </div>
        </div>
      </div>
    </nav>
  )
}

export function AdminLayout() {
  const movil = useEsMovil()
  const principal = useRef(null)
  const [abiertoMenu, setAbiertoMenu] = useState(false)
  const abierto = abiertoMenu && movil
  const menu = useMemo(
    () => ({ abierto, abrir: () => setAbiertoMenu(true), cerrar: () => setAbiertoMenu(false) }),
    [abierto],
  )

  // Tablas que en el celular se ven como tarjetas: cada celda lleva el nombre de su columna.
  useEffect(() => etiquetarTablas(principal.current), [])

  // Con el cajón abierto: Escape lo cierra y la página de atrás no se desplaza.
  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e) => e.key === 'Escape' && setAbiertoMenu(false)
    document.addEventListener('keydown', tecla)
    document.documentElement.classList.add('ui-sin-scroll')
    return () => {
      document.removeEventListener('keydown', tecla)
      document.documentElement.classList.remove('ui-sin-scroll')
    }
  }, [abierto])

  return (
    <AvisosSeguridadProvider>
      <MenuMovilContext.Provider value={menu}>
        <div className="app">
          <MenuAdmin />
          {movil && (
            <div
              className={`ui-menu-movil__fondo${abierto ? ' is-visible' : ''}`}
              aria-hidden="true"
              onClick={() => setAbiertoMenu(false)}
            />
          )}
          <main ref={principal} className="app__main">
            <Suspense fallback={<div className="ui-cargando-seccion" aria-busy="true" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </MenuMovilContext.Provider>
    </AvisosSeguridadProvider>
  )
}
