import { useCallback, useEffect, useRef, useState } from 'react'
import { ESTADO_FORZADO } from '../services/mock/handlers'
import { USAR_MOCKS } from '../services/config'

const forzado = USAR_MOCKS && ['cargando', 'error'].includes(ESTADO_FORZADO) ? ESTADO_FORZADO : null

// Carga datos con una función async y expone { estado, datos, error, reintentar, refrescar }.
// estado: 'cargando' | 'listo' | 'vacio' | 'error'. `esVacio(datos)` decide cuándo es 'vacio'
// y `cadaMs` vuelve a pedir los datos en segundo plano (lecturas «en vivo») mientras `activo` sea
// true. `refrescar()` los vuelve a pedir sin mostrar la carga (lo usa el canal en vivo).
// Con EXPO_PUBLIC_MOCK_ESTADO=cargando o =error la pantalla se queda en ese estado.
export function useDatos(cargar, deps = [], { esVacio, cadaMs, activo = true } = {}) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null })
  const [vuelta, setVuelta] = useState(0)
  const silencioso = useRef(() => {})

  useEffect(() => {
    if (forzado === 'cargando') return undefined
    let vivo = true
    const traer = (callado) => {
      if (!callado) setRes((r) => ({ ...r, estado: 'cargando', error: null }))
      cargar()
        .then((datos) => {
          if (vivo) setRes({ estado: esVacio?.(datos) ? 'vacio' : 'listo', datos, error: null })
        })
        .catch((error) => vivo && !callado && setRes({ estado: 'error', datos: null, error }))
    }
    if (forzado === 'error') {
      setRes({ estado: 'error', datos: null, error: new Error('Error forzado con EXPO_PUBLIC_MOCK_ESTADO=error') })
    } else {
      traer(false)
      silencioso.current = () => traer(true)
    }
    return () => {
      vivo = false
      silencioso.current = () => {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vuelta])

  // Sondeo aparte de la carga: pausarlo o cambiar su frecuencia no vuelve a mostrar la carga.
  useEffect(() => {
    if (!cadaMs || !activo) return undefined
    const timer = setInterval(() => silencioso.current(), cadaMs)
    return () => clearInterval(timer)
  }, [cadaMs, activo])

  const reintentar = useCallback(() => setVuelta((v) => v + 1), [])
  const refrescar = useCallback(() => silencioso.current(), [])
  return { ...res, reintentar, refrescar }
}
