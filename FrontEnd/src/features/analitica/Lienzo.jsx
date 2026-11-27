import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '../../design-system/componentes/index.js'
import { Tarjeta } from './Tarjeta'

export function Lienzo({
  pagina,
  datosPagina,
  cargando,
  cruzado,
  alSeleccionar,
  alQuitarFiltro,
  alExportar,
  alGenerarHallazgos,
  generandoHallazgos,
  hallazgos,
  errorHallazgos,
  alReintentar,
  innerRef,
  impresion = false,
}) {
  const area = useRef(null)
  const [tam, setTam] = useState({ ancho: 0, alto: 0 })
  useEffect(() => {
    const nodo = area.current
    if (impresion || !nodo || typeof ResizeObserver === 'undefined') return undefined
    const observar = () => {
      const ancho = Math.max(0, nodo.clientWidth)
      const alto = Math.max(0, nodo.clientHeight)
      if (!ancho || !alto) return
      const razon = 16 / 9
      if (ancho / alto > razon) setTam({ ancho: Math.round(alto * razon), alto: Math.round(alto) })
      else setTam({ ancho: Math.round(ancho), alto: Math.round(ancho / razon) })
    }
    observar()
    const observer = new ResizeObserver(observar)
    observer.observe(nodo)
    return () => observer.disconnect()
  }, [impresion])
  const altoTarjeta = (fila) => {
    const alto = tam.alto || 540
    return Math.round(((alto - 40) / 6) * fila)
  }
  return (
    <div className="ui-analitica__area" ref={area}>
      <div
        ref={innerRef}
        className={`ui-analitica__lienzo${impresion ? ' ui-analitica__lienzo--impreso' : ''}`}
        style={tam.ancho ? { '--lienzo-ancho': `${tam.ancho}px`, '--lienzo-alto': `${tam.alto}px` } : undefined}
      >
        {(pagina?.tarjetas || []).map((tarjeta) => (
          <Tarjeta
            key={tarjeta.id}
            tarjeta={tarjeta}
            datos={datosPagina?.tarjetas?.[tarjeta.id]}
            cargando={cargando}
            alto={altoTarjeta(tarjeta.h)}
            cruzado={cruzado}
            alSeleccionar={(seleccion) => alSeleccionar(tarjeta, seleccion)}
            alQuitarFiltro={alQuitarFiltro}
            alExportar={alExportar}
            alGenerarHallazgos={alGenerarHallazgos}
            generandoHallazgos={generandoHallazgos?.[tarjeta.id]}
            hallazgos={hallazgos?.[tarjeta.id]}
            errorHallazgos={errorHallazgos?.[tarjeta.id]}
            alReintentar={alReintentar}
            impresion={impresion}
          />
        ))}
        {!pagina?.tarjetas?.length && (
          <div className="ui-analitica__lienzo-vacio">
            <EmptyState compact icon="layout-dashboard" title="Tablero sin tarjetas" message="Este tablero todavía no tiene tarjetas." />
          </div>
        )}
      </div>
    </div>
  )
}
