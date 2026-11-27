/* eslint-disable react/set-state-in-effect -- el tablero y los filtros se inicializan al llegar la API */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input, Skeleton } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { Modal } from '../../components/Modal'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as organizacionesApi from '../../services/organizaciones'
import * as analiticaApi from '../../services/analitica'
import { EVENTO, escucharPanel } from '../../services/tiempoReal'
import { pagina } from '../../utils/convertir'
import { periodo as periodoTexto } from '../../utils/formato'
import { BarraFiltros } from './BarraFiltros'
import { Lienzo } from './Lienzo'
import { ListaTableros } from './ListaTableros'
import { PaginasTablero } from './PaginasTablero'
import { Tarjeta } from './Tarjeta'
import { exportarPng, nombrePng } from './exportar'
import { filtrosDelTablero, leerUrl, parametrosUrl, variableElegida } from './datos'

const TABLERO_EJECUTIVO = 'Ejecutivo'

function useConsulta({ tarjetas, filtros, cruzado, activo, incluyeAhora }) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null })
  const [vuelta, setVuelta] = useState(0)
  const tarjetasJson = JSON.stringify(tarjetas)
  const filtrosJson = JSON.stringify(filtros)
  const cruzadoJson = JSON.stringify(cruzado)
  const tarjetasRef = useRef(tarjetasJson)
  useEffect(() => {
    if (!activo || !tarjetas.length) return undefined
    const control = new AbortController()
    let vivo = true
    const cambioPagina = tarjetasRef.current !== tarjetasJson
    tarjetasRef.current = tarjetasJson
    setRes((r) => ({
      ...r,
      estado: 'cargando',
      datos: cambioPagina ? null : r.datos,
      error: null,
    }))
    analiticaApi
      .consultar({ tarjetas, filtros, cruzado, signal: control.signal })
      .then((datos) => vivo && setRes({ estado: 'listo', datos, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return
        if (vivo) setRes((r) => ({ ...r, estado: 'error', error }))
      })
    return () => {
      vivo = false
      control.abort()
    }
    // Las claves normalizadas evitan repetir la consulta por cambios de referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, tarjetasJson, filtrosJson, cruzadoJson, vuelta])
  useEffect(() => {
    if (!activo) return undefined
    const desuscribir = escucharPanel()
    let timer
    const alEvento = () => {
      if (document.visibilityState === 'hidden') return
      clearTimeout(timer)
      timer = setTimeout(() => setVuelta((v) => v + 1), 5000)
    }
    const alVolver = () => {
      if (document.visibilityState === 'visible') setVuelta((v) => v + 1)
    }
    window.addEventListener(EVENTO, alEvento)
    document.addEventListener('visibilitychange', alVolver)
    const intervalo = incluyeAhora ? setInterval(() => {
      if (document.visibilityState !== 'hidden') setVuelta((v) => v + 1)
    }, 60000) : null
    return () => {
      desuscribir()
      clearTimeout(timer)
      clearInterval(intervalo)
      window.removeEventListener(EVENTO, alEvento)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activo, incluyeAhora])
  return { ...res, refrescar: () => setVuelta((v) => v + 1) }
}

function textoFiltros(filtros) {
  const partes = []
  if (filtros.periodo) partes.push(filtros.periodo)
  if (filtros.variable) partes.push(variableElegida(filtros.variable))
  if (filtros.areas.length) partes.push(`${filtros.areas.length} área(s)`)
  if (filtros.dispositivos.length) partes.push(`${filtros.dispositivos.length} dispositivo(s)`)
  return partes.join(' · ')
}

function Impresion({ paginas, tablero, organizacion, filtros, periodo, hallazgos }) {
  return (
    <div className="ui-analitica__impresion" aria-hidden="true">
      {paginas.map(({ pagina: paginaActual, datos }) => (
        <section key={paginaActual.id} className="ui-analitica__hoja-impresa">
          <header>
            <strong>{organizacion} · {tablero} · {paginaActual.nombre}</strong>
            <span>{periodo} · {textoFiltros(filtros)}</span>
          </header>
          <div className="ui-analitica__lienzo ui-analitica__lienzo--impreso">
            {paginaActual.tarjetas.map((tarjeta) => (
              <Tarjeta
                key={tarjeta.id}
                tarjeta={tarjeta}
                datos={datos?.tarjetas?.[tarjeta.id]}
                cargando={!datos}
                alto={Math.max(70, tarjeta.h * 58)}
                hallazgos={hallazgos?.[tarjeta.id]}
                impresion
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function AnaliticaPage() {
  const { organizacion, rol } = useSesion()
  const [searchParams, setSearchParams] = useSearchParams()
  const [inicial] = useState(() => leerUrl(searchParams))
  const [tableroNum, setTableroNum] = useState(inicial.tablero)
  const [paginaId, setPaginaId] = useState(inicial.pagina)
  const [filtros, setFiltros] = useState(inicial.filtros)
  const [cruzado, setCruzado] = useState(null)
  const [listaAbierta, setListaAbierta] = useState(() => window.innerWidth >= 1280)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [desdeNuevo, setDesdeNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const [errorNuevo, setErrorNuevo] = useState('')
  const [aviso, setAviso] = useState('')
  const [hallazgos, setHallazgos] = useState({})
  const [generandoHallazgos, setGenerando] = useState({})
  const [errorHallazgos, setErrorHallazgos] = useState({})
  const [impresion, setImpresion] = useState(null)
  const [pendientePrint, setPendientePrint] = useState(false)
  const lienzo = useRef(null)

  const tablerosConsulta = useDatos(() => analiticaApi.tableros().then(pagina), [])
  const catalogos = useDatos(
    () => Promise.all([organizacionesApi.areas(), dispositivosApi.lista()]).then(([areas, dispositivos]) => ({ areas: pagina(areas), dispositivos: pagina(dispositivos) })),
    [],
  )
  const tableros = useMemo(() => tablerosConsulta.datos || [], [tablerosConsulta.datos])
  const areas = useMemo(() => catalogos.datos?.areas || [], [catalogos.datos])
  const dispositivos = useMemo(() => catalogos.datos?.dispositivos || [], [catalogos.datos])
  const tablero = tableros.find((t) => t.num === tableroNum)
  const paginas = tablero?.conf?.paginas || []
  const paginaActual = paginas.find((p) => p.id === paginaId) || paginas[0]
  const tarjetas = paginaActual?.tarjetas || []

  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    if (!tableros.length) return
    const encontrado = tableros.find((t) => t.num === tableroNum)
    const predeterminado = tableros.find((t) => t.predeterminado)
    const ejecutivo = tableros.find((t) => t.nombre === TABLERO_EJECUTIVO)
    const elegido = encontrado || predeterminado || ejecutivo || tableros[0]
    if (elegido.num !== tableroNum) {
      setTableroNum(elegido.num)
      setPaginaId(elegido.conf?.paginas?.[0]?.id || null)
      setFiltros((f) => ({ ...filtrosDelTablero(elegido), ...(f.areas.length ? { areas: f.areas } : {}) }))
      return
    }
    if (!elegido.conf?.paginas?.some((p) => p.id === paginaId)) setPaginaId(elegido.conf?.paginas?.[0]?.id || null)
    if (filtros.periodo == null) setFiltros((f) => ({ ...f, periodo: elegido.conf?.filtros?.periodo || '30d' }))
    if (filtros.variable == null) setFiltros((f) => ({ ...f, variable: elegido.conf?.filtros?.variable || 'TEMP' }))
  }, [tableros, tableroNum, paginaId, filtros.periodo, filtros.variable])

  useEffect(() => {
    if (!tableroNum || !paginaId || filtros.periodo == null) return
    setSearchParams(parametrosUrl({ tablero: tableroNum, pagina: paginaId, filtros }), { replace: true })
  }, [tableroNum, paginaId, filtros, setSearchParams])

  useEffect(() => {
    if (!cruzado) return undefined
    const alEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCruzado(null)
      }
    }
    document.addEventListener('keydown', alEscape)
    return () => document.removeEventListener('keydown', alEscape)
  }, [cruzado])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)')
    const cambiar = () => setListaAbierta(!mq.matches)
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
  }, [])

  useEffect(() => {
    if (!pendientePrint || !impresion) return
    const timer = setTimeout(() => {
      window.print()
      setPendientePrint(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [pendientePrint, impresion])

  const incluyeAhora = filtros.periodo !== 'mes_anterior'
  const consulta = useConsulta({ tarjetas, filtros, cruzado, activo: Boolean(tablero && paginaActual && filtros.periodo != null), incluyeAhora })
  const datosPagina = consulta.datos
  const generado = datosPagina?.generado || null

  const seleccionarTablero = (siguiente) => {
    if (!siguiente) return
    setTableroNum(siguiente.num)
    setPaginaId(siguiente.conf?.paginas?.[0]?.id || null)
    setFiltros(filtrosDelTablero(siguiente))
    setCruzado(null)
    if (window.innerWidth < 900) setListaAbierta(false)
  }
  const cambiarPagina = (id) => {
    setPaginaId(id)
    setCruzado(null)
  }
  const cambiarFiltros = (cambios) => {
    setFiltros((f) => {
      const siguiente = { ...f, ...cambios }
      if (cambios.areas) {
        siguiente.dispositivos = (cambios.dispositivos || f.dispositivos).filter((num) => {
          const d = dispositivos.find((item) => item.num === num)
          return d && (!cambios.areas.length || cambios.areas.includes(d.area))
        })
      }
      return siguiente
    })
  }
  const seleccionarCruzado = (tarjeta, seleccion) => {
    if (!seleccion?.dimension || seleccion.valor == null) return
    setCruzado((actual) => {
      if (actual && actual.dimension === seleccion.dimension && String(actual.valor) === String(seleccion.valor)) return null
      return { ...seleccion, origen: tarjeta.id }
    })
  }
  const etiquetaCruzado = useMemo(() => {
    if (!cruzado) return ''
    if (cruzado.dimension === 'area') return areas.find((a) => String(a.num) === String(cruzado.valor))?.nombre || `Área ${cruzado.valor}`
    if (cruzado.dimension === 'dispositivo') return dispositivos.find((d) => String(d.num) === String(cruzado.valor))?.nombre || `Dispositivo ${cruzado.valor}`
    if (cruzado.dimension === 'variable') return variableElegida(cruzado.valor)
    return String(cruzado.valor)
  }, [cruzado, areas, dispositivos])

  const exportar = async (tipo) => {
    try {
      setAviso('')
      if (tipo === 'png') {
        await exportarPng(lienzo.current, nombrePng(tablero?.nombre, paginaActual?.nombre))
      } else {
        const paginasDatos = await Promise.all(
          paginas.map((p) => analiticaApi.consultar({ tarjetas: p.tarjetas, filtros, cruzado }).then((datos) => ({ pagina: p, datos }))),
        )
        setImpresion({ paginas: paginasDatos, tablero: tablero?.nombre, organizacion, filtros, periodo: datosPagina ? periodoTexto(datosPagina.periodo.inicio, datosPagina.periodo.fin) : '' })
        setPendientePrint(true)
      }
    } catch (error) {
      setAviso(error.message || 'No se pudo exportar.')
    }
  }
  const exportarCsv = async (tarjeta) => {
    try {
      setAviso('')
      await analiticaApi.descargarCsvTarjeta({ tarjeta, filtros, cruzado })
    } catch (error) {
      setAviso(error.message || 'No se pudo descargar el CSV.')
    }
  }
  const crearNuevo = async () => {
    const nombre = nombreNuevo.trim()
    if (!nombre) {
      setErrorNuevo('Escribe un nombre para el tablero.')
      return
    }
    setCreando(true)
    setErrorNuevo('')
    try {
      const creado = await analiticaApi.crearTablero({ nombre, desde: desdeNuevo ? Number(desdeNuevo) : undefined })
      const lista = pagina(await analiticaApi.tableros())
      tablerosConsulta.actualizar(() => lista)
      const actual = lista.find((t) => t.num === creado.num) || creado
      seleccionarTablero(actual)
      setNuevoAbierto(false)
      setNombreNuevo('')
      setDesdeNuevo('')
    } catch {
      setErrorNuevo('No se pudo crear el tablero.')
    } finally {
      setCreando(false)
    }
  }
  const generarHallazgos = async (tarjeta) => {
    setGenerando((m) => ({ ...m, [tarjeta.id]: true }))
    setErrorHallazgos((m) => ({ ...m, [tarjeta.id]: null }))
    try {
      const respuesta = await analiticaApi.hallazgos({ tarjetas, filtros, cruzado })
      setHallazgos((m) => ({ ...m, [tarjeta.id]: respuesta }))
    } catch {
      setErrorHallazgos((m) => ({ ...m, [tarjeta.id]: true }))
    } finally {
      setGenerando((m) => ({ ...m, [tarjeta.id]: false }))
    }
  }

  if (tablerosConsulta.estado === 'error') {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><EstadoError reintentar={tablerosConsulta.reintentar} /></Pantalla>
  }
  if (!tableros.length && tablerosConsulta.estado === 'cargando') {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><div className="ui-analitica__cargando-pagina"><Skeleton height={36} /><Skeleton height={220} /></div></Pantalla>
  }
  if (!tableros.length) {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><EmptyState icon="layout-dashboard" title="Sin tableros" message="No hay tableros disponibles para tu organización." /></Pantalla>
  }

  const acciones = ['ADMIN', 'SUPER'].includes(rol) ? (
    <Button icon="plus" onClick={() => setNuevoAbierto(true)}>Nuevo tablero</Button>
  ) : undefined
  return (
    <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo={tablero?.nombre || 'Analítica'} acciones={acciones}>
      <div className={`ui-analitica${listaAbierta ? ' is-lista-abierta' : ''}`}>
        <ListaTableros
          tableros={tableros}
          actual={tablero}
          onSelect={seleccionarTablero}
          abierta={listaAbierta}
          alCerrar={() => setListaAbierta(false)}
        />
        <section className="ui-analitica__vista">
          <Card className="ui-analitica__panel">
          <BarraFiltros
            tablero={tablero}
            tableros={tableros}
            filtros={filtros}
            areas={areas}
            dispositivos={dispositivos}
            cruzado={cruzado}
            etiquetaCruzado={etiquetaCruzado}
            listaAbierta={listaAbierta}
            alAlternarLista={() => setListaAbierta((v) => !v)}
            alCambiarTablero={seleccionarTablero}
            alCambiarFiltros={cambiarFiltros}
            alQuitarCruzado={() => setCruzado(null)}
            alExportar={exportar}
            alRefrescar={consulta.refrescar}
            generado={generado}
            actualizando={consulta.estado === 'cargando' && !datosPagina}
          />
          {aviso && <div className="ui-analitica__aviso" role="status">{aviso}</div>}
          {consulta.error && !datosPagina ? (
            <EstadoError reintentar={consulta.refrescar} />
          ) : (
            <Lienzo
              pagina={paginaActual}
              datosPagina={datosPagina}
              cargando={!datosPagina}
              cruzado={cruzado}
              alSeleccionar={seleccionarCruzado}
              alQuitarFiltro={() => setCruzado(null)}
              alExportar={exportarCsv}
              alGenerarHallazgos={generarHallazgos}
              generandoHallazgos={generandoHallazgos}
              hallazgos={hallazgos}
              errorHallazgos={errorHallazgos}
              alReintentar={consulta.refrescar}
              innerRef={lienzo}
            />
          )}
          <PaginasTablero paginas={paginas} actual={paginaActual?.id} onCambiar={cambiarPagina} />
          </Card>
        </section>
      </div>
      {impresion && <Impresion {...impresion} hallazgos={hallazgos} />}
      {nuevoAbierto && (
        <Modal
          titulo="Nuevo tablero"
          sub="Elige un nombre y, si quieres, una plantilla para empezar."
          cerrar={() => setNuevoAbierto(false)}
          cerrarConEscape
          acciones={<Button onClick={crearNuevo} disabled={creando}>{creando ? 'Creando…' : 'Crear tablero'}</Button>}
        >
          <div className="ui-analitica__nuevo">
            <Input label="Nombre" value={nombreNuevo} maxLength={80} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Mi tablero" />
            <Desplegable
              label="Empezar desde"
              value={desdeNuevo}
              onChange={setDesdeNuevo}
              options={[{ value: '', label: 'En blanco' }, ...tableros.map((t) => ({ value: t.num, label: t.nombre }))]}
            />
            {errorNuevo && <p className="ui-analitica__error">{errorNuevo}</p>}
          </div>
        </Modal>
      )}
    </Pantalla>
  )
}
