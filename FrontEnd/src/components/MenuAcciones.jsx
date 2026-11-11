import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, IconButton } from '../design-system/componentes/index.js'
import { useSalida } from '../hooks/useSalida'

const ANCHO = 260

// Botón «⋯» con su lista de acciones. items: [{ label, icon, onClick, peligro, disabled, nota }].
// La lista se coloca con position: fixed para que el scroll de la tabla no la recorte; se cierra
// al elegir, al hacer clic fuera, con Escape o al desplazar la página.
export function MenuAcciones({ items, label = 'Más opciones' }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState(null)
  const boton = useRef(null)
  const lista = useRef(null)
  const salida = useSalida(abierto)

  useLayoutEffect(() => {
    if (!abierto) return
    const r = boton.current.getBoundingClientRect()
    const alto = lista.current?.offsetHeight ?? 0
    const abajo = r.bottom + 6 + alto < window.innerHeight
    setPos({ left: Math.max(8, r.right - ANCHO), top: abajo ? r.bottom + 6 : r.top - 6 - alto })
  }, [abierto])

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => !boton.current?.contains(e.target) && !lista.current?.contains(e.target) && setAbierto(false)
    const tecla = (e) => e.key === 'Escape' && setAbierto(false)
    const cerrar = () => setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', cerrar)
    document.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', cerrar)
      document.removeEventListener('scroll', cerrar, true)
    }
  }, [abierto])

  return (
    <span ref={boton} className="ui-menu-acciones" onClick={(e) => e.stopPropagation()}>
      <IconButton
        icon="ellipsis"
        label={label}
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={abierto}
        className={abierto ? 'is-abierto' : ''}
        onClick={() => {
          setPos(null)
          setAbierto((a) => !a)
        }}
      />
      {salida.montado && (
        <div
          ref={lista}
          role="menu"
          className={`ui-menu-acciones__lista${salida.saliendo ? ' is-saliendo' : ''}`}
          style={{ width: ANCHO, ...(pos ?? { visibility: 'hidden' }) }}
        >
          {items.filter(Boolean).map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={`ui-menuitem${it.peligro ? ' ui-menuitem--peligro' : ''}`}
              onClick={() => {
                setAbierto(false)
                it.onClick()
              }}
            >
              {it.icon && <Icon name={it.icon} size={18} />}
              <span className="ui-menu-acciones__texto">
                {it.label}
                {it.nota && <small>{it.nota}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
