import { useMemo, useState } from 'react'
import { Badge, Card, Icon } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'

const normalizar = (texto) => String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function ListaTableros({ tableros = [], actual, onSelect, abierta, alCerrar }) {
  const [busqueda, setBusqueda] = useState('')
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    return tableros.filter((t) => !q || normalizar(`${t.nombre} ${t.descripcion}`).includes(q))
  }, [tableros, busqueda])
  const grupos = [
    ['De la organización', filtrados.filter((t) => !t.es_plantilla)],
    ['Plantillas', filtrados.filter((t) => t.es_plantilla)],
  ]
  return (
    <aside className={`ui-analitica__lista${abierta ? ' is-abierta' : ''}`} aria-label="Tableros de Analítica">
      <Card className="ui-analitica__lista-card">
        <div className="ui-analitica__lista-filtros">
          <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar tablero…" ancho="100%" />
          <button type="button" className="ui-analitica__cerrar-lista" aria-label="Cerrar lista" onClick={alCerrar}>
            <Icon name="chevron-left" size={18} />
          </button>
        </div>
        <div className="ui-analitica__lista-items nc-scroll">
          {!filtrados.length && <p className="ui-muted ui-analitica__lista-vacia">No hay tableros con ese nombre.</p>}
          {grupos.map(([titulo, items]) => items.length ? (
            <section key={titulo} className="ui-analitica__grupo">
              <h4>{titulo}</h4>
              {items.map((tablero) => (
                <button
                  key={tablero.num}
                  type="button"
                  className={`ui-item ui-item--boton ui-analitica__item${actual?.num === tablero.num ? ' is-selected' : ''}`}
                  onClick={() => onSelect(tablero)}
                >
                  <span className="ui-analitica__item-texto">
                    <strong>{tablero.nombre}</strong>
                    <span>{tablero.descripcion}</span>
                  </span>
                  {tablero.predeterminado ? <Badge tone="accent" className="ui-analitica__predeterminado" aria-label="Predeterminado">★</Badge> : null}
                </button>
              ))}
            </section>
          ) : null)}
        </div>
      </Card>
    </aside>
  )
}
