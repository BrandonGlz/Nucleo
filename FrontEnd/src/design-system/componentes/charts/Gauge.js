import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { colorRelleno, estadoMeta } from './comun.js'

const h = React.createElement

// Medio aro con valor y marca de meta. El arco va de 180° a 360° para que la lectura quede arriba.
function Gauge(p) {
  const wr = useWidth(280)
  const [ref, W] = wr
  const H = p.height || 160
  const unidad = p.unit || ''
  const dec = p.decimals == null ? 1 : p.decimals
  const minimo = p.min == null ? 0 : p.min
  const maximo = p.max == null ? 100 : p.max
  const valor = p.valor == null || !Number.isFinite(Number(p.valor)) ? null : Number(p.valor)
  const meta = p.meta && typeof p.meta === 'object' ? p.meta.valor : p.meta
  const tono = p.tono || estadoMeta(valor, p.meta) || 'chart-line'
  const cx0 = 100
  const cy0 = 100
  const r = 76
  const sw = 14
  const punto = (a) => {
    const rad = a * Math.PI / 180
    return [cx0 + r * Math.cos(rad), cy0 + r * Math.sin(rad)]
  }
  const arco = (a0, a1) => {
    const p0 = punto(a0)
    const p1 = punto(a1)
    const grande = a1 - a0 > 180 ? 1 : 0
    return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${r} ${r} 0 ${grande} 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`
  }
  const fraccion = valor == null ? 0 : Math.max(0, Math.min(1, (valor - minimo) / (maximo - minimo || 1)))
  const marca = meta == null ? null : Math.max(0, Math.min(1, (meta - minimo) / (maximo - minimo || 1)))
  const color = colorRelleno(tono)
  const ancho = Math.max(180, W)
  const alto = Math.min(H, ancho * 0.6)
  return h('div', {
    ref,
    className: cx('nc-gauge2', p.className),
    style: { height: H },
  }, h('svg', {
    width: ancho,
    height: alto,
    viewBox: '0 0 200 116',
    preserveAspectRatio: 'xMidYMid meet',
    style: { width: '100%', height: '100%' },
    role: 'img',
    'aria-label': `${p.label || 'Medidor'}: ${valor == null ? 'sin datos' : `${fmt(valor, dec)}${unidad ? ` ${unidad}` : ''}`}${meta == null ? '' : `, meta ${fmt(meta, dec)}${unidad ? ` ${unidad}` : ''}`}`,
  }, h('path', {
    d: arco(180, 360),
    className: 'nc-gauge2__track',
    strokeWidth: sw,
  }), fraccion > 0 ? h('path', {
    d: arco(180, 180 + Math.max(1, fraccion * 180)),
    className: 'nc-gauge2__valor',
    style: { stroke: color },
    strokeWidth: sw,
  }) : null, marca != null ? (() => {
    const a = 180 + marca * 180
    const rad = a * Math.PI / 180
    const x1 = cx0 + (r - sw / 2) * Math.cos(rad)
    const y1 = cy0 + (r - sw / 2) * Math.sin(rad)
    const x2 = cx0 + (r + sw / 2) * Math.cos(rad)
    const y2 = cy0 + (r + sw / 2) * Math.sin(rad)
    return h('line', { x1, y1, x2, y2, className: 'nc-gauge2__meta' })
  })() : null,
  h('text', {
    x: cx0,
    y: 80,
    textAnchor: 'middle',
    className: 'nc-gauge2__numero',
    style: { fill: color },
  }, valor == null ? '—' : fmt(valor, dec),
    unidad ? h('tspan', { className: 'nc-gauge2__unidad', dx: 4 }, unidad) : null),
  meta != null ? h('text', {
    x: cx0,
    y: 108,
    textAnchor: 'middle',
    className: 'nc-gauge2__meta-texto',
  }, `Meta ${p.sentido === 'menor' ? '≤' : '≥'} ${fmt(meta, dec)}${unidad ? ` ${unidad}` : ''}`) : null))
}

export { Gauge }
