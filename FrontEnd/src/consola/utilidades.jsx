import { useState } from 'react'

// Aviso breve arriba de la lista («Guardado», «No se pudo…»).
export function useAviso() {
  const [aviso, setAviso] = useState(null)
  const avisar = (texto, tono = 'success') => {
    setAviso({ texto, tono })
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 3500)
  }
  const nodo = aviso && (
    <span className={`ui-aviso ui-aviso--${aviso.tono}`} role={aviso.tono === 'danger' ? 'alert' : 'status'}>
      {aviso.texto}
    </span>
  )
  return [nodo, avisar]
}

export const fecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// Mensaje del error de la API (DRF devuelve {campo: [texto]} o {detail}).
export function mensajeError(e, defecto = 'No se pudo guardar. Intenta de nuevo.') {
  const d = e?.datos ?? e?.data ?? e?.body
  if (d && typeof d === 'object') {
    const v = d.detail ?? Object.values(d)[0]
    if (v) return Array.isArray(v) ? v[0] : String(v)
  }
  return defecto
}
