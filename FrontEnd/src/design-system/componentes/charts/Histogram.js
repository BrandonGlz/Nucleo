import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip } from './comun.js'

const h = React.createElement
const { useState } = React

// Histograma de cubetas ya calculadas por el servidor. Las líneas verticales marcan los umbrales
// del dispositivo cuando la tarjeta los conoce.
function Histogram(p) {
  const cubetas = p.cubetas || p.datos || []
  const wr = useWidth(420)
  const [ref, W] = wr
  const [hover, setHover] = useState(null)
  const H = p.height || 200
  const unit = p.unit || ''
  const dec = p.decimals == null ? 1 : p.decimals
  const total = cubetas.reduce((s, c) => s + Number(c.valor || 0), 0)
  if (!cubetas.length || !total) {
    return h('div', {
      ref,
      className: cx('nc-histogram', 'nc-chart--vacia', p.className),
      style: { height: H },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const padL = 34
  const padR = 10
  const padT = 20
  const padB = 26
  const iw = Math.max(20, W - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const max = p.max || Math.max(...cubetas.map((c) => Number(c.valor || 0))) * 1.1 || 1
  const ancho = iw / cubetas.length
  const desde = Number(cubetas[0].desde)
  const hasta = Number(cubetas[cubetas.length - 1].hasta)
  const X = (v) => padL + (v - desde) / (hasta - desde || 1) * iw
  const umbrales = []
  if (Array.isArray(p.threshold)) umbrales.push(...p.threshold.filter((v) => v != null))
  else if (p.threshold) {
    if (p.threshold.min != null) umbrales.push(p.threshold.min)
    if (p.threshold.max != null) umbrales.push(p.threshold.max)
  }
  const cada = Math.max(1, Math.ceil(cubetas.length / Math.max(2, Math.floor(iw / 54))))
  return h('div', {
    ref,
    className: cx('nc-histogram', p.className),
    style: { height: H },
  }, h('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    style: { width: '100%', height: H },
    role: 'img',
    'aria-label': p.label || `Histograma de ${cubetas.length} cubetas, ${fmt(total, 0)} datos`,
    onMouseLeave: () => setHover(null),
  },
  [0, 0.5, 1].map((f, i) => h('line', {
    key: `g${i}`,
    x1: padL,
    x2: W - padR,
    y1: padT + ih - f * ih,
    y2: padT + ih - f * ih,
    className: 'nc-trend__grid',
  })),
  cubetas.map((c, i) => {
    const v = Number(c.valor || 0)
    const alto = Math.max(1, v / max * ih)
    const x = padL + i * ancho
    const y = padT + ih - alto
    return h('g', {
      key: i,
      onMouseEnter: () => setHover({ cubeta: c, valor: v, x: x + ancho / 2, y }),
    }, h('rect', {
      x: x + Math.min(1, ancho * 0.08),
      y,
      width: Math.max(1, ancho * 0.84),
      height: alto,
      rx: Math.min(3, ancho / 4),
      className: 'nc-histogram__barra',
    }), i % cada === 0 ? h('text', {
      x: x + ancho / 2,
      y: H - 7,
      textAnchor: 'middle',
      className: 'nc-trend__axis',
    }, fmt(c.desde, dec)) : null)
  }),
  umbrales.map((v, i) => h('g', { key: `u${i}`, className: 'nc-histogram__umbral' },
    h('line', { x1: X(v), x2: X(v), y1: padT, y2: padT + ih }),
    h('text', { x: X(v), y: padT - 6, textAnchor: 'middle' }, fmt(v, dec)))),
  ),
  hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: H,
  }, h('span', { className: 'nc-tooltip__time' }, `${fmt(hover.cubeta.desde, dec)}–${fmt(hover.cubeta.hasta, dec)}${unit ? ` ${unit}` : ''}`),
    h('span', { className: 'nc-tooltip__value' }, fmt(hover.valor, 0), h('small', null, ` datos · ${Math.round(hover.valor / total * 100)} %`))) : null)
}

export { Histogram }
