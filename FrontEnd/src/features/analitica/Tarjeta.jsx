import { useEffect, useRef, useState } from 'react'
import { Card, EmptyState, Icon, Skeleton } from '../../design-system/componentes/index.js'
import { MenuAcciones } from '../../components/MenuAcciones'
import { ContenidoTarjeta } from './Tarjetas'

function Cargando({ alto }) {
  return (
    <div className="ui-analitica__cargando" aria-busy="true">
      <Skeleton height={Math.max(16, Math.min(28, alto * 0.12))} width="46%" />
      <Skeleton height={Math.max(12, Math.min(22, alto * 0.1))} width="70%" />
      {alto > 90 && <Skeleton height={Math.max(28, alto * 0.35)} />}
    </div>
  )
}

export function Tarjeta({
  tarjeta,
  datos,
  cargando,
  alto,
  cruzado,
  alSeleccionar,
  alQuitarFiltro,
  alExportar,
  alGenerarHallazgos,
  generandoHallazgos,
  hallazgos,
  errorHallazgos,
  alReintentar,
  editor = false,
  seleccionada = false,
  alSeleccionarTarjeta,
  alMoverTarjeta,
  alRedimensionarTarjeta,
  alQuitarTarjeta,
  alValidarTarjeta,
  paso = { x: 60, y: 40 },
  impresion = false,
}) {
  const [altoCuerpo, setAltoCuerpo] = useState(0)
  const [gesto, setGesto] = useState(null)
  const cuerpo = useRef(null)
  const tarjetaRef = useRef(null)
  const gestoRef = useRef(null)
  useEffect(() => {
    const nodo = cuerpo.current
    if (!nodo || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entradas) => {
      const h = Math.round(entradas[0].contentRect.height)
      if (h > 0) setAltoCuerpo((previo) => (Math.abs(previo - h) > 2 ? h : previo))
    })
    observer.observe(nodo)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => {
    const actual = gestoRef.current
    if (!actual) return
    window.removeEventListener('pointermove', actual.mover)
    window.removeEventListener('pointerup', actual.terminar)
    window.removeEventListener('pointercancel', actual.terminar)
  }, [])
  const menu = [
    tarjeta.tipo !== 'hallazgos' && {
      label: 'Exportar datos (CSV)',
      icon: 'download',
      onClick: () => alExportar?.(tarjeta),
    },
    cruzado && {
      label: 'Quitar filtro',
      icon: 'x',
      onClick: () => alQuitarFiltro?.(),
    },
  ].filter(Boolean)
  const altoFinal = impresion ? Math.max(60, alto || 100) : altoCuerpo > 30 ? altoCuerpo : Math.max(80, alto || 120)

  const limpiarGesto = () => {
    const actual = gestoRef.current
    if (actual) {
      window.removeEventListener('pointermove', actual.mover)
      window.removeEventListener('pointerup', actual.terminar)
      window.removeEventListener('pointercancel', actual.terminar)
    }
    gestoRef.current = null
  }

  const empezarGesto = (evento, modo) => {
    if (!editor || evento.button !== 0) return
    evento.preventDefault()
    evento.stopPropagation()
    alSeleccionarTarjeta?.(tarjeta.id)
    tarjetaRef.current?.focus()
    const inicio = {
      x: evento.clientX,
      y: evento.clientY,
      cardX: tarjeta.x,
      cardY: tarjeta.y,
      cardW: tarjeta.w,
      cardH: tarjeta.h,
      pasoX: Math.max(1, paso.x),
      pasoY: Math.max(1, paso.y),
      modo,
      estado: null,
    }
    const mover = (e) => {
      const celX = Math.round((e.clientX - inicio.x) / inicio.pasoX)
      const celY = Math.round((e.clientY - inicio.y) / inicio.pasoY)
      const x = inicio.cardX + celX
      const y = inicio.cardY + celY
      const w = Math.max(1, inicio.cardW + celX)
      const h = Math.max(1, inicio.cardH + celY)
      const valido = modo === 'mover'
        ? alValidarTarjeta?.(tarjeta.id, x, y, tarjeta.w, tarjeta.h) !== false
        : alValidarTarjeta?.(tarjeta.id, tarjeta.x, tarjeta.y, w, h) !== false
      const siguiente = { modo, dx: celX * inicio.pasoX, dy: celY * inicio.pasoY, x, y, w, h, valido }
      inicio.estado = siguiente
      setGesto(siguiente)
    }
    const terminar = () => {
      const estado = inicio.estado
      limpiarGesto()
      setGesto(null)
      if (!estado?.valido) return
      if (modo === 'mover') alMoverTarjeta?.(tarjeta.id, estado.x, estado.y)
      else alRedimensionarTarjeta?.(tarjeta.id, estado.w, estado.h)
    }
    gestoRef.current = { mover, terminar }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', terminar)
    window.addEventListener('pointercancel', terminar)
  }

  const alTecla = (evento) => {
    if (!editor) return
    if (evento.key === 'Delete' || evento.key === 'Backspace') {
      evento.preventDefault()
      alQuitarTarjeta?.(tarjeta.id)
      return
    }
    const dx = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0
    const dy = evento.key === 'ArrowDown' ? 1 : evento.key === 'ArrowUp' ? -1 : 0
    if (!dx && !dy) return
    evento.preventDefault()
    if (evento.shiftKey) {
      const w = Math.max(1, tarjeta.w + dx)
      const h = Math.max(1, tarjeta.h + dy)
      if (alValidarTarjeta?.(tarjeta.id, tarjeta.x, tarjeta.y, w, h) !== false) alRedimensionarTarjeta?.(tarjeta.id, w, h)
    } else {
      const x = tarjeta.x + dx
      const y = tarjeta.y + dy
      if (alValidarTarjeta?.(tarjeta.id, x, y, tarjeta.w, tarjeta.h) !== false) alMoverTarjeta?.(tarjeta.id, x, y)
    }
  }

  const estiloGesto = gesto?.modo === 'mover'
    ? { transform: `translate3d(${gesto.dx}px, ${gesto.dy}px, 0)` }
    : gesto?.modo === 'redimensionar'
      ? { transform: `scale(${gesto.w / tarjeta.w}, ${gesto.h / tarjeta.h})`, transformOrigin: 'bottom right' }
      : undefined
  return (
    <Card
      ref={tarjetaRef}
      className={`ui-analitica__tarjeta${tarjeta.tipo === 'kpi' && tarjeta.w <= 3 ? ' ui-analitica__tarjeta--kpi-corta' : ''}${editor ? ' ui-analitica__tarjeta--editando' : ''}${seleccionada ? ' is-seleccionada' : ''}${gesto ? ' is-arrastrando' : ''}${gesto && !gesto.valido ? ' is-invalida' : ''}${impresion ? ' ui-analitica__tarjeta--impresa' : ''}`}
      style={{
        gridColumn: `${tarjeta.x + 1} / span ${tarjeta.w}`,
        gridRow: `${tarjeta.y + 1} / span ${tarjeta.h}`,
        '--tarjeta-alto': `${tarjeta.h}`,
        ...estiloGesto,
      }}
      onPointerDown={editor ? (e) => { alSeleccionarTarjeta?.(tarjeta.id); e.currentTarget.focus() } : undefined}
      onKeyDown={editor ? alTecla : undefined}
      tabIndex={editor ? 0 : undefined}
      aria-label={editor ? `Editar ${tarjeta.titulo}` : undefined}
    >
      <div className="ui-analitica__tarjeta-cabeza" onPointerDown={editor ? (e) => empezarGesto(e, 'mover') : undefined}>
        <h3 title={tarjeta.titulo}>{tarjeta.titulo}</h3>
        {!impresion && !editor && menu.length ? <MenuAcciones items={menu} label={`Opciones de ${tarjeta.titulo}`} /> : null}
      </div>
      <div className="ui-analitica__tarjeta-cuerpo" ref={cuerpo}>
        {cargando && !datos ? (
          <Cargando alto={altoFinal} />
        ) : datos?.error ? (
          <div className="ui-analitica__error" role="alert">
            <Icon name="octagon-alert" size={18} />
            <span>No se pudo calcular esta tarjeta.</span>
            {alReintentar && (
              <button type="button" className="ui-analitica__reintentar" onClick={alReintentar}>
                Reintentar
              </button>
            )}
          </div>
        ) : datos?.sin_datos ? (
          <EmptyState compact icon="activity" title="Sin datos en el periodo" />
        ) : (
          <ContenidoTarjeta
            tarjeta={tarjeta}
            datos={datos}
            alto={altoFinal}
            // Solo la tarjeta de origen resalta su elemento; las demás ya vienen filtradas y no se atenúan.
            cruzado={cruzado?.origen === tarjeta.id ? cruzado : null}
            alSeleccionar={alSeleccionar}
            alGenerar={() => alGenerarHallazgos?.(tarjeta)}
            generando={generandoHallazgos}
            hallazgos={hallazgos}
            errorHallazgos={errorHallazgos}
            impresion={impresion}
          />
        )}
        {editor && (
          <button
            type="button"
            className="ui-editor__resize"
            aria-label={`Redimensionar ${tarjeta.titulo}`}
            onPointerDown={(e) => empezarGesto(e, 'redimensionar')}
          />
        )}
      </div>
    </Card>
  )
}
