import { Button, Card, EmptyState } from '../design-system/componentes/index.js'

// Tarjeta que llena el contenido cuando una carga falla, con opción de reintentar.
export function EstadoError({ reintentar, titulo = 'No pudimos cargar la información' }) {
  return (
    <Card className="nc-grow">
      <div className="ui-centro">
        <EmptyState
          icon="wifi-off"
          title={titulo}
          message="Revisa tu conexión e intenta de nuevo."
          action={
            <Button variant="secondary" icon="history" onClick={reintentar}>
              Reintentar
            </Button>
          }
        />
      </div>
    </Card>
  )
}
