import { useState } from 'react'
import { Card, EmptyState, PeriodFilter, Skeleton } from '../../design-system/componentes/index.js'
import { Select } from '../../components/Desplegable'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as lecturasApi from '../../services/lecturas'
import * as organizacionesApi from '../../services/organizaciones'
import * as umbralesApi from '../../services/umbrales'
import { enLinea, pagina, rangoUmbral, UNIDAD, VARIABLE } from '../../utils/convertir'
import { avisoUltima, hoyTexto, puntoSerie } from '../../utils/formato'

// Panel principal: solo las gráficas del historial de mediciones (temperatura, humedad y
// calidad del aire) de un dispositivo, con un único filtro de periodo para las tres.
const VARIABLES = ['TEMP', 'HUM', 'AIRE']
const PERIODO = { Hoy: 'hoy', '7 días': '7', '30 días': '30' }

async function cargarCatalogo() {
  const [d, a] = await Promise.all([dispositivosApi.lista(), organizacionesApi.areas()])
  return { dispositivos: pagina(d), areas: pagina(a) }
}

async function cargarHistorial(disp, periodo) {
  const [umb, ...series] = await Promise.all([
    umbralesApi.lista(disp),
    ...VARIABLES.map((v) => lecturasApi.serieConDatos(disp, v, periodo)),
  ])
  return Object.fromEntries(
    VARIABLES.map((v, i) => [v, { ...series[i], umbral: pagina(umb).find((u) => u.variable === v) }]),
  )
}

function GraficaVariable({ variable, datos, dispositivo, periodo, className = '' }) {
  const info = VARIABLE[variable]
  const unidad = UNIDAD[variable]
  const u = datos?.umbral
  return (
    <Card className={`nc-grow ui-panel-grafica ${className}`.trim()}>
      <div className="nc-card__head" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="nc-card__title">{info.etiqueta}</h3>
          <p className="nc-card__sub">
            {dispositivo?.nombre} · umbral {rangoUmbral(u, unidad)}
            {datos?.ultima && <span className="ui-aviso-ultima"> · {avisoUltima(datos.ultima)}</span>}
          </p>
        </div>
      </div>
      {datos ? (
        <GraficaAjustable
          data={datos.puntos.map((p) => puntoSerie(p, periodo))}
          unit={unidad}
          threshold={u ? { min: Number(u.peligro_min), max: Number(u.peligro_max) } : undefined}
          minimo={60}
          vacio={`Sin lecturas de ${dispositivo?.nombre ?? 'este dispositivo'} en este periodo`}
        />
      ) : (
        <Skeleton height={120} />
      )}
    </Card>
  )
}

export function PanelPage() {
  const { usuario, organizacion } = useSesion()
  const cat = useDatos(cargarCatalogo, [])
  const [elegido, setElegido] = useState('')
  const [periodo, setPeriodo] = useState('Hoy')
  const clave = PERIODO[periodo]

  const dispositivos = cat.datos?.dispositivos ?? []
  // Mientras no se elige uno, se muestra el primero en línea (o el primero del alcance).
  const disp = elegido || String((dispositivos.find(enLinea) ?? dispositivos[0])?.num ?? '')
  const actual = dispositivos.find((d) => d.num === Number(disp))
  const area = cat.datos?.areas.find((a) => a.num === actual?.area)
  const hist = useDatos(() => (disp ? cargarHistorial(disp, clave) : new Promise(() => {})), [disp, clave])

  const encabezado = {
    eyebrow: `${organizacion} · ${hoyTexto()}${area ? ` · ${area.nombre}` : ''}`,
    titulo: `Hola, ${usuario?.nombre ?? ''}`,
  }
  const filtros = (
    <div className="ui-panel-filtros">
      {dispositivos.length > 1 && (
        <Select
          icon="cpu"
          value={disp}
          onChange={(e) => setElegido(e.target.value)}
          options={dispositivos.map((d) => ({ value: String(d.num), label: `${d.nombre} · ${d.codigo_mqtt}` }))}
        />
      )}
      <PeriodFilter value={periodo} onChange={setPeriodo} />
    </div>
  )

  if (cat.estado === 'error' || hist.estado === 'error') {
    return (
      <Pantalla {...encabezado}>
        <EstadoError reintentar={cat.estado === 'error' ? cat.reintentar : hist.reintentar} />
      </Pantalla>
    )
  }
  if (cat.datos && !dispositivos.length) {
    return (
      <Pantalla {...encabezado}>
        <Card className="nc-grow">
          <div className="ui-centro">
            <EmptyState icon="cpu" title="Sin dispositivos" message="Aún no hay dispositivos con mediciones a tu alcance." />
          </div>
        </Card>
      </Pantalla>
    )
  }

  const datos = hist.estado === 'cargando' ? null : hist.datos
  const grafica = (variable, className) => (
    <GraficaVariable
      variable={variable}
      datos={datos?.[variable]}
      dispositivo={actual}
      periodo={clave}
      className={className}
    />
  )
  return (
    <Pantalla {...encabezado} acciones={filtros}>
      <div className="ui-fila ui-panel-graficas">
        {grafica('TEMP', 'ui-panel-grafica--principal')}
        <div className="ui-col">
          {grafica('HUM')}
          {grafica('AIRE')}
        </div>
      </div>
    </Pantalla>
  )
}
