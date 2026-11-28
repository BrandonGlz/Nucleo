import { useState } from 'react'
import { IconButton, Input } from '../../design-system/componentes/index.js'
import { MenuAcciones } from '../../components/MenuAcciones'

export function PaginasEditor({
  paginas = [],
  actual,
  alCambiar,
  alAgregar,
  alRenombrar,
  alMover,
  alEliminar,
  alAlternarPanel,
  panelAbierto,
  limite = 8,
}) {
  const [renombrando, setRenombrando] = useState(null)
  const [nombre, setNombre] = useState('')
  const [aviso, setAviso] = useState('')

  const empezarRenombre = (pagina) => {
    setRenombrando(pagina.id)
    setNombre(pagina.nombre)
    setAviso('')
  }
  const terminarRenombre = () => {
    if (!renombrando) return
    const limpio = nombre.trim()
    if (limpio) {
      const error = alRenombrar(renombrando, limpio)
      if (error) setAviso(error)
    }
    setRenombrando(null)
  }
  const agregar = () => {
    const resultado = alAgregar()
    if (resultado?.error) setAviso(resultado.error)
    else setAviso('')
  }

  return (
    <div className="ui-editor__paginas">
      <div className="ui-editor__paginas-lista">
        {paginas.map((pagina, indice) => (
          <div key={pagina.id} className={`ui-editor__pagina${actual === pagina.id ? ' is-activa' : ''}`}>
            {renombrando === pagina.id ? (
              <Input
                autoFocus
                value={nombre}
                maxLength={30}
                aria-label={`Nombre de ${pagina.nombre}`}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={terminarRenombre}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    terminarRenombre()
                  } else if (e.key === 'Escape') {
                    setRenombrando(null)
                  }
                }}
              />
            ) : (
              <button type="button" className={`nc-tab${actual === pagina.id ? ' is-active' : ''}`} onClick={() => alCambiar(pagina.id)} onDoubleClick={() => empezarRenombre(pagina)}>
                {pagina.nombre}
              </button>
            )}
            <MenuAcciones
              label={`Opciones de ${pagina.nombre}`}
              items={[
                { label: 'Renombrar', icon: 'pencil', onClick: () => empezarRenombre(pagina) },
                { label: 'Mover a la izquierda', icon: 'chevron-left', disabled: indice === 0, onClick: () => alMover(pagina.id, -1) },
                { label: 'Mover a la derecha', icon: 'chevron-right', disabled: indice === paginas.length - 1, onClick: () => alMover(pagina.id, 1) },
                { label: 'Eliminar página', icon: 'trash-2', peligro: true, disabled: paginas.length <= 1, onClick: () => alEliminar(pagina.id) },
              ]}
            />
          </div>
        ))}
        <IconButton
          className="ui-editor__panel-toggle"
          icon="sliders-horizontal"
          label={panelAbierto ? 'Ocultar propiedades' : 'Mostrar propiedades'}
          variant="secondary"
          size="sm"
          onClick={alAlternarPanel}
        />
        <IconButton
          icon="plus"
          label={paginas.length >= limite ? `Máximo ${limite} páginas` : 'Agregar página'}
          variant="secondary"
          size="sm"
          disabled={paginas.length >= limite}
          onClick={agregar}
        />
      </div>
      {aviso && <p className="ui-analitica__error" role="alert">{aviso}</p>}
    </div>
  )
}
