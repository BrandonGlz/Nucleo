import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, colorTono, esSeleccion } from './comun.js'

const h = React.createElement
const { useState } = React
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

// Mapa de calor 7 × 24: día de la semana contra hora del día. El color es una opacidad del token
// (`--chart-area` o el tono que se pida), así funciona igual en claro y oscuro.
function Heatmap(p) {
  const valores = p.valores || p.datos || []
  const wr = useWidth(520)
  const [ref, W] = wr
  const [hover, setHover] = useState(null)
  const H = p.height || 210
  const unit = p.unit || ''
  const leyenda = p.leyenda !== false
  const altoLeyenda = leyenda ? 18 : 0
  const dec = p.decimals == null ? 1 : p.decimals
  const numeros = valores.flat().filter((v) => v != null && Number.isFinite(Number(v))).map(Number)
  if (!numeros.length) {
    return h('div', {
      ref,
      className: cx('nc-heatmap', 'nc-chart--vacia', p.className),
      style: { height: H },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const minimo = p.min == null ? Math.min(...numeros) : p.min
  const maximo = p.max == null ? Math.max(...numeros) : p.max
  const rango = maximo - minimo || 1
  const padL = 32
  const padR = 6
  const padT = 6
  const padB = 20
  const iw = Math.max(20, W - padL - padR)
  const altoSvg = Math.max(60, H - altoLeyenda)
  const ih = Math.max(20, altoSvg - padT - padB)
  const cw = iw / 24
  const ch = ih / 7
  const color = colorTono(p.tono || (p.alertas ? 'warning' : 'chart-area'))
  return h('div', {
    ref,
    className: cx('nc-heatmap', p.className),
    style: { height: H },
  }, h('svg', {
    width: W,
    height: altoSvg,
    viewBox: `0 0 ${W} ${altoSvg}`,
    style: { width: '100%', height: altoSvg },
    role: 'img',
    'aria-label': p.label || `Mapa de calor por día y hora; mínimo ${fmt(minimo, dec)}, máximo ${fmt(maximo, dec)}${unit ? ` ${unit}` : ''}`,
    onMouseLeave: () => setHover(null),
  },
  DIAS.map((dia, i) => h('text', {
    key: dia,
    x: padL - 7,
    y: padT + i * ch + ch / 2 + 4,
    textAnchor: 'end',
    className: 'nc-trend__axis',
  }, dia)),
  [0, 3, 6, 9, 12, 15, 18, 21, 23].map((hora) => h('text', {
    key: `h${hora}`,
    x: padL + hora * cw + cw / 2,
    y: altoSvg - 5,
    textAnchor: 'middle',
    className: 'nc-trend__axis',
  }, hora)),
  valores.map((fila, dia) => (fila || []).map((valor, hora) => {
    const v = valor == null ? null : Number(valor)
    const opacidad = v == null ? 0 : 0.08 + Math.max(0, Math.min(1, (v - minimo) / rango)) * 0.84
    const x = padL + hora * cw
    const y = padT + dia * ch
    const clic = p.alSeleccionar && p.dimension
    const valorCelda = p.valorPorCelda?.[dia]?.[hora] ?? `${dia}-${hora}`
    const elegido = esSeleccion(p.seleccion, p.dimension, valorCelda)
    return h('rect', {
      key: `${dia}-${hora}`,
      x: x + 0.5,
      y: y + 0.5,
      width: Math.max(1, cw - 1),
      height: Math.max(1, ch - 1),
      rx: Math.min(3, cw / 4),
      fill: v == null ? 'var(--surface-muted)' : color,
      fillOpacity: v == null ? 1 : opacidad,
      opacity: p.seleccion && p.dimension && !elegido ? 0.32 : 1,
      className: clic ? 'nc-seleccionable' : undefined,
      role: clic ? 'button' : undefined,
      tabIndex: clic ? 0 : undefined,
      'aria-label': clic ? `${DIAS[dia]} ${hora}:00: ${v == null ? 'sin datos' : fmt(v, dec)}${unit ? ` ${unit}` : ''}` : undefined,
      'aria-pressed': clic ? elegido : undefined,
      onClick: clic ? () => p.alSeleccionar({ dimension: p.dimension, valor: p.valorPorCelda?.[dia]?.[hora] ?? `${dia}-${hora}` }) : undefined,
      onKeyDown: clic ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: p.dimension, valor: p.valorPorCelda?.[dia]?.[hora] ?? `${dia}-${hora}` })
        }
      } : undefined,
      onMouseEnter: () => setHover({ dia, hora, valor: v, x: x + cw / 2, y }),
    })
  })),
  ),
  hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: altoSvg,
  }, h('span', { className: 'nc-tooltip__time' }, `${DIAS[hover.dia]} · ${hover.hora}:00`),
    h('span', { className: 'nc-tooltip__value' }, hover.valor == null ? 'Sin datos' : fmt(hover.valor, dec), unit ? h('small', null, ` ${unit}`) : null)) : null,
  leyenda ? h('div', { className: 'nc-heatmap__escala' },
    h('span', null, fmt(minimo, dec)),
    h('span', {
      className: 'nc-heatmap__gradiente',
      style: { background: `linear-gradient(90deg, transparent, ${color})` },
    }),
    h('span', null, `${fmt(maximo, dec)}${unit ? ` ${unit}` : ''}`)) : null)
}

export { Heatmap }
