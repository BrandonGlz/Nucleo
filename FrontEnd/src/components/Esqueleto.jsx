import { Skeleton } from '../design-system/componentes/index.js'

// Piezas de carga con la misma silueta que el contenido real.
// `primera`: 'simple' | 'avatar' | 'icono' | 'doble' cambia la primera celda
// (texto, persona, dispositivo con ícono o nombre + detalle).
export function EsqueletoTabla({
  etiquetas,
  filas = 5,
  anchos = [],
  primera = 'simple',
  pastillas = [],
  className = '',
}) {
  return (
    <div className={`nc-table-wrap nc-scroll ui-esqueleto-tabla ${className}`.trim()} aria-busy="true" aria-label="Cargando">
      <table className="nc-table ui-tabla-tarjetas">
        <thead>
          <tr>
            {etiquetas.map((etiqueta, i) => (
              <th key={`${etiqueta}-${i}`} scope="col">{etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: filas }, (_, fila) => (
            <tr key={fila}>
              {etiquetas.map((etiqueta, columna) => (
                <td key={`${etiqueta}-${fila}-${columna}`} data-etiqueta={etiqueta}>
                  {columna === 0 && primera !== 'simple' ? (
                    <div className="nc-table__device">
                      {primera === 'avatar' && <Skeleton variant="circle" width={36} />}
                      {primera === 'icono' && <Skeleton variant="circle" width={32} />}
                      <span className="ui-esqueleto-lineas">
                        <Skeleton width={`${58 + ((fila * 7) % 24)}%`} height={13} />
                        <Skeleton width={`${38 + ((fila * 5) % 20)}%`} height={10} />
                      </span>
                    </div>
                  ) : pastillas.includes(columna) ? (
                    <Skeleton variant="circle" width={anchos[columna] ?? 76} height={22} />
                  ) : (
                    <Skeleton width={anchos[columna] ?? '62%'} height={columna === 0 ? 13 : 12} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Gráfica vacía con eje, área y punto final: ocupa el mismo alto que la gráfica real.
export function EsqueletoGrafica({ alto = 120, className = '' }) {
  return (
    <div className={`ui-esqueleto-grafica ${className}`.trim()} style={{ height: alto }} aria-busy="true" aria-label="Cargando gráfica">
      <span className="ui-esqueleto-grafica__area" />
      <span className="ui-esqueleto-grafica__punto" />
    </div>
  )
}
