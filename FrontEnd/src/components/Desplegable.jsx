import { useEffect, useId, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Icon } from '../design-system/componentes/index.js'
import { useSalida } from '../hooks/useSalida'

// Selector con lista propia (la del sistema operativo no toma los estilos de Núcleo).
// options: [{ value, label }] · accion: { label, icon, onClick } se muestra al final de la lista.
// Se maneja con teclado: flechas para moverse, Enter para elegir y Escape para cerrar.
// Los valores pueden llegar como número o texto (p. ej. el número de un área).
const igual = (a, b) => String(a) === String(b)

export function Desplegable({ label, icon, value, onChange, options, accion, placeholder, disabled }) {
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const caja = useRef(null)
  const lista = useSalida(abierto)
  const id = useId()
  const actual = options.find((o) => igual(o.value, value)) ?? (placeholder ? null : options[0])
  const total = options.length + (accion ? 1 : 0)

  useEffect(() => {
    if (!abierto) return undefined
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const abrir = () => {
    setActivo(
      Math.max(
        0,
        options.findIndex((o) => igual(o.value, value)),
      ),
    )
    setAbierto(true)
  }
  const elegir = (i) => {
    setAbierto(false)
    if (i < options.length) onChange(options[i].value)
    else accion?.onClick()
  }
  const tecla = (e) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        abrir()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setAbierto(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo((i) => (i + 1) % total)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => (i - 1 + total) % total)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      elegir(activo)
    } else if (e.key === 'Tab') setAbierto(false)
  }

  return (
    <div className="nc-field ui-desplegable" ref={caja}>
      {label && (
        <span className="nc-field__label" id={`${id}-etiqueta`}>
          {label}
        </span>
      )}
      <button
        type="button"
        className={`nc-input ui-desplegable__boton${abierto ? ' is-focus' : ''}${disabled ? ' is-disabled' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-labelledby={label ? `${id}-etiqueta ${id}-valor` : undefined}
        aria-activedescendant={abierto ? `${id}-${activo}` : undefined}
        aria-controls={`${id}-lista`}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={tecla}
      >
        {icon && <Icon name={icon} size={18} />}
        <span className={`ui-desplegable__valor${actual ? '' : ' is-vacio'}`} id={`${id}-valor`}>
          {actual?.label ?? placeholder}
        </span>
        <Icon name="chevron-down" size={18} className="nc-select__chev" />
      </button>
      {lista.montado && (
        <ul
          className={`ui-desplegable__lista${lista.saliendo ? ' is-saliendo' : ''}`}
          role="listbox"
          id={`${id}-lista`}
          aria-labelledby={label ? `${id}-etiqueta` : undefined}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={igual(o.value, value)}
              className={`ui-desplegable__opcion${i === activo ? ' is-activa' : ''}${igual(o.value, value) ? ' is-elegida' : ''}`}
              onMouseEnter={() => setActivo(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(i)}
            >
              <span>{o.label}</span>
              {igual(o.value, value) && <Check size={16} />}
            </li>
          ))}
          {accion && (
            <li
              id={`${id}-${options.length}`}
              role="option"
              aria-selected={false}
              className={`ui-desplegable__opcion ui-desplegable__accion${activo === options.length ? ' is-activa' : ''}`}
              onMouseEnter={() => setActivo(options.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(options.length)}
            >
              {accion.icon && <Icon name={accion.icon} size={16} />}
              <span>{accion.label}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

// Misma forma de uso que el Select del sistema de diseño (opciones como texto u objeto y
// onChange con un evento), pero con la lista de Núcleo. Se usa en todas las pantallas.
export function Select({ onChange, options = [], ...resto }) {
  return (
    <Desplegable
      {...resto}
      options={options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))}
      onChange={(value) => onChange?.({ target: { value } })}
    />
  )
}
