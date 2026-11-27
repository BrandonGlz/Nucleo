import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, colorSerie, colorTono, esSeleccion, atenuado } from './comun.js'

const h = React.createElement
const { useState } = React

// Dona con el total (o el texto que se pida) al centro. Nace de la dona de Reportes para que ese
// módulo use el componente del sistema de diseño sin cambiar su dibujo.
function DonutChart(p) {
  const datos = (p.datos || p.partes || []).map((d) => ({
    label: d.label ?? d.etiqueta ?? d.variable ?? '',
    value: Number(d.value ?? d.valor ?? d.alertas ?? 0),
    color: d.color || (d.tono ? colorTono(d.tono) : null),
    tono: d.tono || null,
    dimension: d.dimension,
    dimensionValor: d.dimensionValor ?? d.dimension_valor,
  }))
  const total = p.total == null ? datos.reduce((s, d) => s + Math.max(0, d.value), 0) : Number(p.total)
  const [hover, setHover] = useState(null)
  const wr = useWidth(132)
  const [ref, W] = wr
  const interactivo = p.interactivo !== false
  if (!datos.length || total <= 0) {
    return h('div', {
      ref,
      className: cx('nc-donut', 'nc-chart--vacia', p.className),
      style: { height: p.height || 132 },
    }, p.vacio || 'Sin datos en el periodo')
  }
  const r = 52
  const largo = 2 * Math.PI * r
  const tramos = datos.map((d) => (Math.max(0, d.value) / total) * largo)
  const inicios = tramos.map((_, i) => tramos.slice(0, i).reduce((s, x) => s + x, 0))
  const color = (d, i) => d.color || (d.tono ? colorTono(d.tono) : colorSerie(i))
  const svg = h('svg', {
    ref: interactivo ? ref : undefined,
    className: cx('ui-dona', p.svgClassName),
    viewBox: '0 0 132 132',
    role: 'img',
    'aria-label': p.ariaLabel || `Distribución de ${datos.length} partes, total ${fmt(total, 0)}`,
    onMouseLeave: interactivo ? () => setHover(null) : undefined,
  },
  h('circle', { cx: 66, cy: 66, r, fill: 'none', stroke: 'var(--surface-muted)', strokeWidth: 18 }),
  datos.map((d, i) => {
    const seleccionado = esSeleccion(p.seleccion, d.dimension, d.dimensionValor ?? d.label)
    const clic = p.alSeleccionar && d.dimension
    const props = clic ? {
      role: 'button',
      tabIndex: 0,
      className: 'nc-seleccionable',
      'aria-pressed': seleccionado,
      'aria-label': `${d.label}: ${fmt(d.value, p.decimals == null ? 0 : p.decimals)}`,
      onClick: () => p.alSeleccionar({ dimension: d.dimension, valor: d.dimensionValor ?? d.label }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: d.dimension, valor: d.dimensionValor ?? d.label })
        }
      },
    } : {}
    return h('circle', {
      key: d.label + i,
      cx: 66,
      cy: 66,
      r,
      fill: 'none',
      stroke: color(d, i),
      strokeWidth: 18,
      strokeDasharray: `${tramos[i]} ${largo - tramos[i]}`,
      strokeDashoffset: -inicios[i],
      transform: 'rotate(-90 66 66)',
      opacity: p.seleccion && !seleccionado ? atenuado(p.seleccion, d.dimension, d.dimensionValor ?? d.label) : 1,
      ...props,
      onMouseEnter: interactivo ? (e) => {
        const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect()
        const escala = rect.width / 132
        const angulo = (-90 + (inicios[i] + tramos[i] / 2) / largo * 360) * Math.PI / 180
        setHover({ i, x: (66 + r * Math.cos(angulo)) * escala, y: (66 + r * Math.sin(angulo)) * escala })
      } : undefined,
    })
  }),
  h('text', {
    x: 66,
    y: 74,
    textAnchor: 'middle',
    fontSize: 24,
    fontWeight: 800,
    fill: 'var(--text-primary)',
  }, p.centro ?? fmt(total, 0)))
  if (!interactivo && !p.leyenda) return svg
  return h('div', {
    ref,
    className: cx('nc-donut', p.className),
  }, h('div', { className: 'nc-donut__lienzo', style: { position: 'relative' } }, svg, hover ? h(ChartTooltip, {
    x: hover.x,
    y: hover.y,
    ancho: W,
    alto: W,
  }, h('span', { className: 'nc-tooltip__time' }, datos[hover.i].label),
    h('span', { className: 'nc-tooltip__value' }, fmt(datos[hover.i].value, p.decimals == null ? 0 : p.decimals),
      h('small', null, ` · ${Math.round(datos[hover.i].value / total * 100)} %`))) : null),
  p.leyenda ? h('ul', { className: 'nc-donut__leyenda' }, datos.map((d, i) => {
    const clic = p.alSeleccionar && d.dimension
    return h('li', { key: d.label + i },
      h(clic ? 'button' : 'span', {
        type: clic ? 'button' : undefined,
        className: cx('nc-legend__item', clic && 'nc-legend__item--boton'),
        'aria-pressed': clic ? esSeleccion(p.seleccion, d.dimension, d.dimensionValor ?? d.label) : undefined,
        onClick: clic ? () => p.alSeleccionar({ dimension: d.dimension, valor: d.dimensionValor ?? d.label }) : undefined,
      }, h('i', { style: { background: color(d, i) } }), d.label),
      h('strong', { className: 'ui-num' }, fmt(d.value, p.decimals == null ? 0 : p.decimals)))
  })) : null)
}

export { DonutChart }
