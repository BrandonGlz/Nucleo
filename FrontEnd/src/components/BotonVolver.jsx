import { Link, useNavigate } from 'react-router-dom'
import { IconButton } from '../design-system/componentes/index.js'

// ¿Se llegó a esta pantalla navegando dentro de la web? React Router guarda en el historial el índice de
// cada entrada que agrega (idx); la primera (entrar por URL, un enlace externo o un marcador) es 0.
const hayAnterior = () => (window.history.state?.idx ?? 0) > 0

// Flecha para regresar desde una pantalla de detalle a la página de la que se vino (con sus filtros y
// búsqueda, que viven en la URL). Si se entró directo por URL, va a «a» (la lista del módulo).
export function BotonVolver({ a, etiqueta = 'Volver' }) {
  const navegar = useNavigate()
  return (
    <IconButton
      icon="arrow-left"
      label={etiqueta}
      className="ui-volver"
      onClick={() => (hayAnterior() ? navegar(-1) : navegar(a, { replace: true }))}
    />
  )
}

// Migas del encabezado: «Módulo / actual», con el módulo como enlace a su lista.
export function Migas({ a, modulo, actual }) {
  return (
    <>
      <Link to={a} className="ui-miga">
        {modulo}
      </Link>
      {actual && <> / {actual}</>}
    </>
  )
}
