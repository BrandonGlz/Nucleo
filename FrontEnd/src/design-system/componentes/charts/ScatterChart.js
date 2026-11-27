import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, atenuado, colorSerie, escalaBonita, esSeleccion } from './comun.js'

const h = React.createElement
const { useState } = React

// Dispersión X–Y; cada grupo (por omisión el área) toma un color de la paleta y se puede filtrar.
function ScatterChart(p) {
  const puntos = (p.puntos || p.data || [])
    .map((d) => ({
      ...d,
      x: Number(d.x),
      y: Number(d.y),
      grupo: String(d.area ?? d.area_num ?? d.grupo ?? d.dispositivo ?? ''),
      valorGrupo: d.dimensionValor ?? d.dimension_valor ?? d.area_num ?? d.dispositivo_num ?? d.area ?? d.grupo ?? '',
      etiqueta: d.etiqueta ?? d.label ?? '',
    }))
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y))
  const wr = useWidth(520)
  const [ref, W] = wr
  const [hover, setHover] = useState(null)
  const H = p.height || 260
  const grupos = []
  puntos.forEach((d) => {
    const clave = String(d.grupo)
    if (!grupos.some((g) => g.clave === clave)) grupos.push({ clave, nombre: d.area ?? d.grupo ?? clave, valor: d.valorGrupo })
  })
  if (!puntos.length) {
    return h('div', {
      ref,
      className: cx('nc-scatter', 'nc-chart--vacia', p.className),
      style: { height: H },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const padL = 44
  const padR = 14
  const padT = 14
  const padB = 30
  const iw = Math.max(20, W - padL - padR)
  const ih = Math.max(20, H - padT - padB)
  const ex = escalaBonita(Math.min(...puntos.map((d) => d.x)), Math.max(...puntos.map((d) => d.x)), 4, p.minX, p.maxX)
  const ey = escalaBonita(Math.min(...puntos.map((d) => d.y)), Math.max(...puntos.map((d) => d.y)), 4, p.minY, p.maxY)
  const X = (v) => padL + (v - ex.mn) / (ex.mx - ex.mn || 1) * iw
  const Y = (v) => padT + ih - (v - ey.mn) / (ey.mx - ey.mn || 1) * ih
  const decX = p.decimalsX ?? 1
  const decY = p.decimalsY ?? 1
  const color = (d) => {
    if (d.color) return d.color
    if (d.tono) return `var(--${d.tono})`
    const i = grupos.findIndex((g) => g.clave === String(d.grupo))
    return colorSerie(Math.max(0, i))
  }
  return h('div', {
    ref,
    className: cx('nc-scatter', p.className),
    style: { height: H },
  },
  grupos.length > 1 ? h('div', { className: 'nc-legend', role: 'list' }, grupos.map((g, i) => {
    const clic = p.alSeleccionar && p.dimension
    const valor = p.valorGrupo?.(g) ?? g.valor
    const props = clic ? {
      role: 'button',
      tabIndex: 0,
      'aria-pressed': esSeleccion(p.seleccion, p.dimension, valor),
      onClick: () => p.alSeleccionar({ dimension: p.dimension, valor }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: p.dimension, valor })
        }
      },
    } : {}
    return h(clic ? 'button' : 'span', {
      key: g.clave,
      type: clic ? 'button' : undefined,
      className: cx('nc-legend__item', clic && 'nc-legend__item--boton'),
      style: clic && p.seleccion && !esSeleccion(p.seleccion, p.dimension, valor) ? { opacity: 0.35 } : undefined,
      ...props,
    }, h('i', { style: { background: colorSerie(i) } }), g.nombre)
  })) : null,
  h('svg', {
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    style: { width: '100%', height: H },
    role: 'img',
    'aria-label': p.label || `Dispersión de ${puntos.length} puntos`,
    onMouseLeave: () => setHover(null),
  },
  ey.ticks.map((t, i) => h('g', { key: `y${i}` },
    h('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), className: 'nc-trend__grid' }),
    h('text', { x: padL - 8, y: Y(t) + 4, textAnchor: 'end', className: 'nc-trend__axis' }, fmt(t, 0)))),
  ex.ticks.map((t, i) => h('text', {
    key: `x${i}`,
    x: X(t),
    y: H - 8,
    textAnchor: 'middle',
    className: 'nc-trend__axis',
  }, fmt(t, 0))),
  puntos.map((d, i) => {
    const elegido = esSeleccion(p.seleccion, p.dimension, p.valorGrupo?.(d) ?? d.valorGrupo)
    const clic = p.alSeleccionar && p.dimension
    const props = clic ? {
      role: 'button',
      tabIndex: 0,
      className: 'nc-seleccionable',
      'aria-pressed': elegido,
      'aria-label': `${d.etiqueta || d.grupo}: ${fmt(d.x, decX)}, ${fmt(d.y, decY)}`,
      onClick: () => p.alSeleccionar({ dimension: p.dimension, valor: p.valorGrupo?.(d) ?? d.valorGrupo }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: p.dimension, valor: p.valorGrupo?.(d) ?? d.valorGrupo })
        }
      },
    } : {}
    return h('circle', {
      key: i,
      cx: X(d.x),
      cy: Y(d.y),
      r: 3.4,
      fill: color(d),
      opacity: atenuado(p.seleccion, p.dimension, p.valorGrupo?.(d) ?? d.valorGrupo),
      ...props,
      onMouseEnter: () => setHover({ punto: d, x: X(d.x), y: Y(d.y) }),
    })
  }),
  ),
  hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: H,
  }, h('span', { className: 'nc-tooltip__time' }, hover.punto.etiqueta || hover.punto.grupo || 'Punto'),
    h('span', { className: 'nc-tooltip__serie' },
      h('i', { style: { background: color(hover.punto) } }),
      h('span', { className: 'nc-tooltip__serie-nombre' }, p.xLabel || 'X'),
      h('strong', { className: 'ui-num' }, fmt(hover.punto.x, decX), p.unitX ? ` ${p.unitX}` : '')),
    h('span', { className: 'nc-tooltip__serie' },
      h('i', { style: { background: color(hover.punto) } }),
      h('span', { className: 'nc-tooltip__serie-nombre' }, p.yLabel || 'Y'),
      h('strong', { className: 'ui-num' }, fmt(hover.punto.y, decY), p.unitY ? ` ${p.unitY}` : ''))) : null)
}

export { ScatterChart }
