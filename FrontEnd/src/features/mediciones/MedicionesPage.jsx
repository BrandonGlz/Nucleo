import { useMemo, useState } from 'react'
import { Button, Card, Skeleton, StatusBadge } from '../../design-system/componentes/index.js'
import { Select } from '../../components/Desplegable'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as lecturasApi from '../../services/lecturas'
import * as organizacionesApi from '../../services/organizaciones'
import * as umbralesApi from '../../services/umbrales'
import { nivelLectura, pagina, rangoUmbral, UNIDAD, VARIABLE } from '../../utils/convertir'
import { fechaCorta, horaSeg, miles, num, puntoSerie } from '../../utils/formato'
import { useSesion } from '../../context/SesionContext'

const PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
]

async function cargarCatalogo() {
  const [d, a] = await Promise.all([dispositivosApi.lista(), organizacionesApi.areas()])
  return { dispositivos: pagina(d), areas: pagina(a) }
}
async function cargarLecturas(disp, variable, periodo) {
  const [serie, lect, umb] = await Promise.all([
    lecturasApi.serie(disp, variable, periodo),
    lecturasApi.lista({ dispositivo: disp, desde: lecturasApi.rangoPeriodo(periodo).desde }),
    umbralesApi.lista(disp),
  ])
  return { serie, lecturas: pagina(lect), umbrales: pagina(umb) }
}

// Junta las lecturas de las tres variables que se midieron en el mismo momento en una fila.
function filasPorMomento(lecturas) {
  const grupos = new Map()
  for (const l of lecturas) {
    const g = grupos.get(l.fecha_hora) ?? { fecha_hora: l.fecha_hora, recibida_en: l.recibida_en }
    g[l.variable_codigo] = l.valor
    grupos.set(l.fecha_hora, g)
  }
  return [...grupos.values()].sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1))
}

export function MedicionesPage() {
  const { organizacion } = useSesion()
  const cat = useDatos(cargarCatalogo, [])
  const [area, setArea] = useState('')
  const [elegido, setDisp] = useState('')
  const [variable, setVariable] = useState('HUM')
  const [periodo, setPeriodo] = useState('hoy')
  const dispositivos = cat.datos?.dispositivos ?? []
  // Mientras no se elige uno, se muestra el primer dispositivo del alcance del usuario.
  const disp = elegido || String(dispositivos[0]?.num ?? '')
  const lect = useDatos(
    () => (disp ? cargarLecturas(disp, variable, periodo) : new Promise(() => {})),
    [disp, variable, periodo],
  )

  const areas = cat.datos?.areas ?? []
  const visibles = dispositivos.filter((d) => !area || d.area === Number(area))
  const actual = dispositivos.find((d) => d.num === Number(disp))
  const info = VARIABLE[variable]
  const unidad = UNIDAD[variable]
  const u = lect.datos?.umbrales.find((x) => x.variable === variable)

  const nombrePeriodo = PERIODOS.find((p) => p.value === periodo).label.toLowerCase()
  const vista = useMemo(() => {
    if (!lect.datos) return null
    const serie = lect.datos.serie.map((p) => puntoSerie(p, periodo))
    const valores = lect.datos.serie.map((p) => Number(p.promedio))
    const max = Math.max(...valores)
    const min = Math.min(...valores)
    const prom = valores.reduce((a, b) => a + b, 0) / (valores.length || 1)
    const sobre = u ? lect.datos.serie.filter((p) => Number(p.promedio) > Number(u.peligro_max)) : []
    return { serie, max, min, prom, sobre, filas: filasPorMomento(lect.datos.lecturas) }
  }, [lect.datos, u, periodo])

  const cifras = vista?.serie.length
    ? {
        principal: {
          etiqueta: `${info.etiqueta} · ${nombrePeriodo} · ${actual?.nombre ?? ''}`,
          valor: num(vista.max, info.decimales),
          unidad,
          tonoUnidad: vista.sobre.length ? 'peligro' : undefined,
          tonoSub: vista.sobre.length ? 'peligro' : 'verde',
          sub: vista.sobre.length
            ? `Máximo · ${vista.sobre.length} ${periodo === '30' ? 'días' : 'horas'} sobre el máximo · desde ${vista.serie[lect.datos.serie.indexOf(vista.sobre[0])].time}`
            : `Máximo · en rango ${rangoUmbral(u, unidad)}`,
        },
        cifras: [
          { etiqueta: 'Mínimo', valor: num(vista.min, info.decimales), unidad },
          { etiqueta: 'Promedio', valor: num(vista.prom, info.decimales), unidad, tono: 'verde' },
          { etiqueta: 'Lecturas', valor: miles(lect.datos.lecturas.length / 3), sub: `Cada ${actual?.intervalo_muestreo_seg ?? 30} s` },
        ],
      }
    : {
        principal: {
          etiqueta: info.etiqueta,
          valor: '--.-',
          tonoValor: 'apagado',
          sub: vista ? `Sin lecturas de ${actual?.nombre ?? 'este dispositivo'} en este periodo` : 'Cargando lecturas…',
        },
      }

  return (
    <Pantalla eyebrow={`${organizacion} · lecturas cada ${actual?.intervalo_muestreo_seg ?? 30} s`} titulo="Histórico" cifras={cifras}>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 16 }}>
          <Select
            label="Área"
            icon="map-pin"
            value={area}
            onChange={(e) => {
              setArea(e.target.value)
              const primero = dispositivos.find((d) => !e.target.value || d.area === Number(e.target.value))
              setDisp(primero ? String(primero.num) : '')
            }}
            options={[{ value: '', label: 'Todas las áreas' }, ...areas.map((a) => ({ value: String(a.num), label: a.nombre }))]}
          />
          <Select
            label="Dispositivo"
            icon="cpu"
            value={disp}
            onChange={(e) => setDisp(e.target.value)}
            options={visibles.map((d) => ({ value: String(d.num), label: `${d.nombre} · ${d.codigo_mqtt}` }))}
          />
          <Select
            label="Variable"
            icon={info.icono}
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
            options={Object.entries(VARIABLE).map(([value, v]) => ({ value, label: v.etiqueta }))}
          />
          <Select label="Periodo" icon="calendar" value={periodo} onChange={(e) => setPeriodo(e.target.value)} options={PERIODOS} />
        </div>
      </Card>
      {lect.estado === 'error' ? (
        <EstadoError reintentar={lect.reintentar} />
      ) : (
        <div className="ui-fila" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)' }}>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">{info.etiqueta} · {nombrePeriodo}</h3>
                <p className="nc-card__sub">
                  {actual?.nombre} · umbral {rangoUmbral(u, unidad)}
                </p>
              </div>
            </div>
            {vista ? (
              <GraficaAjustable
                data={vista.serie}
                unit={unidad}
                threshold={u ? { min: Number(u.peligro_min), max: Number(u.peligro_max) } : undefined}
                minimo={160}
                vacio={`Sin lecturas de ${actual?.nombre ?? 'este dispositivo'} en este periodo`}
              />
            ) : (
              <Skeleton height={160} />
            )}
          </Card>
          <Card className="nc-grow">
            <div className="nc-card__head" style={{ marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Lecturas</h3>
                <p className="nc-card__sub">{actual?.nombre} · hora de medición y de recepción en la plataforma</p>
              </div>
              <Button variant="secondary" icon="download" size="sm">
                Exportar
              </Button>
            </div>
            <div className="nc-table-wrap nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Medición</th>
                    <th>Temperatura</th>
                    <th>Humedad</th>
                    <th>Aire</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {vista && !vista.filas.length && (
                    <tr>
                      <td colSpan={5} className="ui-muted" style={{ textAlign: 'center', padding: '32px 0' }}>
                        Sin lecturas en este periodo
                      </td>
                    </tr>
                  )}
                  {(vista?.filas ?? []).map((f) => {
                    const peor = ['TEMP', 'HUM', 'AIRE']
                      .map((v) => nivelLectura(f[v], lect.datos.umbrales.find((x) => x.variable === v)))
                      .reduce((a, b) => (a === 'critical' || b === 'critical' ? 'critical' : a === 'warning' || b === 'warning' ? 'warning' : 'normal'))
                    const resalta = (v) => (v === variable ? 'ui-num ui-strong' : 'ui-num')
                    return (
                      <tr key={f.fecha_hora}>
                        <td className="ui-num">
                          <strong className="ui-strong">{horaSeg(f.fecha_hora)}</strong>
                          <span className="ui-muted"> · {fechaCorta(f.fecha_hora)}</span>
                          <div className="ui-muted" style={{ fontSize: 12 }}>
                            Recibida {horaSeg(f.recibida_en)}
                          </div>
                        </td>
                        <td className={resalta('TEMP')}>{num(f.TEMP)} °C</td>
                        <td className={resalta('HUM')}>{num(f.HUM)} %HR</td>
                        <td className={resalta('AIRE')}>{num(f.AIRE, 0)} ppm</td>
                        <td>
                          <StatusBadge status={peor} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
