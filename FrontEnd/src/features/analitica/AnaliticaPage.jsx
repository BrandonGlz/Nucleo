/* eslint-disable react/set-state-in-effect -- el tablero y los filtros se inicializan al llegar la API */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input, Skeleton } from '../../design-system/componentes/index.js'
import { confirmar } from '../../components/confirmacion'
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
import { fechaLarga, periodo as periodoTexto } from '../../utils/formato'
import { BarraFiltros } from './BarraFiltros'
import { LIMITES, TIPOS, metaSugerida } from './catalogo'
import { EditorTablero } from './EditorTablero'
import { Lienzo } from './Lienzo'
import { ListaTableros } from './ListaTableros'
import { PaginasTablero } from './PaginasTablero'
import { Tarjeta } from './Tarjeta'
import { cabeTarjeta, clonar, nuevoIdPagina, nuevoIdTarjeta, opcionesIniciales, primerHueco } from './editorRejilla'
import { exportarPng, nombrePng } from './exportar'
import { PERIODOS, VARIABLES, filtrosDelTablero, leerUrl, parametrosUrl, variableElegida } from './datos'

const TABLERO_EJECUTIVO = 'Ejecutivo'

function useConsulta({ tarjetas, filtros, cruzado, activo, incluyeAhora, clavePagina, retraso = 0, enVivo = true, mantener = false }) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null })
  const [vuelta, setVuelta] = useState(0)
  const tarjetasJson = JSON.stringify(tarjetas)
  const filtrosJson = JSON.stringify(filtros)
  const cruzadoJson = JSON.stringify(cruzado)
  const claveRef = useRef(clavePagina ?? tarjetasJson)
  useEffect(() => {
    if (!activo || !tarjetas.length) return undefined
    const control = new AbortController()
    let vivo = true
    let timer = null
    const clave = clavePagina ?? tarjetasJson
    const cambioPagina = claveRef.current !== clave
    claveRef.current = clave
    setRes((r) => ({
      ...r,
      estado: 'cargando',
      datos: mantener ? r.datos : cambioPagina ? null : r.datos,
      error: null,
    }))
    const consultar = () => {
      analiticaApi
        .consultar({ tarjetas, filtros, cruzado, signal: control.signal })
        .then((datos) => vivo && setRes({ estado: 'listo', datos, error: null }))
        .catch((error) => {
          if (error.name === 'AbortError') return
          if (vivo) setRes((r) => ({ ...r, estado: 'error', error }))
        })
    }
    if (retraso) timer = setTimeout(consultar, retraso)
    else consultar()
    return () => {
      vivo = false
      clearTimeout(timer)
      control.abort()
    }
    // Las claves normalizadas evitan repetir la consulta por cambios de referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, tarjetasJson, filtrosJson, cruzadoJson, vuelta, clavePagina, retraso, mantener])
  useEffect(() => {
    if (!activo || !enVivo) return undefined
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
  }, [activo, incluyeAhora, enVivo])
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
  const [listaAbierta, setListaAbierta] = useState(() => window.innerWidth >= 1600)
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
  const [versionesAbiertas, setVersionesAbiertas] = useState(false)
  const [versiones, setVersiones] = useState(null)
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(null)
  const [metaBorrador, setMetaBorrador] = useState({ nombre: '', descripcion: '' })
  const [seleccion, setSeleccion] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [errorEditor, setErrorEditor] = useState('')
  const [configAbierta, setConfigAbierta] = useState(false)
  const [errorConfig, setErrorConfig] = useState('')
  const [erroresConfig, setErroresConfig] = useState({})
  const lienzo = useRef(null)
  const guardiaHistorial = useRef(false)
  const editorRef = useRef({ editando: false, sucio: false })
  const navigate = useNavigate()
  const location = useLocation()

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
  const paginasEditor = borrador?.paginas || []
  const paginaEditor = paginasEditor.find((p) => p.id === paginaId) || paginasEditor[0]
  const paginaConsulta = editando ? paginaEditor : paginaActual
  const tarjetasVista = paginaActual?.tarjetas || []
  const tarjetasEditor = paginaEditor?.tarjetas || []
  const tarjetas = editando ? tarjetasEditor : tarjetasVista
  const sucio = Boolean(
    editando &&
      borrador &&
      tablero &&
      (JSON.stringify(borrador) !== JSON.stringify(tablero.conf) ||
        metaBorrador.nombre !== tablero.nombre ||
        metaBorrador.descripcion !== (tablero.descripcion || '')),
  )

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
    const paginasValidas = editando ? borrador?.paginas : elegido.conf?.paginas
    if (paginasValidas && !paginasValidas.some((p) => p.id === paginaId)) setPaginaId(paginasValidas[0]?.id || null)
    if (filtros.periodo == null) setFiltros((f) => ({ ...f, periodo: elegido.conf?.filtros?.periodo || '30d' }))
    if (filtros.variable == null) setFiltros((f) => ({ ...f, variable: elegido.conf?.filtros?.variable || 'TEMP' }))
  }, [tableros, tableroNum, paginaId, filtros.periodo, filtros.variable, editando, borrador])

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
    const mq = window.matchMedia('(max-width: 1599px)')
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
  const consulta = useConsulta({
    tarjetas,
    filtros,
    cruzado,
    activo: Boolean(tablero && paginaConsulta && filtros.periodo != null),
    incluyeAhora,
    clavePagina: paginaConsulta?.id,
    retraso: editando ? 400 : 0,
    enVivo: !editando,
    mantener: editando,
  })
  const datosPagina = consulta.datos
  const generado = datosPagina?.generado || null

  const textoError = (valor) => (Array.isArray(valor) ? valor[0] : typeof valor === 'string' ? valor : '')

  const mensajeError = (error) => {
    const datos = error?.datos
    if (datos && typeof datos === 'object') {
      const primero = Object.values(datos)
        .flatMap((valor) => (Array.isArray(valor) ? valor : [valor]))
        .find(Boolean)
      if (primero) return String(primero)
    }
    return error?.message || 'No se pudo guardar el tablero.'
  }

  const salirEdicion = () => {
    if (guardiaHistorial.current) {
      guardiaHistorial.current = false
      window.history.replaceState({ ...(window.history.state || {}), analiticaEditor: false }, '', window.location.href)
    }
    setEditando(false)
    setBorrador(null)
    setSeleccion(null)
    setErrorEditor('')
    setGuardando(false)
  }

  const confirmarSalida = async (mensaje) => {
    if (!sucio) return true
    const ok = await confirmar({
      titulo: 'Cambios sin guardar',
      mensaje,
      confirmar: 'Salir sin guardar',
      peligro: true,
    })
    return ok
  }

  const abrirConfiguracion = () => {
    setErrorConfig('')
    setErroresConfig({})
    setConfigAbierta(true)
  }

  const iniciarEdicion = async () => {
    if (!tablero || !['ADMIN', 'SUPER'].includes(rol)) return
    setErrorEditor('')
    try {
      let objetivo = tablero
      if (tablero.es_plantilla) {
        objetivo = await analiticaApi.crearTablero({ desde: tablero.num })
        const lista = pagina(await analiticaApi.tableros())
        tablerosConsulta.actualizar(() => lista)
        setTableroNum(objetivo.num)
        setCruzado(null)
        setFiltros(filtrosDelTablero(objetivo))
      }
      const conf = JSON.parse(JSON.stringify(objetivo.conf))
      const idPagina = conf.paginas.some((p) => p.id === paginaId) ? paginaId : conf.paginas[0]?.id || null
      setBorrador(conf)
      setMetaBorrador({ nombre: objetivo.nombre, descripcion: objetivo.descripcion || '' })
      setPaginaId(idPagina)
      setSeleccion(null)
      // Al editar, la lista de tableros se cierra para dejarle el espacio al lienzo y al panel.
      setListaAbierta(false)
      setEditando(true)
    } catch (error) {
      setAviso(mensajeError(error))
    }
  }

  const guardarEdicion = async () => {
    if (!tablero || !borrador) return
    if (!sucio) {
      salirEdicion()
      return
    }
    setGuardando(true)
    setErrorEditor('')
    try {
      const cambios = {
        conf: borrador,
        nombre: metaBorrador.nombre.trim(),
        descripcion: metaBorrador.descripcion,
      }
      const respuesta = await analiticaApi.actualizarTablero(tablero.num, cambios)
      const lista = pagina(await analiticaApi.tableros())
      tablerosConsulta.actualizar(() => lista)
      const actual = lista.find((t) => t.num === respuesta.num) || respuesta
      salirEdicion()
      setTableroNum(actual.num)
      setPaginaId(actual.conf?.paginas?.[0]?.id || null)
      setFiltros(filtrosDelTablero(actual))
      setCruzado(null)
      setAviso('Tablero guardado.')
    } catch (error) {
      const datos = error?.datos || {}
      if (datos.nombre || datos.descripcion || datos.conf) {
        setConfigAbierta(true)
        setErrorConfig(textoError(datos.conf))
        setErroresConfig({
          nombre: textoError(datos.nombre),
          descripcion: textoError(datos.descripcion),
        })
      } else {
        setErrorEditor(mensajeError(error))
      }
    } finally {
      setGuardando(false)
    }
  }

  const cancelarEdicion = async () => {
    if (!(await confirmarSalida('Si sales ahora perderás los cambios que no guardaste.'))) return
    salirEdicion()
    setPaginaId(tablero?.conf?.paginas?.[0]?.id || null)
  }

  const actualizarPaginaBorrador = (fn) => {
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      const pagina = copia.paginas.find((p) => p.id === paginaId) || copia.paginas[0]
      if (!pagina) return previo
      fn(pagina, copia)
      return copia
    })
  }

  const cambiarTarjeta = (id, cambios) => {
    actualizarPaginaBorrador((pagina) => {
      const tarjeta = pagina.tarjetas.find((t) => t.id === id)
      if (!tarjeta) return
      const { opciones, meta, ...resto } = cambios
      Object.assign(tarjeta, resto)
      if (opciones) tarjeta.opciones = { ...tarjeta.opciones, ...opciones }
      if (meta === null) delete tarjeta.meta
      else if (meta) tarjeta.meta = { ...tarjeta.meta, ...meta }
    })
  }

  const agregarTarjeta = (tipo) => {
    const pagina = paginaEditor
    const definicion = TIPOS[tipo]
    if (!pagina || !definicion) return { error: 'Ese tipo de tarjeta no existe.' }
    if (pagina.tarjetas.length >= LIMITES.tarjetas) return { error: 'Esta página ya tiene 12 tarjetas.' }
    const [w, h] = definicion.minimo
    const hueco = primerHueco(pagina.tarjetas, w, h, tipo)
    if (!hueco) return { error: 'No hay espacio en esta página.' }
    const id = nuevoIdTarjeta(borrador)
    const tarjeta = {
      id,
      tipo,
      x: hueco.x,
      y: hueco.y,
      w,
      h,
      titulo: definicion.nombre,
      opciones: opcionesIniciales(tipo),
    }
    const meta = metaSugerida(tipo, tarjeta.opciones)
    if (meta) tarjeta.meta = meta
    actualizarPaginaBorrador((actual) => {
      actual.tarjetas.push(tarjeta)
    })
    setSeleccion(id)
    return { id }
  }

  const moverTarjeta = (id, x, y) => {
    actualizarPaginaBorrador((pagina) => {
      const tarjeta = pagina.tarjetas.find((t) => t.id === id)
      if (!tarjeta) return
      tarjeta.x = x
      tarjeta.y = y
    })
  }

  const redimensionarTarjeta = (id, w, h) => {
    actualizarPaginaBorrador((pagina) => {
      const tarjeta = pagina.tarjetas.find((t) => t.id === id)
      if (!tarjeta) return
      tarjeta.w = w
      tarjeta.h = h
    })
  }

  const validarTarjeta = (id, x, y, w, h) => {
    const pagina = paginaEditor
    const tarjeta = pagina?.tarjetas?.find((t) => t.id === id)
    if (!pagina || !tarjeta) return false
    return cabeTarjeta(pagina.tarjetas, id, x, y, w, h, tarjeta.tipo)
  }

  const quitarTarjeta = async (id) => {
    const pagina = paginaEditor
    const tarjeta = pagina?.tarjetas?.find((t) => t.id === id)
    if (!tarjeta) return
    const ok = await confirmar({
      titulo: 'Quitar tarjeta',
      mensaje: `¿Quitar «${tarjeta.titulo}» de esta página?`,
      confirmar: 'Quitar',
      peligro: true,
    })
    if (!ok) return
    actualizarPaginaBorrador((actual) => {
      actual.tarjetas = actual.tarjetas.filter((t) => t.id !== id)
    })
    setSeleccion(null)
  }

  const seleccionarTablero = async (siguiente) => {
    if (!siguiente) return
    if (editando) {
      const ok = await confirmarSalida('Cambiar de tablero descarta los cambios que no guardaste.')
      if (!ok) return
      salirEdicion()
    }
    setTableroNum(siguiente.num)
    setPaginaId(siguiente.conf?.paginas?.[0]?.id || null)
    setFiltros(filtrosDelTablero(siguiente))
    setCruzado(null)
    if (window.innerWidth < 1600) setListaAbierta(false)
  }
  const cambiarPagina = (id) => {
    setPaginaId(id)
    setCruzado(null)
    setSeleccion(null)
  }

  const agregarPagina = () => {
    if (!borrador) return { error: 'No hay un tablero en edición.' }
    if (borrador.paginas.length >= LIMITES.paginas) return { error: `Máximo ${LIMITES.paginas} páginas.` }
    const usados = new Set(borrador.paginas.map((p) => p.nombre))
    let numero = borrador.paginas.length + 1
    while (usados.has(`Página ${numero}`)) numero += 1
    const id = nuevoIdPagina(borrador)
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      copia.paginas.push({ id, nombre: `Página ${numero}`, tarjetas: [] })
      return copia
    })
    setPaginaId(id)
    setSeleccion(null)
    return { id }
  }

  const renombrarPagina = (id, nombre) => {
    const limpio = String(nombre || '').trim()
    if (!limpio) return 'La página necesita un nombre.'
    if (limpio.length > LIMITES.nombrePagina) return `El nombre no puede pasar de ${LIMITES.nombrePagina} caracteres.`
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      const pagina = copia.paginas.find((p) => p.id === id)
      if (pagina) pagina.nombre = limpio
      return copia
    })
    return null
  }

  const moverPagina = (id, delta) => {
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      const indice = copia.paginas.findIndex((p) => p.id === id)
      const destino = indice + delta
      if (indice < 0 || destino < 0 || destino >= copia.paginas.length) return previo
      const [pagina] = copia.paginas.splice(indice, 1)
      copia.paginas.splice(destino, 0, pagina)
      return copia
    })
  }

  const eliminarPagina = async (id) => {
    if (!borrador || borrador.paginas.length <= 1) return { error: 'El tablero debe conservar al menos una página.' }
    const pagina = borrador.paginas.find((p) => p.id === id)
    if (!pagina) return { error: 'La página no existe.' }
    const ok = await confirmar({
      titulo: 'Eliminar página',
      mensaje: `¿Eliminar «${pagina.nombre}» y sus ${pagina.tarjetas.length} tarjeta(s)?`,
      confirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return { error: null }
    const indice = borrador.paginas.findIndex((p) => p.id === id)
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      copia.paginas = copia.paginas.filter((p) => p.id !== id)
      return copia
    })
    if (paginaId === id) {
      const siguiente = borrador.paginas[Math.max(0, indice - 1)] || borrador.paginas[indice + 1]
      setPaginaId(siguiente?.id || null)
      setSeleccion(null)
    }
    return { error: null }
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
  const cambiarFiltrosTablero = (cambios) => {
    setBorrador((previo) => {
      if (!previo) return previo
      const copia = clonar(previo)
      copia.filtros = { ...copia.filtros, ...cambios }
      return copia
    })
    setErrorConfig('')
  }

  const marcarPredeterminado = async () => {
    if (!tablero) return
    setErrorConfig('')
    try {
      await analiticaApi.predeterminarTablero(tablero.num)
      const lista = pagina(await analiticaApi.tableros())
      tablerosConsulta.actualizar(() => lista)
      setAviso('Tablero marcado como predeterminado.')
    } catch (error) {
      setErrorConfig(mensajeError(error))
    }
  }

  const restaurarVersion = async (numero) => {
    if (!tablero) return
    const ok = await confirmar({
      titulo: `Restaurar versión ${numero}`,
      mensaje: 'Se creará una versión nueva igual a la elegida. Los cambios actuales no se pierden si ya están guardados.',
      confirmar: 'Restaurar',
    })
    if (!ok) return
    try {
      const actual = await analiticaApi.restaurarTablero(tablero.num, numero)
      const lista = pagina(await analiticaApi.tableros())
      tablerosConsulta.actualizar(() => lista)
      setVersionesAbiertas(false)
      setConfigAbierta(false)
      salirEdicion()
      setTableroNum(actual.num)
      setPaginaId(actual.conf?.paginas?.[0]?.id || null)
      setFiltros(filtrosDelTablero(actual))
      setAviso(`Versión ${numero} restaurada.`)
    } catch (error) {
      setErrorEditor(mensajeError(error))
    }
  }

  const eliminarTableroActual = async () => {
    if (!tablero) return
    const ok = await confirmar({
      titulo: 'Eliminar tablero',
      mensaje: `¿Eliminar «${tablero.nombre}»? Se archivará y dejará de aparecer en la lista.`,
      confirmar: 'Eliminar',
      peligro: true,
    })
    if (!ok) return
    try {
      await analiticaApi.eliminarTablero(tablero.num)
      const lista = pagina(await analiticaApi.tableros())
      tablerosConsulta.actualizar(() => lista)
      const siguiente = lista.find((t) => t.predeterminado) || lista.find((t) => t.nombre === TABLERO_EJECUTIVO) || lista[0]
      salirEdicion()
      setConfigAbierta(false)
      setVersionesAbiertas(false)
      setTableroNum(siguiente?.num || null)
      setPaginaId(siguiente?.conf?.paginas?.[0]?.id || null)
      setFiltros(siguiente ? filtrosDelTablero(siguiente) : filtrosDelTablero(null))
      setAviso('Tablero eliminado.')
    } catch (error) {
      setErrorConfig(mensajeError(error))
    }
  }

  const verVersiones = async () => {
    setVersionesAbiertas(true)
    setVersiones(null)
    try {
      setVersiones(await analiticaApi.versionesTablero(tablero.num))
    } catch {
      setVersiones([])
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

  useEffect(() => {
    editorRef.current = { editando, sucio }
  }, [editando, sucio])

  // El botón Atrás también pide confirmación: una entrada centinela en el historial.
  useEffect(() => {
    if (!editando || !sucio || guardiaHistorial.current) return undefined
    window.history.pushState({ ...(window.history.state || {}), analiticaEditor: true }, '', window.location.href)
    guardiaHistorial.current = true
    return undefined
  }, [editando, sucio])

  useEffect(() => {
    const alVolver = async () => {
      if (!guardiaHistorial.current) return
      const estado = editorRef.current
      if (!estado.editando || !estado.sucio) {
        guardiaHistorial.current = false
        return
      }
      const ok = await confirmar({
        titulo: 'Cambios sin guardar',
        mensaje: 'Si sales ahora perderás los cambios que no guardaste.',
        confirmar: 'Salir sin guardar',
        peligro: true,
      })
      if (ok) {
        guardiaHistorial.current = false
        setEditando(false)
        setBorrador(null)
        setSeleccion(null)
        setErrorEditor('')
        window.history.back()
      } else {
        window.history.pushState({ ...(window.history.state || {}), analiticaEditor: true }, '', window.location.href)
      }
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  useEffect(() => {
    if (!editando || !sucio) return undefined
    const alSalir = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [editando, sucio])

  // Los enlaces del marco son <a>: se interceptan en captura para no perder el borrador.
  useEffect(() => {
    if (!editando || !sucio) return undefined
    const alClick = async (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const enlace = e.target.closest?.('a[href]')
      if (!enlace || enlace.target || enlace.hasAttribute('download')) return
      const url = new URL(enlace.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const destino = `${url.pathname}${url.search}`
      if (destino === `${window.location.pathname}${window.location.search}`) return
      e.preventDefault()
      e.stopPropagation()
      const ok = await confirmar({
        titulo: 'Cambios sin guardar',
        mensaje: 'Si sales ahora perderás los cambios que no guardaste.',
        confirmar: 'Salir sin guardar',
        peligro: true,
      })
      if (!ok) return
      if (guardiaHistorial.current) {
        guardiaHistorial.current = false
        window.history.replaceState({ ...(window.history.state || {}), analiticaEditor: false }, '', window.location.href)
      }
      setEditando(false)
      setBorrador(null)
      setSeleccion(null)
      setErrorEditor('')
      navigate(`${destino}${url.hash}`)
    }
    document.addEventListener('click', alClick, true)
    return () => document.removeEventListener('click', alClick, true)
  }, [editando, sucio, navigate, location.pathname, location.search])

  if (tablerosConsulta.estado === 'error') {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><EstadoError reintentar={tablerosConsulta.reintentar} /></Pantalla>
  }
  if (!tableros.length && tablerosConsulta.estado === 'cargando') {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><div className="ui-analitica__cargando-pagina"><Skeleton height={36} /><Skeleton height={220} /></div></Pantalla>
  }
  if (!tableros.length) {
    return <Pantalla eyebrow={`${organizacion || ''} · Analítica`} titulo="Analítica"><EmptyState icon="layout-dashboard" title="Sin tableros" message="No hay tableros disponibles para tu organización." /></Pantalla>
  }

  const puedeEditar = ['ADMIN', 'SUPER'].includes(rol)
  const acciones = puedeEditar ? (
    editando ? (
      <>
        <Button icon="save" onClick={guardarEdicion} disabled={guardando || !sucio}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        <Button variant="secondary" onClick={cancelarEdicion} disabled={guardando}>Cancelar</Button>
      </>
    ) : (
      <Button className="ui-analitica__nuevo-tablero" icon="plus" onClick={() => setNuevoAbierto(true)}>Nuevo tablero</Button>
    )
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
            alVerVersiones={verVersiones}
            generado={generado}
            actualizando={consulta.estado === 'cargando' && !datosPagina}
            puedeEditar={puedeEditar}
            editando={editando}
            alEditar={iniciarEdicion}
          />
          {aviso && <div className="ui-analitica__aviso" role="status">{aviso}</div>}
          {errorEditor && <div className="ui-analitica__aviso" role="alert">{errorEditor}</div>}
          {consulta.error && !datosPagina ? (
            <EstadoError reintentar={consulta.refrescar} />
          ) : editando ? (
            <EditorTablero
              pagina={paginaEditor}
              datosPagina={datosPagina}
              cargando={!datosPagina}
              paginas={paginasEditor}
              paginaId={paginaId}
              alCambiarPagina={cambiarPagina}
              seleccion={seleccion}
              alSeleccionar={setSeleccion}
              alMoverTarjeta={moverTarjeta}
              alRedimensionarTarjeta={redimensionarTarjeta}
              alQuitarTarjeta={quitarTarjeta}
              alValidarTarjeta={validarTarjeta}
              alCambiarTarjeta={cambiarTarjeta}
              alAgregarTarjeta={agregarTarjeta}
              alConfigurar={abrirConfiguracion}
              alAgregarPagina={agregarPagina}
              alRenombrarPagina={renombrarPagina}
              alMoverPagina={moverPagina}
              alEliminarPagina={eliminarPagina}
            />
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
              pie={paginas.length > 1 ? <PaginasTablero paginas={paginas} actual={paginaActual?.id} onCambiar={cambiarPagina} /> : null}
            />
          )}
          </Card>
        </section>
      </div>
      {impresion && <Impresion {...impresion} hallazgos={hallazgos} />}
      {configAbierta && tablero && borrador && (
        <Modal
          titulo="Configurar tablero"
          sub={tablero.nombre}
          cerrar={() => setConfigAbierta(false)}
          cerrarConEscape
          acciones={<Button variant="secondary" onClick={() => setConfigAbierta(false)}>Listo</Button>}
        >
          <div className="ui-editor__config">
            <Input label="Nombre" value={metaBorrador.nombre} maxLength={80} error={erroresConfig.nombre} onChange={(e) => { setErroresConfig((x) => ({ ...x, nombre: '' })); setMetaBorrador((m) => ({ ...m, nombre: e.target.value })) }} />
            <Input label="Descripción" value={metaBorrador.descripcion} maxLength={200} error={erroresConfig.descripcion} onChange={(e) => { setErroresConfig((x) => ({ ...x, descripcion: '' })); setMetaBorrador((m) => ({ ...m, descripcion: e.target.value })) }} />
            <div className="ui-editor__tamano">
              <Desplegable
                label="Periodo por omisión"
                value={borrador.filtros?.periodo || '7d'}
                onChange={(valor) => cambiarFiltrosTablero({ periodo: valor })}
                options={PERIODOS.filter(([valor]) => valor !== 'personalizado').map(([value, label]) => ({ value, label }))}
              />
              <Desplegable
                label="Variable por omisión"
                value={borrador.filtros?.variable ?? 'TEMP'}
                onChange={(valor) => cambiarFiltrosTablero({ variable: valor })}
                options={VARIABLES.map(([value, label]) => ({ value, label }))}
              />
            </div>
            {errorConfig && <p className="ui-analitica__error" role="alert">{errorConfig}</p>}
            <div className="ui-editor__config-acciones">
              <Button variant="secondary" size="sm" icon="layout-dashboard" onClick={marcarPredeterminado} disabled={tablero.predeterminado}>
                {tablero.predeterminado ? 'Predeterminado' : 'Marcar como predeterminado'}
              </Button>
              <Button variant="secondary" size="sm" icon="history" onClick={() => { setConfigAbierta(false); verVersiones() }}>
                Versiones
              </Button>
              <Button variant="secondary" size="sm" icon="trash-2" onClick={eliminarTableroActual}>Eliminar tablero</Button>
            </div>
          </div>
        </Modal>
      )}
      {versionesAbiertas && (
        <Modal titulo="Versiones del tablero" sub={tablero?.nombre} cerrar={() => setVersionesAbiertas(false)} cerrarConEscape acciones={null}>
          {versiones === null ? (
            <p className="ui-muted">Cargando versiones…</p>
          ) : versiones.length === 0 ? (
            <p className="ui-muted">Este tablero no tiene versiones.</p>
          ) : (
            <div className="ui-analitica__versiones">
              {versiones.map((version) => (
                <div key={version.numero} className="ui-analitica__version">
                  <span className="ui-analitica__version-texto">
                    <strong>Versión {version.numero}</strong>
                    <span>· {fechaLarga(version.fecha)} · {version.creada_por_nombre || 'Sistema'}</span>
                  </span>
                  {puedeEditar && !tablero?.es_plantilla && (
                    <Button variant="secondary" size="sm" onClick={() => restaurarVersion(version.numero)}>Restaurar</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
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
