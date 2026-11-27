import React from 'react'
import { cx, fmt } from '../core/nc-lib.js'
import { esSeleccion } from './comun.js'

const h = React.createElement

// Ranking con barra fina, valor y variación. Cada fila es un botón cuando hay filtro cruzado.
function RankingList(p) {
  const filas = (p.filas || p.data || []).map((f) => ({
    label: f.label ?? f.etiqueta ?? f.nombre ?? '',
    valor: Number(f.valor ?? f.value ?? 0),
    variacion: f.variacion,
    dimension: f.dimension,
    dimensionValor: f.dimensionValor ?? f.dimension_valor,
  }))
  const dec = p.decimales == null ? 1 : p.decimales
  const sentido = p.sentido || p.meta?.sentido || 'mayor'
  if (!filas.length) {
    return h('div', { className: cx('nc-ranking', 'nc-chart--vacia', p.className) },
      p.vacio || 'Sin datos en el periodo')
  }
  const max = p.max || Math.max(...filas.map((f) => Math.abs(f.valor))) || 1
  return h('ul', {
    className: cx('nc-ranking', p.className),
    role: 'list',
    'aria-label': p.label || `Ranking de ${filas.length} elementos`,
  }, filas.map((fila, i) => {
    const seleccionado = esSeleccion(p.seleccion, fila.dimension, fila.dimensionValor)
    const clic = p.alSeleccionar && fila.dimension && fila.dimensionValor != null
    const cambio = fila.variacion == null ? null : Number(fila.variacion)
    const tono = cambio == null || cambio === 0 ? 'neutral' : (sentido === 'menor' ? cambio < 0 : cambio > 0) ? 'success' : 'danger'
    const props = clic ? {
      type: 'button',
      className: 'nc-ranking__fila nc-seleccionable',
      'aria-pressed': seleccionado,
      'aria-label': `${fila.label}: ${fmt(fila.valor, dec)}${p.unidad ? ` ${p.unidad}` : ''}`,
      onClick: () => p.alSeleccionar({ dimension: fila.dimension, valor: fila.dimensionValor }),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          p.alSeleccionar({ dimension: fila.dimension, valor: fila.dimensionValor })
        }
      },
    } : { className: 'nc-ranking__fila' }
    return h('li', { key: fila.label + i, className: 'nc-ranking__item' },
      h(clic ? 'button' : 'div', {
        ...props,
        style: { opacity: p.seleccion && !seleccionado ? 0.35 : 1 },
      },
      h('span', { className: 'nc-ranking__puesto' }, i + 1),
      h('span', { className: 'nc-ranking__texto' },
        h('span', { className: 'nc-ranking__etiqueta' }, fila.label),
        h('span', { className: 'nc-ranking__pista' },
          h('span', { className: 'nc-ranking__barra', style: { width: `${Math.max(2, Math.min(100, Math.abs(fila.valor) / max * 100))}%` } }))),
      h('span', { className: 'nc-ranking__valor ui-num' },
        fmt(fila.valor, dec), p.unidad ? h('small', null, ` ${p.unidad}`) : null,
        cambio != null ? h('small', { className: `nc-ranking__cambio is-${tono}` },
          `${cambio > 0 ? '▲' : cambio < 0 ? '▼' : '■'} ${Math.abs(cambio).toFixed(1)}`) : null)))
  }))
}

export { RankingList }
