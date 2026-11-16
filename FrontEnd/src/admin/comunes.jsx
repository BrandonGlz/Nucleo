import { useState } from 'react'
import { Button } from '../design-system/componentes/index.js'
import { Select } from '../components/Desplegable'
import { Modal } from '../components/Modal'
import { mensajeError } from './utilidades'

// Piezas que comparten las páginas de la consola de administración.

// Selector de organización. Con `todas`, la primera opción es «Todas las organizaciones».
export function FiltroOrganizacion({ organizaciones, value, onChange, todas = true, label = 'Organización', placeholder }) {
  const opciones = [
    ...(todas ? [{ value: '', label: 'Todas las organizaciones' }] : []),
    ...organizaciones.map((o) => ({ value: String(o.num), label: o.nombre })),
  ]
  return (
    <Select
      label={label}
      icon="building-2"
      value={value}
      placeholder={placeholder}
      options={opciones}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// Ventana para confirmar una acción. `hacer` es async: si falla, muestra el mensaje del backend
// y la ventana sigue abierta; si sale bien, se cierra.
export function Confirmar({ titulo, mensaje, boton, icono = 'circle-check', peligro = false, hacer, cerrar, children }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const aceptar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await hacer()
      cerrar()
    } catch (e) {
      setError(mensajeError(e, 'No se pudo completar. Intenta de nuevo.'))
      setEnviando(false)
    }
  }
  return (
    <Modal
      titulo={titulo}
      sub={mensaje}
      cerrar={cerrar}
      acciones={
        <Button icon={icono} className={peligro ? 'ui-admin-peligro' : undefined} disabled={enviando} onClick={aceptar}>
          {enviando ? 'Un momento…' : boton}
        </Button>
      }
    >
      {children}
      {error && (
        <p className="ui-admin-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

// Mensaje cuando la lista de la API trae más de lo que se muestra.
export function Recorte({ datos, mostrados }) {
  const total = datos?.count ?? mostrados
  if (total <= mostrados) return null
  return <p className="ui-muted ui-admin-recorte">Se muestran {mostrados} de {total}. Usa los filtros para acotar.</p>
}

// Estado de carga de una página con lista: error (con el mensaje del backend), vacío o listo.
export function ErrorCarga({ error, reintentar }) {
  return (
    <div className="nc-card ui-admin-fallo" role="alert">
      <strong>No pudimos cargar la información</strong>
      <span>{mensajeError(error, 'Revisa tu conexión e intenta de nuevo.')}</span>
      <Button variant="secondary" size="sm" icon="refresh-cw" onClick={reintentar}>
        Reintentar
      </Button>
    </div>
  )
}
