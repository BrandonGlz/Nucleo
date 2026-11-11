import { useEffect } from 'react'

// Mientras haya sesión abierta, avisa cada minuto al servidor que la página sigue abierta.
// Lo contesta Caddy (/latido, 204, sin pasar por Django) y su bitácora permite contar cuántas
// personas hay conectadas. Solo en producción y sin datos simulados.
export function useLatido() {
  useEffect(() => {
    if (!import.meta.env.PROD || import.meta.env.VITE_USE_MOCKS === 'true') return undefined
    const latir = () => fetch('/latido', { cache: 'no-store', keepalive: true }).catch(() => {})
    latir()
    const id = setInterval(latir, 60_000)
    return () => clearInterval(id)
  }, [])
}
