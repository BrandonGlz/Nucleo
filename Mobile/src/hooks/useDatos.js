import { useCallback, useEffect, useState } from 'react'
import { ESTADO_FORZADO } from '../services/mock/handlers'
import { USAR_MOCKS } from '../services/config'

const forzado = USAR_MOCKS && ['cargando', 'error'].includes(ESTADO_FORZADO) ? ESTADO_FORZADO : null

// Carga datos con una función async y expone { estado, datos, error, reintentar }.
// estado: 'cargando' | 'listo' | 'vacio' | 'error'. `esVacio(datos)` decide cuándo es 'vacio'
// y `cadaMs` vuelve a pedir los datos en segundo plano (lecturas «en vivo»).
// Con EXPO_PUBLIC_MOCK_ESTADO=cargando o =error la pantalla se queda en ese estado.
export function useDatos(cargar, deps = [], { esVacio, cadaMs } = {}) {
  const [res, setRes] = useState({ estado: 'cargando', datos: null, error: null })
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (forzado === 'cargando') return undefined
    let vivo = true
    let timer
    const traer = (silencioso) => {
      if (!silencioso) setRes((r) => ({ ...r, estado: 'cargando', error: null }))
      cargar()
        .then((datos) => {
          if (vivo) setRes({ estado: esVacio?.(datos) ? 'vacio' : 'listo', datos, error: null })
        })
        .catch((error) => vivo && !silencioso && setRes({ estado: 'error', datos: null, error }))
    }
    if (forzado === 'error') {
      setRes({ estado: 'error', datos: null, error: new Error('Error forzado con EXPO_PUBLIC_MOCK_ESTADO=error') })
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
  return { ...res, reintentar }
}
