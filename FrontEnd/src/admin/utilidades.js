import { useEffect, useState } from 'react'
import { useDatos } from '../hooks/useDatos'
import * as adminApi from '../services/admin'

// Ganchos y funciones que comparten las páginas de la consola de administración.

// Organizaciones con sus áreas (para los filtros): se piden una vez por visita.
let organizacionesPedidas = null
export function useOrganizaciones() {
  const { datos } = useDatos(() => {
    organizacionesPedidas ??= adminApi.organizaciones().catch((e) => {
      organizacionesPedidas = null
      throw e
    })
    return organizacionesPedidas
  }, [])
  return datos ?? []
}

// Mensaje del error de la API: {detail}, {campo: [texto]} o un 403/404 sin cuerpo.
export function mensajeError(e, defecto = 'No se pudo guardar. Intenta de nuevo.') {
  const d = e?.datos
  if (d && typeof d === 'object') {
    const v = d.detail ?? Object.values(d)[0]
    if (v) return Array.isArray(v) ? String(v[0]) : String(v)
  }
  if (e?.status === 403) return 'Tu sesión no tiene permiso para esto.'
  if (e?.status === 404) return 'Ya no existe; recarga la lista.'
  if (e?.message && !e?.status) return e.message
  return defecto
}

// Errores por campo de un 400 ({campo: ['mensaje']}) → {campo: 'mensaje'}.
export function erroresDeCampo(e) {
  const d = e?.status === 400 && e?.datos && typeof e.datos === 'object' ? e.datos : {}
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]))
}

// Valor que se actualiza un rato después de dejar de escribir (búsquedas que van a la API).
export function useDiferido(valor, ms = 350) {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return diferido
}
