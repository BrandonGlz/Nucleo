import { Tabs } from '../../design-system/componentes/index.js'

export function PaginasTablero({ paginas = [], actual, onCambiar }) {
  if (paginas.length <= 1) return null
  return (
    <div className="ui-analitica__paginas">
      <Tabs
        items={paginas.map((p) => ({ id: p.id, label: p.nombre }))}
        value={actual}
        onChange={onCambiar}
        aria-label="Páginas del tablero"
      />
    </div>
  )
}
