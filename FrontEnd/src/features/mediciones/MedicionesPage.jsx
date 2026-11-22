import { useMemo, useState } from 'react'
import { Button, Card, StatusBadge } from '../../design-system/componentes/index.js'
import { Select } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as lecturasApi from '../../services/lecturas'
import * as organizacionesApi from '../../services/organizaciones'
import * as umbralesApi from '../../services/umbrales'
import * as seguridad from '../../services/seguridad'
import { LECTURAS_EXPORTAR } from '../../api'
import { nivelLectura, pagina, rangoUmbral, UNIDAD, VARIABLE } from '../../utils/convertir'
import { avisoUltima, fechaCorta, horaSeg, miles, num, puntoSerie } from '../../utils/formato'
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
// Lecturas por página: 600 son unas 200 mediciones (temperatura, humedad y aire de cada momento).
const TAMANO_PAGINA = 600
const paginaLecturas = (disp, rango, page) =>
  lecturasApi.lista({ dispositivo: disp, desde: rango.desde, hasta: rango.hasta, page_size: TAMANO_PAGINA, page })

// La serie solo alimenta las cifras clave (máximo, mínimo y promedio del periodo); la tabla
// trae el histórico real del periodo por páginas («Cargar más»).
async function cargarLecturas(disp, variable, periodo) {
  const rango = await lecturasApi.rangoConDatos(disp, variable, periodo)
  const [serie, lect, umb] = await Promise.all([
    lecturasApi.serie(disp, variable, rango),
    paginaLecturas(disp, rango, 1),
    umbralesApi.lista(disp),
  ])
  const lecturas = pagina(lect)
  return {
    serie,
    rango,
    lecturas,
    total: lect?.count ?? lecturas.length,
    pagina: 1,
    hayMas: Boolean(lect?.next),
    umbrales: pagina(umb),
    ultima: rango.ultima,
  }
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
  const [exportando, setExportando] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const dispositivos = cat.datos?.dispositivos ?? []
  // Mientras no se elige uno, se muestra el primer dispositivo del alcance del usuario.
  const disp = elegido || String(dispositivos[0]?.num ?? '')
  const lect = useDatos(
    () => (disp ? cargarLecturas(disp, variable, periodo) : new Promise(() => {})),
    [disp, variable, periodo],
  )

  // CSV del dispositivo, la variable y el periodo elegidos (GET /lecturas/exportar/).
  const exportar = async () => {
    setExportando(true)
    try {
      const { desde } = lecturasApi.rangoPeriodo(periodo)
      await seguridad.descargarCsv(LECTURAS_EXPORTAR, { dispositivo: disp, variable, desde })
    } catch {
      window.alert('No se pudo exportar. Intenta de nuevo.')
    } finally {
      setExportando(false)
    }
  }

  // Siguiente página del histórico; si mientras tanto cambiaron los filtros, se descarta.
  const cargarMas = async () => {
    const base = lect.datos
    setCargandoMas(true)
    try {
      const r = await paginaLecturas(disp, base.rango, base.pagina + 1)
      lect.actualizar((d) =>
        d === base
          ? { ...d, lecturas: [...d.lecturas, ...pagina(r)], pagina: d.pagina + 1, hayMas: Boolean(r?.next) }
          : d,
      )
    } catch {
      window.alert('No se pudieron cargar más lecturas. Intenta de nuevo.')
    } finally {
      setCargandoMas(false)
    }
  }

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
          { etiqueta: 'Lecturas', valor: miles(Math.round(lect.datos.total / 3)), sub: `Cada ${actual?.intervalo_muestreo_seg ?? 60} s` },
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
    <Pantalla eyebrow={`${organizacion} · lecturas cada ${actual?.intervalo_muestreo_seg ?? 60} s`} titulo="Histórico" cifras={cifras}>
      <Card>
        <div className="ui-rejilla-filtros" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))', gap: 16 }}>
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
        <Card className="nc-grow">
          <div className="nc-card__head" style={{ marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="nc-card__title">Lecturas</h3>
              <p className="nc-card__sub">
                {actual?.nombre} · {nombrePeriodo} · hora de medición y de recepción en la plataforma
                {lect.datos?.ultima && <span className="ui-aviso-ultima"> · {avisoUltima(lect.datos.ultima)}</span>}
              </p>
            </div>
            <Button variant="secondary" icon="download" size="sm" disabled={!disp || exportando} onClick={exportar}>
              {exportando ? 'Exportando…' : 'Exportar CSV'}
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
          {vista && vista.filas.length > 0 && (
            <div className="ui-lecturas-pie">
              <span className="ui-muted">
                {lect.datos.hayMas
                  ? `Mostrando ${miles(vista.filas.length)} de ${miles(Math.round(lect.datos.total / 3))} mediciones`
                  : `${miles(vista.filas.length)} mediciones del periodo`}
              </span>
              {lect.datos.hayMas && (
                <Button variant="secondary" size="sm" icon="chevron-down" disabled={cargandoMas} onClick={cargarMas}>
                  {cargandoMas ? 'Cargando…' : 'Cargar más'}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </Pantalla>
  )
}
