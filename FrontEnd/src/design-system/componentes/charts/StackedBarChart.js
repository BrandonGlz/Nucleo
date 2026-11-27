import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, colorSerie, colorTono, esSeleccion } from './comun.js'

const h = React.createElement
const { useState } = React

function normalizar(p) {
  const filas = (p.data || p.filas || []).map((fila) => ({
    label: fila.label ?? fila.etiqueta ?? '',
    dimension: fila.dimension ?? p.dimension,
    dimensionValor: fila.dimensionValor ?? fila.dimension_valor,
    segmentos: (fila.segmentos || fila.segments || []).map((s) => ({
      label: s.label ?? s.etiqueta ?? '',
      value: Number(s.value ?? s.valor ?? 0),
      color: s.color || null,
      tono: s.tono || null,
      dimension: s.dimension ?? fila.dimension ?? p.dimension,
      dimensionValor: s.dimensionValor ?? s.dimension_valor ?? fila.dimensionValor ?? fila.dimension_valor,
    })),
  }))
  const etiquetas = []
  filas.forEach((fila) => {
    fila.segmentos.forEach((s) => {
      if (!etiquetas.includes(s.label)) etiquetas.push(s.label)
    })
  })
  return { filas, etiquetas }
}

// Barras apiladas por categoría; en modo 100 % cada barra suma el mismo alto.
function StackedBarChart(p) {
  const { filas, etiquetas } = normalizar(p)
  const H = p.height || 220
  const wr = useWidth(520)
  const [ref, W] = wr
  const [hover, setHover] = useState(null)
  const leyenda = p.leyenda !== false && etiquetas.length > 1
  const legendH = leyenda ? 26 : 0
  const altoSvg = Math.max(40, H - legendH)
  const porcentaje = Boolean(p.porcentaje)
  const unit = p.unit || ''
  const dec = p.decimals == null ? 1 : p.decimals
  const totales = filas.map((fila) => fila.segmentos.reduce((s, x) => s + Math.max(0, x.value), 0))
  const mayor = Math.max(100, ...totales) || 100
  const hayDatos = filas.length > 0 && totales.some((t) => t > 0)
  if (!hayDatos) {
    return h('div', {
      ref,
      className: cx('nc-stacked', 'nc-chart--vacia', p.className),
      style: { height: H },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const padL = 34
  const padR = 10
  const padT = 8
  const padB = 26
  const iw = Math.max(20, W - padL - padR)
  const ih = Math.max(10, altoSvg - padT - padB)
  const ancho = iw / Math.max(1, filas.length)
  const bw = Math.min(46, ancho * 0.62)
  const valor = (seg, total) => (porcentaje ? (total ? seg.value / total * 100 : 0) : seg.value)
  const color = (seg) => seg.color || (seg.tono ? colorTono(seg.tono) : colorSerie(etiquetas.indexOf(seg.label)))
  const seleccionado = (seg) => p.seleccion && esSeleccion(p.seleccion, seg.dimension, seg.dimensionValor)
  return h('div', {
    ref,
    className: cx('nc-stacked', p.className),
    style: { height: H },
  },
  leyenda ? h('div', { className: 'nc-legend', role: 'list' }, etiquetas.map((etiqueta, i) => {
    const primera = filas.flatMap((f) => f.segmentos).find((s) => s.label === etiqueta)
    const clic = p.alSeleccionar && primera?.dimension && primera?.dimensionValor != null
    const props = clic ? {
      role: 'button',
      tabIndex: 0,
      'aria-pressed': esSeleccion(p.seleccion, primera.dimension, primera.dimensionValor),
      onClick: () => p.alSeleccionar({ dimension: primera.dimension, valor: primera.dimensionValor }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: primera.dimension, valor: primera.dimensionValor })
        }
      },
    } : {}
    return h(clic ? 'button' : 'span', {
      key: etiqueta,
      type: clic ? 'button' : undefined,
      className: cx('nc-legend__item', clic && 'nc-legend__item--boton'),
      style: clic && p.seleccion && !esSeleccion(p.seleccion, primera.dimension, primera.dimensionValor)
        ? { opacity: 0.35 }
        : undefined,
      ...props,
    }, h('i', { style: { background: primera?.color || (primera?.tono ? colorTono(primera.tono) : colorSerie(i)) } }), etiqueta)
  })) : null,
  h('svg', {
    width: W,
    height: altoSvg,
    viewBox: `0 0 ${W} ${altoSvg}`,
    style: { width: '100%', height: altoSvg },
    role: 'img',
    'aria-label': p.label || `Barras apiladas: ${filas.length} categorías`,
    onMouseLeave: () => setHover(null),
  },
  [0, 0.25, 0.5, 0.75, 1].map((f, i) => h('g', { key: `g${i}` },
    h('line', { x1: padL, x2: W - padR, y1: padT + ih - f * ih, y2: padT + ih - f * ih, className: 'nc-trend__grid' }),
    h('text', { x: padL - 8, y: padT + ih - f * ih + 4, textAnchor: 'end', className: 'nc-trend__axis' },
      porcentaje ? `${Math.round(f * 100)} %` : fmt(f * mayor, 0)))),
  filas.map((fila, i) => {
    const total = totales[i]
    let acumulado = 0
    const x = padL + i * ancho + (ancho - bw) / 2
    return h('g', { key: `fila${i}` },
      fila.segmentos.map((seg, j) => {
        const v = valor(seg, total)
        if (v <= 0) return null
        const alto = porcentaje ? v / 100 * ih : v / mayor * ih
        const y = padT + ih - acumulado - alto
        acumulado += alto
        const opacidad = p.seleccion && !seleccionado(seg) ? 0.32 : 1
        const props = p.alSeleccionar && seg.dimension && seg.dimensionValor != null ? {
          role: 'button',
          tabIndex: 0,
          className: 'nc-seleccionable',
          'aria-pressed': seleccionado(seg),
          'aria-label': `${fila.label}, ${seg.label}: ${fmt(v, dec)}${porcentaje ? ' %' : unit ? ` ${unit}` : ''}`,
          onClick: () => p.alSeleccionar({ dimension: seg.dimension, valor: seg.dimensionValor }),
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              p.alSeleccionar({ dimension: seg.dimension, valor: seg.dimensionValor })
            }
          },
        } : {}
        return h('g', { key: `seg${j}`, ...props, style: { opacity: opacidad } },
          h('rect', {
            x,
            y,
            width: bw,
            height: Math.max(1, alto),
            fill: color(seg),
            onMouseEnter: (e) => {
              const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
              setHover({ i, j, x: x + bw / 2, y, cliente: e.clientX - r.left })
            },
          }))
      }),
      h('text', {
        x: x + bw / 2,
        y: altoSvg - 7,
        textAnchor: 'middle',
        className: 'nc-trend__axis',
      }, fila.label))
  })),
  hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: altoSvg,
  }, h('span', { className: 'nc-tooltip__time' }, filas[hover.i].label),
    h('span', { className: 'nc-tooltip__serie' },
      h('i', { style: { background: color(filas[hover.i].segmentos[hover.j]) } }),
      h('span', { className: 'nc-tooltip__serie-nombre' }, filas[hover.i].segmentos[hover.j].label),
      h('strong', { className: 'ui-num' },
        `${fmt(filas[hover.i].segmentos[hover.j].value, dec)}${unit ? ` ${unit}` : ''}${porcentaje ? ` · ${Math.round(valor(filas[hover.i].segmentos[hover.j], totales[hover.i]))} %` : ''}`))) : null)
}

export { StackedBarChart }
