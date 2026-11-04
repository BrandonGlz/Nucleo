import React from 'react'
import { useId } from '../core/nc-lib.js'
const h = React.createElement;
function Sparkline(p) {
  var data = p.data || [];
  var w = p.width || 96,
    hh = p.height || 32;
  var id = useId().replace(/:/g, '');
  if (data.length < 2) return h('svg', {
    width: w,
    height: hh
  });
  var mn = Math.min.apply(null, data),
    mx = Math.max.apply(null, data);
  var rng = mx - mn || 1;
  var pts = data.map(function (v, i) {
    return [i / (data.length - 1) * (w - 4) + 2, hh - 3 - (v - mn) / rng * (hh - 6)];
  });
  var d = pts.map(function (q, i) {
    return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1);
  }).join(' ');
  var color = p.tone && p.tone !== 'default' ? 'var(--' + p.tone + ')' : 'var(--chart-line)';
  var last = pts[pts.length - 1];
  return h('svg', {
    className: 'nc-spark',
    width: w,
    height: hh,
    viewBox: '0 0 ' + w + ' ' + hh,
    'aria-hidden': true
  }, h('defs', null, h('linearGradient', {
    id: 'sg' + id,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1
  }, h('stop', {
    offset: '0%',
    style: {
      stopColor: color,
      stopOpacity: 0.25
    }
  }), h('stop', {
    offset: '100%',
    style: {
      stopColor: color,
      stopOpacity: 0
    }
  }))), h('path', {
    d: d + ' L' + last[0] + ' ' + hh + ' L2 ' + hh + ' Z',
    fill: 'url(#sg' + id + ')'
  }), h('path', {
    d: d,
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  }), h('circle', {
    cx: last[0],
    cy: last[1],
    r: 3,
    fill: color
  }));
}

export { Sparkline }
