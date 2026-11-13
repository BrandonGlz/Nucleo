import { useEffect, useState } from 'react'
import { Button, Icon } from '../design-system/componentes/index.js'
import { Modal } from '../components/Modal'
import * as nicoApi from '../services/nico'
import { mensajeError } from './utilidades'

// La IA lee el documento una sola vez y propone respuestas; las elegidas se guardan en el banco
// como respuestas fijas para todas las empresas (después se contestan al instante, sin IA).
export function GenerarRespuestas({ documento, seccion, cerrar, guardadas }) {
  const [estado, setEstado] = useState({ estado: 'generando', propuestas: [] })
  const [elegidas, setElegidas] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    let t
    const revisar = async () => {
      try {
        const r = await nicoApi.estadoGenerar(documento.num, seccion)
        if (!vivo) return
        setEstado(r)
        if (r.estado === 'listo') setElegidas(new Set(r.propuestas.map((_, i) => i)))
        if (r.estado === 'generando') t = setTimeout(revisar, 3000)
      } catch (e) {
        if (vivo) setEstado({ estado: 'error', error: mensajeError(e, 'No se pudo consultar el avance.'), propuestas: [] })
      }
    }
    nicoApi
      .generarRespuestas(documento.num, seccion)
      .then((r) => {
        if (!vivo) return
        setEstado(r)
        if (r.estado === 'generando') t = setTimeout(revisar, 3000)
        if (r.estado === 'listo') setElegidas(new Set(r.propuestas.map((_, i) => i)))
      })
      .catch((e) => vivo && setEstado({ estado: 'error', error: mensajeError(e, 'No se pudo iniciar.'), propuestas: [] }))
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [documento.num, seccion])

  const alternar = (i) =>
    setElegidas((s) => {
      const n = new Set(s)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  const guardar = async () => {
    setGuardando(true)
    setError(null)
    let ok = 0
    let repetidas = 0
    for (const i of elegidas) {
      const p = estado.propuestas[i]
      try {
        await nicoApi.crearRespuesta({ todas: true, tema: 'FIJA', pregunta: p.pregunta, plantilla: p.respuesta, activa: true })
        ok += 1
      } catch {
        repetidas += 1
      }
    }
    setGuardando(false)
    if (ok === 0 && repetidas) {
      setError('Esas preguntas ya estaban en el banco.')
      return
    }
    guardadas(ok, repetidas)
  }

  return (
    <Modal
      titulo={`Convertir «${seccion}» en respuestas`}
      sub="Nico lee la sección una sola vez y propone preguntas con su respuesta. Las que elijas quedan en el banco como respuestas fijas para todas las empresas: se contestan al instante, sin usar la IA."
      cerrar={cerrar}
      acciones={
        estado.estado === 'listo' && (
          <Button icon="save" disabled={!elegidas.size || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : `Agregar ${elegidas.size} al banco`}
          </Button>
        )
      }
    >
      {estado.estado === 'generando' && (
        <div className="ui-consola-generando" role="status">
          <span className="ui-consola-generando__punto" />
          <div>
            <strong>Nico está leyendo la sección…</strong>
            <p className="ui-muted">Tarda alrededor de un minuto. Puedes cerrar esta ventana: el resultado se guarda una hora.</p>
          </div>
        </div>
      )}
      {estado.estado === 'error' && (
        <p className="ui-aviso ui-aviso--danger" role="alert">
          {estado.error}
        </p>
      )}
      {estado.estado === 'listo' && (
        <ul className="ui-consola-propuestas">
          {estado.propuestas.map((p, i) => (
            <li key={p.pregunta}>
              <label className={elegidas.has(i) ? 'is-elegida' : undefined}>
                <input type="checkbox" checked={elegidas.has(i)} onChange={() => alternar(i)} />
                <span className="ui-consola-propuestas__marca">
                  <Icon name="circle-check" size={18} />
                </span>
                <span>
                  <strong>{p.pregunta}</strong>
                  <small>{p.respuesta}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="ui-aviso ui-aviso--danger" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
