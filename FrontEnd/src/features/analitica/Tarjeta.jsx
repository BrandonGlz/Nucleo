import { useEffect, useRef, useState } from 'react'
import { Card, EmptyState, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { MenuAcciones } from '../../components/MenuAcciones'
import { ContenidoTarjeta } from './Tarjetas'

function Cargando({ alto }) {
  return (
    <div className="ui-analitica__cargando" aria-busy="true">
      <Skeleton height={Math.max(16, Math.min(28, alto * 0.12))} width="46%" />
      <Skeleton height={Math.max(12, Math.min(22, alto * 0.1))} width="70%" />
      {alto > 90 && <Skeleton height={Math.max(28, alto * 0.35)} />}
    </div>
  )
}

export function Tarjeta({
  tarjeta,
  datos,
  cargando,
  alto,
  cruzado,
  alSeleccionar,
  alQuitarFiltro,
  alExportar,
  alGenerarHallazgos,
  generandoHallazgos,
  hallazgos,
  errorHallazgos,
  alReintentar,
  impresion = false,
}) {
  const [altoCuerpo, setAltoCuerpo] = useState(0)
  const cuerpo = useRef(null)
  useEffect(() => {
    const nodo = cuerpo.current
    if (!nodo || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entradas) => {
      const h = Math.round(entradas[0].contentRect.height)
      if (h > 0) setAltoCuerpo((previo) => (Math.abs(previo - h) > 2 ? h : previo))
    })
    observer.observe(nodo)
    return () => observer.disconnect()
  }, [])
  const menu = [
    tarjeta.tipo !== 'hallazgos' && {
      label: 'Exportar datos (CSV)',
      icon: 'download',
      onClick: () => alExportar?.(tarjeta),
    },
    cruzado && {
      label: 'Quitar filtro',
      icon: 'x',
      onClick: () => alQuitarFiltro?.(),
    },
  ].filter(Boolean)
  const altoFinal = impresion ? Math.max(60, alto || 100) : altoCuerpo > 30 ? altoCuerpo : Math.max(80, alto || 120)
  return (
    <Card
      className={`ui-analitica__tarjeta${tarjeta.tipo === 'kpi' && tarjeta.w <= 3 ? ' ui-analitica__tarjeta--kpi-corta' : ''}${impresion ? ' ui-analitica__tarjeta--impresa' : ''}`}
      style={{
        gridColumn: `${tarjeta.x + 1} / span ${tarjeta.w}`,
        gridRow: `${tarjeta.y + 1} / span ${tarjeta.h}`,
        '--tarjeta-alto': `${tarjeta.h}`,
      }}
    >
      <div className="ui-analitica__tarjeta-cabeza">
        <h3 title={tarjeta.titulo}>{tarjeta.titulo}</h3>
        {!impresion && menu.length ? <MenuAcciones items={menu} label={`Opciones de ${tarjeta.titulo}`} /> : null}
      </div>
      <div className="ui-analitica__tarjeta-cuerpo" ref={cuerpo}>
        {cargando && !datos ? (
          <Cargando alto={altoFinal} />
        ) : datos?.error ? (
          <div className="ui-analitica__error" role="alert">
            <Icon name="octagon-alert" size={18} />
            <span>No se pudo calcular esta tarjeta.</span>
            {alReintentar && (
              <button type="button" className="ui-analitica__reintentar" onClick={alReintentar}>
                Reintentar
              </button>
            )}
          </div>
        ) : datos?.sin_datos ? (
          <EmptyState compact icon="activity" title="Sin datos en el periodo" />
        ) : (
          <ContenidoTarjeta
            tarjeta={tarjeta}
            datos={datos}
            alto={altoFinal}
            // Solo la tarjeta de origen resalta su elemento; las demás ya vienen filtradas y no se atenúan.
            cruzado={cruzado?.origen === tarjeta.id ? cruzado : null}
            alSeleccionar={alSeleccionar}
            alGenerar={() => alGenerarHallazgos?.(tarjeta)}
            generando={generandoHallazgos}
            hallazgos={hallazgos}
            errorHallazgos={errorHallazgos}
            impresion={impresion}
          />
        )}
      </div>
    </Card>
  )
}
