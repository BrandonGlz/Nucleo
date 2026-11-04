import { useEffect, useRef, useState } from 'react'
import { TrendChart } from '../design-system/componentes/index.js'

// TrendChart que toma la altura del espacio libre de su tarjeta (nc-grow), para que la
// gráfica nunca se salga de ella al cambiar el tamaño de la ventana.
export function GraficaAjustable({ minimo = 40, ...props }) {
  const ref = useRef(null)
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setAlto(Math.floor(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="ui-grafica">
      {alto >= minimo && <TrendChart {...props} height={alto} />}
    </div>
  )
}
