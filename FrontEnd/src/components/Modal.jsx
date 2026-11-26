import { useEffect } from 'react'
import { Button, IconButton } from '../design-system/componentes/index.js'
import { useCierre } from '../hooks/useSalida.js'

// Ventana modal con título, subtítulo, contenido y acciones (Cancelar más las que se pasen).
// Al cerrar con la X, Cancelar o el fondo, primero anima la salida.
export function Modal({
  titulo,
  sub,
  cerrar,
  children,
  acciones,
  autoFocusCancelar = false,
  cerrarConEscape = false,
  tamano = 'mediano',
}) {
  const [saliendo, cerrarAnimado] = useCierre(cerrar)
  useEffect(() => {
    if (!cerrarConEscape) return undefined
    const alEscape = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cerrarAnimado()
    }
    document.addEventListener('keydown', alEscape)
    return () => document.removeEventListener('keydown', alEscape)
  }, [cerrarConEscape, cerrarAnimado])
  return (
    <div
      className={`ui-modal${saliendo ? ' is-saliendo' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => e.target === e.currentTarget && cerrarAnimado()}
    >
      <div className={`ui-modal__caja ui-modal__caja--${tamano}`}>
        <div className="ui-modal__cabeza">
          <div>
            <h2>{titulo}</h2>
            {sub && <p className="ui-muted">{sub}</p>}
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrarAnimado} />
        </div>
        <div className="ui-modal__cuerpo">{children}</div>
        <div className="ui-acciones ui-separado ui-modal__acciones">
          <Button variant="ghost" autoFocus={autoFocusCancelar} onClick={cerrarAnimado}>
            Cancelar
          </Button>
          {acciones}
        </div>
      </div>
    </div>
  )
}
