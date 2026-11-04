import { useCallback, useEffect, useState } from 'react'

const FORZABLES = ['cargando', 'vacio', 'error', 'sinConexion']
// ?estado=cargando|vacio|error|sinConexion fuerza un estado para revisar el diseño.
export const estadoForzado = () => {
  const e = new URLSearchParams(window.location.search).get('estado')
  return FORZABLES.includes(e) ? e : null
}

// Carga datos con una función async y expone { estado, datos, error, reintentar, recargar }.
// estado: 'cargando' | 'listo' | 'vacio' | 'error'. `esVacio(datos)` decide cuándo es 'vacio'
// y `cadaMs` vuelve a pedir los datos en segundo plano (lecturas «en vivo»).
export function useDatos(cargar, deps = [], { esVacio, cadaMs } = {}) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null })
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    const forzado = estadoForzado()
    if (forzado === 'cargando') return undefined
    let vivo = true
    let timer
    const traer = (silencioso) => {
      if (!silencioso) setRes((r) => ({ ...r, estado: 'cargando', error: null }))
      cargar()
        .then((datos) => {
          if (!vivo) return
          const vacio = forzado === 'vacio' || (esVacio ? esVacio(datos) : false)
          setRes({ estado: vacio ? 'vacio' : 'listo', datos, error: null })
        })
        .catch((error) => vivo && setRes({ estado: 'error', datos: null, error }))
    }
    if (forzado === 'error') {
      setRes({ estado: 'error', datos: null, error: new Error('Error forzado con ?estado=error') })
    } else {
      traer(false)
      if (cadaMs) timer = setInterval(() => traer(true), cadaMs)
    }
    return () => {
      vivo = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vuelta])

  const reintentar = useCallback(() => setVuelta((v) => v + 1), [])
  // Reemplaza los datos sin volver a pedirlos (después de guardar algo).
  const actualizar = useCallback((fn) => setRes((r) => ({ ...r, datos: fn(r.datos) })), [])
  return { ...res, reintentar, actualizar }
}
