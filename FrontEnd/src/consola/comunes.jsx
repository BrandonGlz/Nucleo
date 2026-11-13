import { useId } from 'react'
import { Desplegable } from '../components/Desplegable'

// Piezas que comparten las páginas de la consola.

// Texto de varias líneas con el mismo aspecto que los campos del sistema de diseño.
export function AreaTexto({ label, hint, error, filas = 4, mono = false, ...resto }) {
  const id = useId()
  return (
    <div className="nc-field">
      {label && (
        <label className="nc-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <span className={`nc-input ui-consola-area${error ? ' is-error' : ''}`}>
        <textarea id={id} rows={filas} className={mono ? 'is-mono' : undefined} aria-invalid={error ? true : undefined} {...resto} />
      </span>
      {(error || hint) && <span className={`nc-field__msg${error ? ' nc-field__msg--error' : ''}`}>{error || hint}</span>}
    </div>
  )
}

// Desplegable con etiqueta encima, como los demás campos.
export function Campo({ label, ...resto }) {
  return (
    <div className="nc-field">
      <span className="nc-field__label">{label}</span>
      <Desplegable {...resto} />
    </div>
  )
}


// Barras horizontales sencillas: [{clave, etiqueta, valor, texto?, color?, nota?}] (`texto`: cómo
// se muestra el valor, p. ej. «4.2 s»).
export function BarrasHorizontales({ filas }) {
  const max = Math.max(1, ...filas.map((f) => f.valor))
  if (!filas.length) return <p className="ui-muted ui-consola-vacio">Sin datos todavía.</p>
  return (
    <ul className="ui-consola-barras">
      {filas.map((f) => (
        <li key={f.clave}>
          <span className="ui-consola-barras__etiqueta">{f.etiqueta}</span>
          <span className="ui-consola-barras__pista">
            <span style={{ width: `${(f.valor / max) * 100}%`, background: f.color }} />
          </span>
          <span className="ui-consola-barras__valor">
            {f.texto ?? f.valor.toLocaleString('es-MX')}
            {f.nota && <small>{f.nota}</small>}
          </span>
        </li>
      ))}
    </ul>
  )
}
