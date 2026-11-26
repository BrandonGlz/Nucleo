import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// Pasos de zoom de la hoja. «Ajustar» no es un paso: es el modo que cabe completa.
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2]
const MARGEN = 16
const ZoomContext = createContext(null)

// Estado compartido por la barra de acciones y el visor. El visor mide su caja y la hoja; la
// barra usa `ControlZoom`, que lee el mismo contexto.
export function ProveedorZoom({ children, zoomInicial = null, alAjustar }) {
  const [manual, setManual] = useState(zoomInicial)
  const [ajuste, setAjuste] = useState(1)
  const [medida, setMedida] = useState({ ancho: 816, alto: 1056 })
  const visorRef = useRef(null)
  const [nodoVisor, setNodoVisor] = useState(null)
  const anterior = useRef(null)
  const zoom = manual ?? ajuste

  const calcular = useCallback(() => {
    const visor = visorRef.current
    if (!visor) return
    const ancho = Math.max(1, visor.clientWidth - MARGEN * 2)
    const alto = Math.max(1, visor.clientHeight - MARGEN * 2)
    const siguiente = Math.min(ancho / medida.ancho, alto / medida.alto)
    const valor = Math.max(0.01, Number(siguiente.toFixed(4)))
    setAjuste((previo) => (Math.abs(previo - valor) < 0.0001 ? previo : valor))
  }, [medida])

  useLayoutEffect(() => {
    calcular()
    const visor = nodoVisor
    if (!visor) return undefined
    const observador = new ResizeObserver(calcular)
    observador.observe(visor)
    return () => observador.disconnect()
  }, [calcular, nodoVisor])

  useEffect(() => {
    alAjustar?.(ajuste)
  }, [ajuste, alAjustar])

  // Al cambiar el zoom se conserva el centro de lo que se estaba viendo.
  useLayoutEffect(() => {
    const visor = visorRef.current
    const previo = anterior.current
    if (!visor || previo == null || Math.abs(previo - zoom) < 0.0001) {
      anterior.current = zoom
      return
    }
    const centroX = (visor.scrollLeft + visor.clientWidth / 2) / previo
    const centroY = (visor.scrollTop + visor.clientHeight / 2) / previo
    visor.scrollLeft = centroX * zoom - visor.clientWidth / 2
    visor.scrollTop = centroY * zoom - visor.clientHeight / 2
    anterior.current = zoom
  }, [zoom])

  const cambiarPaso = useCallback(
    (direccion) => {
      const actual = zoom * 100
      const siguiente =
        direccion > 0
          ? ZOOMS.find((z) => z * 100 > actual + 0.5)
          : [...ZOOMS].reverse().find((z) => z * 100 < actual - 0.5)
      if (siguiente != null) setManual(siguiente)
    },
    [zoom],
  )

  const ajustar = useCallback(() => setManual(null), [])
  const registrarVisor = useCallback((nodo) => {
    visorRef.current = nodo
    setNodoVisor(nodo)
  }, [])
  const rueda = useCallback(
    (evento) => {
      if (!evento.ctrlKey) return
      evento.preventDefault()
      cambiarPaso(evento.deltaY < 0 ? 1 : -1)
    },
    [cambiarPaso],
  )

  useEffect(() => {
    const visor = nodoVisor
    if (!visor) return undefined
    visor.addEventListener('wheel', rueda, { passive: false })
    return () => visor.removeEventListener('wheel', rueda)
  }, [rueda, nodoVisor])

  const setDimensiones = useCallback((ancho, alto) => {
    setMedida((previo) =>
      previo.ancho === ancho && previo.alto === alto ? previo : { ancho, alto },
    )
  }, [])

  const valor = useMemo(
    () => ({
      visorRef: registrarVisor,
      zoom,
      ajuste,
      manual,
      porcentaje: Math.round(zoom * 100),
      cambiarPaso,
      ajustar,
      setDimensiones,
    }),
    [ajuste, cambiarPaso, ajustar, manual, registrarVisor, setDimensiones, zoom],
  )
  return <ZoomContext.Provider value={valor}>{children}</ZoomContext.Provider>
}

export function useZoomHoja() {
  return useContext(ZoomContext)
}

// Contenedor del visor: solo él desplaza la hoja. El primer hoja queda completa con «Ajustar».
export function VisorHoja({ children, editando = false, className = '' }) {
  const contexto = useZoomHoja()
  if (!contexto) return null
  return (
    <div ref={contexto.visorRef} className={`ui-visor-hoja ${className}`.trim()}>
      <div
        className={`ui-paginas${editando ? ' is-editando' : ''}`}
        style={{ zoom: contexto.zoom }}
      >
        {children}
      </div>
    </div>
  )
}

export function ControlZoom({ compacto = false }) {
  const contexto = useZoomHoja()
  if (!contexto) return null
  const { porcentaje, manual, cambiarPaso, ajustar } = contexto
  return (
    <div className={`ui-zoom${compacto ? ' ui-zoom--compacto' : ''}`} role="group" aria-label="Zoom de la hoja">
      <button type="button" className="ui-zoom__boton" aria-label="Reducir zoom" onClick={() => cambiarPaso(-1)}>
        −
      </button>
      <span className="ui-zoom__valor ui-num" data-zoom-actual>
        {porcentaje} %
      </span>
      <button type="button" className="ui-zoom__boton" aria-label="Aumentar zoom" onClick={() => cambiarPaso(1)}>
        +
      </button>
      <button
        type="button"
        className={`ui-zoom__ajustar${manual == null ? ' is-activo' : ''}`}
        aria-pressed={manual == null}
        onClick={ajustar}
      >
        Ajustar
      </button>
    </div>
  )
}
