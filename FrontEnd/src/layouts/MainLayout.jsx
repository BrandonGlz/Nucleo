import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Avatar, Icon, IconButton, Logo, LogoApp } from '../design-system/componentes/index.js'
import { AgenteProvider } from '../context/AgenteContext'
import { AvisosProvider, useAvisos } from '../context/AvisosContext'
import { useSesion } from '../context/SesionContext'
import { useLatido } from '../hooks/useLatido'
import { MenuMovilContext, useEsMovil, useMenuMovil } from '../hooks/useMenuMovil'
import { modulos, puedeVer } from '../features'
import { limiteAlerta, nombreCompleto, ROL, tituloAlerta, valorAlerta } from '../utils/convertir'
import { haceCuanto, hora } from '../utils/formato'
import { etiquetarTablas } from '../utils/tablasMovil'

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
  const { cerrar } = useMenuMovil()
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
      onClick={() => {
        cerrar()
        navegar('/alertas')
      }}
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

// En pantallas chicas el mismo menú es un cajón que entra desde la izquierda (botón ☰ del
// encabezado): siempre expandido, se cierra al elegir una sección, con Escape o tocando el fondo.
function MenuLateral() {
  const { usuario, rol } = useSesion()
  const { pendientes } = useAvisos()
  const { abierto, cerrar } = useMenuMovil()
  const movil = useEsMovil()
  const [compactoGuardado, setCompacto] = useState(leerCompacto)
  const compacto = compactoGuardado && !movil
  const visibles = modulos.filter((m) => m.seccion && puedeVer(m, rol))
  const alternar = () => {
    guardarCompacto(!compacto)
    setCompacto(!compacto)
  }
  return (
    <nav
      id="menu-principal"
      className={`nc-sidebar${compacto ? ' is-compacto' : ''}${abierto ? ' is-abierto' : ''}`}
      aria-label="Navegación principal"
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
        >
          {compacto ? <LogoApp size={48} label="Núcleo" /> : <Logo size={32} inverse />}
        </button>
      )}
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
                    onClick={cerrar}
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
    <AvisosProvider>
      <AgenteProvider>
        <MenuMovilContext.Provider value={menu}>
          <div className="app">
            <MenuLateral />
            {movil && (
              <div
                className={`ui-menu-movil__fondo${abierto ? ' is-visible' : ''}`}
                aria-hidden="true"
                onClick={() => setAbiertoMenu(false)}
              />
            )}
            <main ref={principal} className="app__main">
              <Outlet />
            </main>
          </div>
        </MenuMovilContext.Provider>
      </AgenteProvider>
    </AvisosProvider>
  )
}
