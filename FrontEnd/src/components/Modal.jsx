import { Button, IconButton } from '../design-system/componentes/index.js'

// Ventana modal con título, subtítulo, contenido y acciones (Cancelar más las que se pasen).
export function Modal({ titulo, sub, cerrar, children, acciones }) {
  return (
    <div className="ui-modal" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
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
          <IconButton icon="x" label="Cerrar" variant="ghost" onClick={cerrar} />
        </div>
        {children}
        <div className="ui-acciones ui-separado" style={{ paddingTop: 16 }}>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          {acciones}
        </div>
      </div>
    </div>
  )
}
