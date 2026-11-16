import { createContext, useContext, useSyncExternalStore } from 'react'

// Ancho en el que el menú lateral pasa a ser un cajón que se abre con ☰ (igual que en estilos/movil.css).
export const CONSULTA_MOVIL = '(max-width: 900px)'

const suscribir = (aviso) => {
  const mq = window.matchMedia?.(CONSULTA_MOVIL)
  mq?.addEventListener('change', aviso)
  return () => mq?.removeEventListener('change', aviso)
}
const leer = () => window.matchMedia?.(CONSULTA_MOVIL).matches ?? false

// true en pantallas chicas (celular y tableta en vertical); se actualiza al girar o redimensionar.
export function useEsMovil() {
  return useSyncExternalStore(suscribir, leer, () => false)
}

// Lo comparte MainLayout: el botón ☰ del encabezado abre el cajón del menú.
export const MenuMovilContext = createContext({ abierto: false, abrir: () => {}, cerrar: () => {} })
export const useMenuMovil = () => useContext(MenuMovilContext)
