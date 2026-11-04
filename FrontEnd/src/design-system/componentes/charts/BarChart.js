import React from 'react'
import { cx, fmt, useWidth } from '../core/nc-lib.js'
const h = React.createElement;
const {
  useState
} = React;
function BarChart(p) {
  var data = p.data || [];
  var H = p.height || 200;
  var wr = useWidth(480);
  var W = wr[1];
  var act = useState(p.activeIndex != null ? p.activeIndex : data.length - 1);
  var mx = p.max || Math.max.apply(null, data.map(function (d) {
    return d.value;
  })) * 1.15;
  var padT = 28,
    padB = 26;
  var ih = H - padT - padB;
  var n = data.length || 1;
  var slot = W / n;
  var bw = Math.min(40, slot * 0.56);
  var th = p.threshold;
  return h('div', {
    ref: wr[0],
    className: cx('nc-bars', p.className),
    style: {
      height: H
    }
  }, h('svg', {
    width: W,
    height: H,
    role: 'img',
    'aria-label': p.label || 'Gráfica de barras'
  }, th != null ? h('g', {
    className: 'nc-trend__threshold'
  }, h('line', {
    x1: 0,
    x2: W,
    y1: padT + ih - th / mx * ih,
    y2: padT + ih - th / mx * ih
  })) : null, data.map(function (d, i) {
    var bh = Math.max(4, d.value / mx * ih);
    var x = i * slot + (slot - bw) / 2;
    var y = padT + ih - bh;
    var on = i === act[0];
    return h('g', {
      key: i,
      onMouseEnter: function () {
        act[1](i);
      },
      style: {
        cursor: 'default'
      }
    }, h('rect', {
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

export { BarChart }
