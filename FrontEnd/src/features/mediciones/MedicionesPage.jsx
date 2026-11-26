import { useMemo, useState } from 'react'
import { Button, Card, PeriodFilter, StatusBadge } from '../../design-system/componentes/index.js'
import { Buscador } from '../../components/Buscador'
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
import { aviso } from '../../components/confirmacion'

// El estado usa los códigos de la API; el selector del encabezado habla con sus etiquetas.
const PERIODO = { Hoy: 'hoy', '7 días': '7', '30 días': '30' }
const ETIQUETA_PERIODO = { hoy: 'Hoy', 7: '7 días', 30: '30 días' }
// La banda elige la variable por su nombre corto; la API usa el código.
const CODIGO_VARIABLE = Object.fromEntries(Object.entries(VARIABLE).map(([codigo, v]) => [v.corta, codigo]))
const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'normal', label: 'Normal' },
  { value: 'warning', label: 'Advertencia' },
  { value: 'critical', label: 'Peligro' },
]

async function cargarCatalogo() {
  const [d, a] = await Promise.all([dispositivosApi.lista(), organizacionesApi.areas()])
  return { dispositivos: pagina(d), areas: pagina(a) }
}
// Lecturas por página: 600 son unas 200 mediciones (temperatura, humedad y aire de cada momento).
const TAMANO_PAGINA = 600
const paginaLecturas = (disp, rango, page) =>
  lecturasApi.lista({ dispositivo: disp, desde: rango.desde, hasta: rango.hasta, page_size: TAMANO_PAGINA, page })
// La API pagina por momento (nunca parte uno entre páginas) y `next` puede saltarse una página
// que quedaría vacía: la siguiente es la que indica `next`, no la actual + 1.
function paginaSiguiente(r) {
  if (!r?.next) return null
  try {
    return Number(new URL(r.next, window.location.origin).searchParams.get('page')) || null
  } catch {
    return null
  }
}

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
    siguiente: paginaSiguiente(lect),
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

// Texto de la fila que usa el buscador de la tabla (hora y fecha de la medición).
const textoFila = (f) => `${horaSeg(f.fecha_hora)} ${fechaCorta(f.fecha_hora)}`

// Estado de la fila: el peor nivel de sus tres variables contra sus umbrales.
function estadoFila(fila, umbrales) {
  return ['TEMP', 'HUM', 'AIRE']
    .map((v) => nivelLectura(fila[v], umbrales?.find((x) => x.variable === v)))
    .reduce((a, b) => (a === 'critical' || b === 'critical' ? 'critical' : a === 'warning' || b === 'warning' ? 'warning' : 'normal'))
}

export function MedicionesPage() {
  const { organizacion } = useSesion()
  const cat = useDatos(cargarCatalogo, [])
  const [elegido, setDisp] = useState('')
  const [variable, setVariable] = useState('HUM')
  const [periodo, setPeriodo] = useState('hoy')
  const [busqueda, setBusqueda] = useState('')
  const [estadoTabla, setEstadoTabla] = useState('')
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
      aviso('No se pudo exportar. Intenta de nuevo.', { tipo: 'error' })
    } finally {
      setExportando(false)
    }
  }

  // Siguiente página del histórico; si mientras tanto cambiaron los filtros, se descarta.
  const cargarMas = async () => {
    const base = lect.datos
    setCargandoMas(true)
    try {
      const r = await paginaLecturas(disp, base.rango, base.siguiente)
      lect.actualizar((d) =>
        d === base ? { ...d, lecturas: [...d.lecturas, ...pagina(r)], siguiente: paginaSiguiente(r) } : d,
      )
    } catch {
      aviso('No se pudieron cargar más lecturas. Intenta de nuevo.', { tipo: 'error' })
    } finally {
      setCargandoMas(false)
    }
  }

  const areas = cat.datos?.areas ?? []
  const actual = dispositivos.find((d) => d.num === Number(disp))
  const info = VARIABLE[variable]
  const unidad = UNIDAD[variable]
  const u = lect.datos?.umbrales.find((x) => x.variable === variable)

  // Nombre del dispositivo con su área al final cuando el usuario tiene más de una.
  const etiquetaDispositivo = (d) => {
    const area = areas.find((a) => a.num === d.area)
    return `${d.nombre} · ${d.codigo_mqtt}${areas.length > 1 && area ? ` · ${area.nombre}` : ''}`
  }

  // Al cambiar los filtros del encabezado se limpian los de la tabla.
  const cambiarDispositivo = (e) => {
    setDisp(e.target.value)
    setBusqueda('')
    setEstadoTabla('')
  }
  const cambiarPeriodo = (v) => {
    setPeriodo(PERIODO[v])
    setBusqueda('')
    setEstadoTabla('')
  }

  const nombrePeriodo = ETIQUETA_PERIODO[periodo].toLowerCase()
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

  // Filtros de la tabla: trabajan sobre las filas ya cargadas, sin pedir nada a la API.
  const q = busqueda.trim().toLowerCase()
  const filtrandoTabla = q !== '' || estadoTabla !== ''
  const filasVisibles = (vista?.filas ?? []).filter(
    (f) => (!q || textoFila(f).toLowerCase().includes(q)) && (!estadoTabla || estadoFila(f, lect.datos?.umbrales) === estadoTabla),
  )

  const controlesVariable = (
    <PeriodFilter
      label="Variable"
      options={['Temperatura', 'Humedad', 'Aire']}
      value={info.corta}
      onChange={(v) => setVariable(CODIGO_VARIABLE[v])}
    />
  )

  const cifras = vista?.serie.length
    ? {
        controles: controlesVariable,
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
        controles: controlesVariable,
        principal: {
          etiqueta: info.etiqueta,
          valor: '--.-',
          tonoValor: 'apagado',
          sub: vista ? `Sin lecturas de ${actual?.nombre ?? 'este dispositivo'} en este periodo` : 'Cargando lecturas…',
        },
      }

  const filtros = (
    <div className="ui-panel-filtros">
      {dispositivos.length > 1 && (
        <Select
          icon="cpu"
          value={disp}
          onChange={cambiarDispositivo}
          options={dispositivos.map((d) => ({ value: String(d.num), label: etiquetaDispositivo(d) }))}
        />
      )}
      <PeriodFilter value={ETIQUETA_PERIODO[periodo]} onChange={cambiarPeriodo} />
    </div>
  )

  return (
    <Pantalla
      eyebrow={`${organizacion} · lecturas cada ${actual?.intervalo_muestreo_seg ?? 60} s`}
      titulo="Histórico"
      acciones={filtros}
      cifras={cifras}
    >
      {lect.estado === 'error' ? (
        <EstadoError reintentar={lect.reintentar} />
      ) : (
        <Card className="nc-grow">
          <div className="nc-card__head ui-lecturas-cabeza" style={{ marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="nc-card__title">Lecturas</h3>
              <p className="nc-card__sub">
                {actual?.nombre} · {nombrePeriodo} · hora de medición y de recepción en la plataforma
                {lect.datos?.ultima && <span className="ui-aviso-ultima"> · {avisoUltima(lect.datos.ultima)}</span>}
              </p>
            </div>
            <div className="ui-lecturas-filtros">
              <Buscador valor={busqueda} cambiar={setBusqueda} placeholder="Buscar hora o fecha…" ancho={220} />
              <Select value={estadoTabla} onChange={(e) => setEstadoTabla(e.target.value)} options={ESTADOS} />
              <Button variant="secondary" icon="download" size="sm" disabled={!disp || exportando} onClick={exportar}>
                {exportando ? 'Exportando…' : 'Exportar CSV'}
              </Button>
            </div>
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
                {vista && !filasVisibles.length && (
                  <tr>
                    <td colSpan={5} className="ui-muted" style={{ textAlign: 'center', padding: '32px 0' }}>
                      {vista.filas.length ? 'Ninguna medición cargada coincide con el filtro' : 'Sin lecturas en este periodo'}
                    </td>
                  </tr>
                )}
                {filasVisibles.map((f) => {
                  const peor = estadoFila(f, lect.datos.umbrales)
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
                {filtrandoTabla
                  ? `${miles(filasVisibles.length)} de ${miles(vista.filas.length)} mediciones cargadas coinciden`
                  : lect.datos.siguiente
                    ? `Mostrando ${miles(vista.filas.length)} de ${miles(Math.round(lect.datos.total / 3))} mediciones`
                    : `${miles(vista.filas.length)} mediciones del periodo`}
              </span>
              {lect.datos.siguiente && (
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
