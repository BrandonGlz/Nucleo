import { Icon } from '../design-system/componentes/index.js'

// Caja de búsqueda de una pantalla concreta (solo donde hay una lista que filtrar).
export function Buscador({ valor, cambiar, placeholder = 'Buscar…', ancho = 280 }) {
  return (
    <label className="nc-search ui-buscador" style={{ width: ancho }}>
      <Icon name="search" size={18} />
      <input type="search" placeholder={placeholder} aria-label={placeholder} value={valor} onChange={(e) => cambiar(e.target.value)} />
      {valor && (
        <button type="button" className="ui-buscador__limpiar" aria-label="Limpiar búsqueda" onClick={() => cambiar('')}>
          <Icon name="x" size={14} />
        </button>
      )}
    </label>
  )
}
