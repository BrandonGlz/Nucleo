import { useCallback, useEffect, useRef, useState } from 'react'

// Duración de las animaciones de salida (igual a --duration-base). Con «reducir movimiento» no hay espera.
const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
export const DURACION_SALIDA = 200

// Mantiene montado un menú o lista mientras corre su animación de salida.
// Devuelve { montado, saliendo }: se pinta mientras `montado` y lleva la clase is-saliendo mientras `saliendo`.
export function useSalida(abierto, ms = DURACION_SALIDA) {
  const [visible, setVisible] = useState(abierto)
  if (abierto && !visible) setVisible(true)
  useEffect(() => {
    if (abierto || !visible) return undefined
    const t = setTimeout(() => setVisible(false), reducido() ? 0 : ms)
    return () => clearTimeout(t)
  }, [abierto, visible, ms])
  return { montado: abierto || visible, saliendo: !abierto && visible }
}

// Para ventanas que el padre quita del árbol al cerrar: primero anima la salida y luego llama a `cerrar`.
// Devuelve [saliendo, cerrarAnimado].
export function useCierre(cerrar, ms = DURACION_SALIDA) {
  const [saliendo, setSaliendo] = useState(false)
  const ultimo = useRef(cerrar)
  const cerrando = useRef(false)
  useEffect(() => {
    ultimo.current = cerrar
  })
  const cerrarAnimado = useCallback(() => {
    if (cerrando.current) return
    cerrando.current = true
    setSaliendo(true)
    setTimeout(() => ultimo.current?.(), reducido() ? 0 : ms)
  }, [ms])
  return [saliendo, cerrarAnimado]
}
