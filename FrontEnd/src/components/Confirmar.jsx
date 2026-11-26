import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../design-system/componentes/index.js'
import { Toast } from '../design-system/componentes/index.js'
import { Modal } from './Modal'
import { registrarControl } from './confirmacion'

export function ProveedorConfirmacion({ children }) {
  const [solicitud, setSolicitud] = useState(null)
  const [toasts, setToasts] = useState([])
  const solicitudRef = useRef(null)
  const contador = useRef(0)
  const temporizadores = useRef(new Map())

  const terminar = useCallback((valor) => {
    const actual = solicitudRef.current
    if (!actual) return
    solicitudRef.current = null
    actual.resolve(valor)
    setSolicitud(null)
  }, [])

  const abrir = useCallback(
    (opciones = {}) =>
      new Promise((resolve) => {
        if (solicitudRef.current) {
          resolve(false)
          return
        }
        const nueva = { ...opciones, resolve }
        solicitudRef.current = nueva
        setSolicitud(nueva)
      }),
    [],
  )

  const quitarAviso = useCallback((id) => {
    const timer = temporizadores.current.get(id)
    if (timer) window.clearTimeout(timer)
    temporizadores.current.delete(id)
    setToasts((actuales) => actuales.filter((t) => t.id !== id))
  }, [])

  const mostrarAviso = useCallback(
    (texto, opciones = {}) => {
      contador.current += 1
      const id = contador.current
      setToasts((actuales) => [...actuales, { id, texto, tipo: opciones.tipo || 'ok' }])
      const timer = window.setTimeout(() => quitarAviso(id), 5000)
      temporizadores.current.set(id, timer)
    },
    [quitarAviso],
  )

  useEffect(() => registrarControl({ confirmar: abrir, aviso: mostrarAviso }), [abrir, mostrarAviso])

  useEffect(() => {
    const timers = temporizadores.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (!solicitud) return undefined
    const alEnter = (e) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      terminar(true)
    }
    window.addEventListener('keydown', alEnter)
    return () => window.removeEventListener('keydown', alEnter)
  }, [solicitud, terminar])

  return (
    <>
      {children}
      {solicitud && (
        <Modal
          titulo={solicitud.titulo}
          sub={solicitud.mensaje}
          cerrar={() => terminar(false)}
          cerrarConEscape
          autoFocusCancelar={Boolean(solicitud.peligro)}
          acciones={
            <Button
              variant={solicitud.peligro ? 'destructive' : 'primary'}
              onClick={() => terminar(true)}
            >
              {solicitud.confirmar || 'Confirmar'}
            </Button>
          }
        />
      )}
      {toasts.length > 0 && (
        <div className="ui-toasts" aria-live="polite" aria-label="Avisos">
          {toasts.map((t) => (
            <Toast
              key={t.id}
              level={t.tipo === 'error' ? 'critical' : 'normal'}
              title={t.texto}
              onClose={() => quitarAviso(t.id)}
            />
          ))}
        </div>
      )}
    </>
  )
}
