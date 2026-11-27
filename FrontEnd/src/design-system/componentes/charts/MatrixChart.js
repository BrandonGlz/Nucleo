import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, colorTono, esSeleccion, atenuado } from './comun.js'

const h = React.createElement
const { useState } = React

// Matriz filas × columnas con celdas coloreadas. En modo semáforo usa los tokens de estado; en
// escala usa la opacidad de `--chart-area`, así no hay colores escritos a mano.
function MatrixChart(p) {
  const filas = (p.filas || p.data || []).map((f) => ({
    etiqueta: f.etiqueta ?? f.label ?? f.nombre ?? '',
    dimension: f.dimension,
    dimensionValor: f.dimensionValor ?? f.dimension_valor,
    celdas: f.celdas || f.cells || [],
  }))
  const columnas = p.columnas || [...new Set(filas.flatMap((f) => f.celdas.map((c) => c.columna ?? c.label ?? c.etiqueta)))]
  const wr = useWidth(520)
  const [ref, W] = wr
  const [hover, setHover] = useState(null)
  const H = p.height || 220
  const unit = p.unit || ''
  const dec = p.decimals == null ? 1 : p.decimals
  const celdas = filas.flatMap((f) => f.celdas)
  const numeros = celdas.map((c) => Number(c.valor)).filter((v) => Number.isFinite(v))
  if (!filas.length || !columnas.length) {
    return h('div', {
      ref,
      className: cx('nc-matrix', 'nc-chart--vacia', p.className),
      style: { height: H },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const modo = p.modo || (p.valor === 'cumplimiento' ? 'semaforo' : 'escala')
  const minimo = p.min == null ? Math.min(...numeros) : p.min
  const maximo = p.max == null ? Math.max(...numeros) : p.max
  const rango = maximo - minimo || 1
  const padL = p.etiquetaAncho || Math.min(132, Math.max(70, W * 0.22))
  const padT = 22
  const padR = 4
  const padB = 4
  const iw = Math.max(20, W - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const cw = iw / columnas.length
  const ch = ih / filas.length
  const fuente = Math.max(9, Math.min(13, ch * 0.42))
  const tono = (c) => {
    if (c.tono) return c.tono
    if (modo !== 'semaforo') return null
    const meta = p.meta?.valor ?? p.meta ?? 95
    const tolerancia = p.meta?.tolerancia ?? p.tolerancia ?? 5
    const v = Number(c.valor)
    if (!Number.isFinite(v)) return null
    if (v >= meta) return 'success'
    return v >= meta - Math.abs(meta) * tolerancia / 100 ? 'warning' : 'danger'
  }
  return h('div', {
    ref,
    className: cx('nc-matrix', p.className),
    style: { height: H },
  }, h('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    style: { width: '100%', height: H },
    role: 'img',
    'aria-label': p.label || `Matriz de ${filas.length} filas y ${columnas.length} columnas`,
    onMouseLeave: () => setHover(null),
  },
  columnas.map((col, j) => h('text', {
    key: `c${j}`,
    x: padL + j * cw + cw / 2,
    y: 14,
    textAnchor: 'middle',
    className: 'nc-trend__axis',
  }, col)),
  filas.map((fila, i) => h('text', {
    key: `f${i}`,
    x: padL - 8,
    y: padT + i * ch + ch / 2 + 4,
    textAnchor: 'end',
    className: 'nc-trend__axis',
  }, String(fila.etiqueta).length > 20 ? `${String(fila.etiqueta).slice(0, 18)}…` : fila.etiqueta)),
  filas.map((fila, i) => columnas.map((col, j) => {
    const celda = fila.celdas.find((c) => (c.columna ?? c.label ?? c.etiqueta) === col) || {}
    const valor = Number(celda.valor)
    const tiene = Number.isFinite(valor)
    const t = tono(celda)
    const intensidad = tiene ? 0.12 + Math.max(0, Math.min(1, (valor - minimo) / rango)) * 0.7 : 0
    const dim = celda.dimension ?? fila.dimension ?? p.dimension
    const val = celda.dimensionValor ?? celda.dimension_valor ?? fila.dimensionValor ?? fila.dimension_valor
    const clic = p.alSeleccionar && dim && val != null
    const props = clic ? {
      role: 'button',
      tabIndex: 0,
      className: 'nc-seleccionable',
      'aria-pressed': esSeleccion(p.seleccion, dim, val),
      'aria-label': `${fila.etiqueta}, ${col}: ${tiene ? fmt(valor, dec) : 'sin datos'}${unit ? ` ${unit}` : ''}`,
      onClick: () => p.alSeleccionar({ dimension: dim, valor: val }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: dim, valor: val })
        }
      },
    } : {}
    return h('g', {
      key: `${i}-${j}`,
      ...props,
      style: { opacity: p.seleccion && !esSeleccion(p.seleccion, dim, val) ? atenuado(p.seleccion, dim, val) : 1 },
      onMouseEnter: () => setHover({ fila: fila.etiqueta, col, valor, x: padL + j * cw + cw / 2, y: padT + i * ch }),
    }, h('rect', {
      x: padL + j * cw + 1,
      y: padT + i * ch + 1,
      width: Math.max(1, cw - 2),
      height: Math.max(1, ch - 2),
      rx: Math.min(4, cw / 6),
      fill: tiene ? (t ? colorTono(`${t}-soft`) : 'var(--chart-area)') : 'var(--surface-muted)',
      fillOpacity: tiene && !t ? intensidad : 1,
    }), tiene ? h('text', {
      x: padL + j * cw + cw / 2,
      y: padT + i * ch + ch / 2 + fuente * 0.35,
      textAnchor: 'middle',
      style: {
        fontSize: fuente,
        fontWeight: 700,
        fill: t ? colorTono(t) : 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
      },
    }, fmt(valor, dec)) : null)
  })),
  ),
  hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: H,
  }, h('span', { className: 'nc-tooltip__time' }, `${hover.fila} · ${hover.col}`),
    h('span', { className: 'nc-tooltip__value' }, Number.isFinite(hover.valor) ? fmt(hover.valor, dec) : 'Sin datos', unit ? h('small', null, ` ${unit}`) : null)) : null)
}

export { MatrixChart }
