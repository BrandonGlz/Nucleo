import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
import { esSeleccion, propsSeleccion } from './comun.js'
const h = React.createElement;
const {
  useState
} = React;
function BarChartVertical(p) {
  var data = (p.data || []).map(function (d) {
    return { ...d, label: d.label ?? d.etiqueta ?? '', value: Number(d.value ?? d.valor ?? 0) };
  });
  var H = p.height || 200;
  var wr = useWidth(480);
  var W = wr[1];
  // `interactivo={false}` (reportes): la barra resaltada es solo la de `activeIndex`, sin hover
  var interactivo = p.interactivo !== false;
  var inicial = p.activeIndex != null ? p.activeIndex : data.length - 1;
  var act = useState(null);
  var activa = interactivo && act[0] != null ? act[0] : inicial;
  var meta = p.meta && typeof p.meta === 'object' ? p.meta.valor : p.meta;
  // Sin datos o todo en cero, el máximo sería 0 y las alturas NaN: se usa 1.
  var mx = p.max || Math.max.apply(null, data.map(function (d) {
    return d.value;
  }).concat([meta || 0])) * 1.15 || 1;
  var padT = 28,
    padB = 26;
  var ih = H - padT - padB;
  var n = data.length || 1;
  var slot = W / n;
  var bw = Math.min(40, slot * 0.56);
  var th = p.threshold;
  if (!data.length && p.vacio) {
    return h('div', {
      ref: wr[0],
      className: cx('nc-bars', 'nc-bars--vacia', p.className),
      style: { height: H }
    }, p.vacio);
  }
  return h('div', {
    ref: wr[0],
    className: cx('nc-bars', p.className),
    style: {
      height: H
    }
  }, h('svg', {
    width: W,
    height: H,
    viewBox: '0 0 ' + W + ' ' + H,
    style: {
      width: '100%',
      height: H
    },
    role: 'img',
    'aria-label': p.label || 'Gráfica de barras',
    // Al salir el mouse vuelve a la barra inicial en vez de quedarse en la última tocada
    onMouseLeave: interactivo ? function () {
      act[1](null);
    } : undefined
  }, th != null ? h('g', {
    className: 'nc-trend__threshold'
  }, h('line', {
    x1: 0,
    x2: W,
    y1: padT + ih - th / mx * ih,
    y2: padT + ih - th / mx * ih
  })) : null, meta != null ? h('g', {
    className: 'nc-bars__meta'
  }, h('line', {
    x1: 0,
    x2: W,
    y1: padT + ih - meta / mx * ih,
    y2: padT + ih - meta / mx * ih
  }), h('text', {
    x: 2,
    y: padT + ih - meta / mx * ih - 4,
    textAnchor: 'start'
  }, 'Meta ' + fmt(meta, p.decimals == null ? 1 : p.decimals) + (p.unit ? ' ' + p.unit : ''))) : null, data.map(function (d, i) {
    var bh = Math.max(4, d.value / mx * ih);
    var x = i * slot + (slot - bw) / 2;
    var y = padT + ih - bh;
    var on = i === activa || esSeleccion(p.seleccion, d.dimension, d.dimensionValor ?? d.label);
    var sel = propsSeleccion(p, d);
    var props = {
      key: i,
      onMouseEnter: interactivo ? function () {
        act[1](i);
      } : undefined
    };
    Object.keys(sel).forEach(function (k) { props[k] = sel[k] });
    if (!props.style) props.style = { cursor: 'default' };
    if (sel.role) props['aria-label'] = d.label + ': ' + fmt(d.value, p.decimals == null ? 1 : p.decimals) + (p.unit ? ' ' + p.unit : '');
    return h('g', props, h('rect', {
      x: i * slot,
      y: 0,
      width: slot,
      height: H,
      fill: 'transparent'
    }), h('rect', {
      x: x,
      y: y,
      width: bw,
      height: bh,
      rx: Math.min(bw / 2, 12),
      className: on ? 'nc-bars__bar is-active' : 'nc-bars__bar'
    }), on ? h('text', {
      x: x + bw / 2,
      y: y - 8,
      textAnchor: 'middle',
      className: 'nc-bars__value'
    }, fmt(d.value, p.decimals == null ? 1 : p.decimals) + (p.unit ? ' ' + p.unit : '')) : null, h('text', {
      x: x + bw / 2,
      y: H - 6,
      textAnchor: 'middle',
      className: cx('nc-trend__axis', on && 'is-active')
    }, d.label));
  })));
}

// Barras horizontales: cada categoría ocupa un renglón, con su valor a la derecha y la meta como
// línea vertical. Es la forma natural para rankings y nombres largos.
function BarChartHorizontal(p) {
  var data = (p.data || []).map(function (d) {
    return { ...d, label: d.label ?? d.etiqueta ?? '', value: Number(d.value ?? d.valor ?? 0) };
  });
  var H = p.height || 220;
  var wr = useWidth(480);
  var W = wr[1];
  var act = useState(null);
  var interactivo = p.interactivo !== false;
  var meta = p.meta && typeof p.meta === 'object' ? p.meta.valor : p.meta;
  var mx = p.max || Math.max.apply(null, data.map(function (d) { return d.value }).concat([meta || 0])) * 1.12 || 1;
  var padL = p.etiquetaAncho || Math.min(148, Math.max(76, W * 0.28));
  var padR = 58;
  var padT = 10;
  var padB = 10;
  var iw = Math.max(24, W - padL - padR);
  var ih = Math.max(20, H - padT - padB);
  var n = data.length || 1;
  var fila = ih / n;
  var bh = Math.min(24, fila * 0.56);
  var X = function (v) { return padL + v / mx * iw };
  if (!data.length && p.vacio) {
    return h('div', {
      ref: wr[0],
      className: cx('nc-bars', 'nc-bars--vacia', p.className),
      style: { height: H }
    }, p.vacio);
  }
  return h('div', {
    ref: wr[0],
    className: cx('nc-bars', 'nc-bars--horizontal', p.className),
    style: { height: H }
  }, h('svg', {
    width: W,
    height: H,
    viewBox: '0 0 ' + W + ' ' + H,
    style: { width: '100%', height: H },
    role: 'img',
    'aria-label': p.label || 'Gráfica de barras',
    onMouseLeave: interactivo ? function () { act[1](null) } : undefined
  }, meta != null ? h('g', { className: 'nc-bars__meta' },
    h('line', { x1: X(meta), x2: X(meta), y1: padT, y2: padT + ih }),
    h('text', { x: X(meta), y: padT - 1, textAnchor: 'middle' }, 'Meta')) : null,
  data.map(function (d, i) {
    var y = padT + i * fila + (fila - bh) / 2
    var on = i === act[0] || esSeleccion(p.seleccion, d.dimension, d.dimensionValor ?? d.label)
    var sel = propsSeleccion(p, d)
    var props = {
      key: i,
      onMouseEnter: interactivo ? function () { act[1](i) } : undefined
    }
    Object.keys(sel).forEach(function (k) { props[k] = sel[k] })
    if (!props.style) props.style = { cursor: 'default' }
    if (sel.role) props['aria-label'] = d.label + ': ' + fmt(d.value, p.decimals == null ? 1 : p.decimals) + (p.unit ? ' ' + p.unit : '')
    var etiqueta = String(d.label)
    if (etiqueta.length > 24) etiqueta = etiqueta.slice(0, 22) + '…'
    var valor = fmt(d.value, p.decimals == null ? 1 : p.decimals) + (p.unit ? ' ' + p.unit : '')
    return h('g', props,
      h('rect', { x: 0, y: padT + i * fila, width: W, height: fila, fill: 'transparent' }),
      h('text', {
        x: padL - 8,
        y: y + bh / 2 + 4,
        textAnchor: 'end',
        className: 'nc-trend__axis'
      }, etiqueta),
      h('rect', {
        x: padL,
        y: y,
        width: Math.max(2, X(d.value) - padL),
        height: bh,
        rx: Math.min(bh / 2, 12),
        className: on ? 'nc-bars__bar is-active' : 'nc-bars__bar'
      }),
      h('text', {
        x: padL + iw + 6,
        y: y + bh / 2 + 4,
        className: 'nc-bars__value'
      }, valor))
  })));
}

function BarChart(p) {
  return p.orientacion === 'horizontal' ? h(BarChartHorizontal, p) : h(BarChartVertical, p)
}

export { BarChart }
