import { useState } from 'react'
import { Card, EmptyState, PeriodFilter } from '../../design-system/componentes/index.js'
import { Select } from '../../components/Desplegable'
import { EsqueletoGrafica } from '../../components/Esqueleto'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import { useMonitoreo } from '../../hooks/useMonitoreo'
import * as lecturasApi from '../../services/lecturas'
import * as umbralesApi from '../../services/umbrales'
import { enLinea, nivelLectura, pagina, rangoUmbral, UNIDAD, VARIABLE } from '../../utils/convertir'
import { avisoUltima, haceCuanto, hoyTexto, num, puntoSerie } from '../../utils/formato'

// Panel principal: franja de cifras del dispositivo elegido (temperatura con su rango, humedad y
// aire) más el estado general (en línea y alertas pendientes), y debajo las gráficas del
// historial de las tres variables con un único filtro de periodo.
const VARIABLES = ['TEMP', 'HUM', 'AIRE']
const PERIODO = { Hoy: 'hoy', '7 días': '7', '30 días': '30' }

const CIFRAS_CARGANDO = {
  principal: { etiqueta: 'Temperatura · cargando dispositivo', valor: '--.-', tonoValor: 'apagado', sub: 'Cargando lecturas…' },
  // La barra de rango ocupa el mismo renglón que en la franja cargada.
  barra: { desde: 30, ancho: 40, marca: 50 },
  cifras: [
    { etiqueta: 'Humedad', valor: '—', unidad: '%HR', sub: '—', tono: 'tenue' },
    { etiqueta: 'En línea', valor: '—', unidad: '/ —', sub: '—', tono: 'tenue' },
    { etiqueta: 'Aire', valor: '—', unidad: 'ppm', sub: '—', tono: 'tenue' },
    { etiqueta: 'Pendientes', valor: '—', sub: '—', tono: 'tenue' },
  ],
}

// Cifras de la franja negra. Las lecturas (temperatura, humedad y aire) son las últimas del
// dispositivo elegido en el selector, igual que las gráficas; «En línea» y «Pendientes» son de
// todo el alcance del usuario. Sin conexión se muestran las últimas guardadas y de cuándo son.
function cifrasPanel({ dispositivos, umbrales, alertas }, d) {
  const vivo = enLinea(d)
  const lectura = (v) => d.lecturas.find((l) => l.variable === v)
  const umbral = (v) => umbrales.find((u) => u.dispositivo === d.num && u.variable === v)
  const ultima = d.lecturas.map((l) => l.fecha_hora).filter(Boolean).sort().at(-1) ?? d.ultima_conexion
  const cuando = ultima ? `última lectura ${haceCuanto(ultima).toLowerCase()}` : 'sin lecturas'

  const t = lectura('TEMP')
  const u = umbral('TEMP')
  const temp = t ? Number(t.valor) : null
  const fuera = temp != null && nivelLectura(temp, u) !== 'normal'
  let barra = null
  if (u) {
    const [min, max] = [Number(u.advertencia_min), Number(u.advertencia_max)]
    const escala = [min - (max - min) / 2, max + (max - min) / 2]
    const pct = (v) => Math.max(0, Math.min(100, ((v - escala[0]) / (escala[1] - escala[0])) * 100))
    barra = { desde: pct(min), ancho: pct(max) - pct(min), marca: temp == null ? pct(min) : pct(temp) }
  }

  const cifraVariable = (v) => {
    const l = lectura(v)
    const nivel = l ? nivelLectura(l.valor, umbral(v)) : null
    return {
      etiqueta: VARIABLE[v].corta,
      valor: num(l?.valor, VARIABLE[v].decimales),
      unidad: UNIDAD[v],
      sub: l ? (vivo ? rangoUmbral(umbral(v), UNIDAD[v]) : 'Última conocida') : 'Sin lecturas',
      tono: !l || !vivo ? 'tenue' : nivel === 'normal' ? 'verde' : 'peligro',
    }
  }
  const activos = dispositivos.filter(enLinea).length
  const pend = alertas.filter((a) => a.estado === 'PENDIENTE')
  const criticas = pend.filter((a) => a.nivel === 'PELIGRO').length
  return {
    principal: {
      etiqueta: `Temperatura · ${d.nombre}${vivo ? '' : ` · ${cuando}`}`,
      valor: num(temp),
      unidad: '°C',
      tonoValor: temp == null ? 'apagado' : vivo ? undefined : 'tenue',
      tonoUnidad: fuera && vivo ? 'peligro' : undefined,
      sub: temp == null
        ? 'Sin lecturas guardadas'
        : `${fuera ? 'Fuera de rango' : 'En rango'} · ${rangoUmbral(u, '°C')} · ${vivo ? cuando : 'sin conexión'}`,
      tonoSub: temp == null ? undefined : fuera ? 'peligro' : 'verde',
    },
    barra,
    cifras: [
      cifraVariable('HUM'),
      { etiqueta: 'En línea', valor: activos, unidad: `/ ${dispositivos.length}`, sub: `${dispositivos.length - activos} sin conexión` },
      cifraVariable('AIRE'),
      {
        etiqueta: 'Pendientes', valor: pend.length, tono: pend.length ? 'peligro' : undefined,
        sub: `${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}`,
      },
    ],
  }
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
      <div className="nc-card__head ui-panel-grafica__cabeza">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="nc-card__title">{info.etiqueta}</h3>
          <p className="nc-card__sub">
            <span className="ui-panel-grafica__umbral">
              {dispositivo?.nombre ?? 'Cargando dispositivo'} · umbral {rangoUmbral(u, unidad)}
            </span>
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
        <div className="ui-grafica">
          <EsqueletoGrafica alto="100%" />
        </div>
      )}
    </Card>
  )
}

export function PanelPage() {
  const { usuario, organizacion } = useSesion()
  const cat = useMonitoreo()
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
      {(dispositivos.length > 1 || cat.estado === 'cargando') && (
        <Select
          size="sm"
          icon="cpu"
          value={disp}
          disabled={!dispositivos.length}
          onChange={(e) => setElegido(e.target.value)}
          options={
            dispositivos.length
              ? dispositivos.map((d) => ({ value: String(d.num), label: `${d.nombre} · ${d.codigo_mqtt}` }))
              : [{ value: '', label: 'Cargando dispositivo seleccionado…' }]
          }
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
    <Pantalla {...encabezado} acciones={filtros} cifras={actual && cat.datos ? cifrasPanel(cat.datos, actual) : CIFRAS_CARGANDO}>
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
