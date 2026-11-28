import { useEffect, useRef, useState } from 'react'
import { BarChart, TrendChart } from '../design-system/componentes/index.js'

// Debajo de este alto el tooltip del último punto taparía la línea: se muestra compacto y solo
// al pasar el mouse. El Panel, con resumenAlPasar, conserva el recuadro completo (sin fijarlo).
const ALTO_COMPACTO = 170

// TrendChart que toma la altura del espacio libre de su tarjeta (nc-grow), para que la
// gráfica nunca se salga de ella al cambiar el tamaño de la ventana.
// `resumenAlPasar`: el Panel lo activa para que el punto final no fije el recuadro; las demás
// pantallas conservan el criterio por alto (tooltip fijo en gráficas altas).
export function GraficaAjustable({ minimo = 40, resumenAlPasar = false, tooltipFijo, ...props }) {
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
      {alto >= minimo && (
        <TrendChart
          tooltipFijo={resumenAlPasar ? false : (tooltipFijo ?? alto >= ALTO_COMPACTO)}
          resumenAlPasar={resumenAlPasar}
          {...props}
          className={!resumenAlPasar && alto < ALTO_COMPACTO ? 'nc-trend--compacta' : undefined}
          height={alto}
        />
      )}
    </div>
  )
}

// BarChart que llena el alto libre de su tarjeta (los paneles sin scroll de las consolas).
export function BarrasAjustables({ minimo = 120, ...props }) {
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
    <div ref={ref} className="ui-grafica ui-grafica--barras">
      {alto > 0 && <BarChart {...props} height={Math.max(alto, minimo)} />}
    </div>
  )
}
