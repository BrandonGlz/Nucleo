import { Button, IconButton } from '../design-system/componentes/index.js'
import { useCierre } from '../hooks/useSalida.js'

// Ventana modal con título, subtítulo, contenido y acciones (Cancelar más las que se pasen).
// Al cerrar con la X, Cancelar o el fondo, primero anima la salida.
export function Modal({ titulo, sub, cerrar, children, acciones }) {
  const [saliendo, cerrarAnimado] = useCierre(cerrar)
  return (
    <div
      className={`ui-modal${saliendo ? ' is-saliendo' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => e.target === e.currentTarget && cerrarAnimado()}
    >
      <div className="ui-modal__caja">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2>{titulo}</h2>
            {sub && (
              <p className="ui-muted" style={{ margin: '4px 0 0', fontSize: 14, lineHeight: '22px' }}>
                {sub}
              </p>
            )}
          </div>
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrarAnimado} />
        </div>
        {children}
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrarAnimado}>
            Cancelar
          </Button>
          {acciones}
        </div>
      </div>
    </div>
  )
}
