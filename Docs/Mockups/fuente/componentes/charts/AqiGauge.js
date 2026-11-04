import React from 'react'
import { STATUS, aqiInfo, cx } from '../core/nc-lib.js'
import { StatusBadge } from '../display/StatusBadge.js'
const h = React.createElement;
function AqiGauge(p) {
  var size = p.size || 200;
  var v = p.value;
  var max = p.max || 300;
  var info = aqiInfo(v, p.warnAt, p.criticalAt);
  var r = size / 2 - 14,
    c = size / 2,
    sw = p.strokeWidth || 14;
  var start = 135,
    sweep = 270;
  function pt(a) {
    var rad = a * Math.PI / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
  }
  function arc(a0, a1) {
    var p0 = pt(a0),
      p1 = pt(a1);
    var large = a1 - a0 > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  var frac = v == null ? 0 : Math.max(0, Math.min(1, v / max));
  var tone = STATUS[info.status].tone;
  var marks = [p.warnAt || 100, p.criticalAt || 150].map(function (m) {
    return start + m / max * sweep;
  });
  return h('div', {
    className: cx('nc-gauge', p.className),
    style: {
      width: size
    }
  }, h('svg', {
    width: size,
    height: size * 0.86,
    viewBox: '0 0 ' + size + ' ' + size * 0.86,
    role: 'img',
    'aria-label': 'Calidad del aire ' + (v == null ? 'sin datos' : v + ' AQI, ' + info.label)
  }, h('path', {
    d: arc(start, start + sweep),
    className: 'nc-gauge__track',
    strokeWidth: sw
  }), frac > 0 ? h('path', {
    d: arc(start, start + Math.max(1, frac * sweep)),
    className: 'nc-gauge__value',
    style: {
      stroke: 'var(--' + tone + ')'
    },
    strokeWidth: sw
  }) : null, marks.map(function (a, i) {
    var q0 = pt(a);
    var rad = a * Math.PI / 180;
    return h('line', {
      key: i,
      x1: q0[0] - Math.cos(rad) * (sw / 2 + 3),
      y1: q0[1] - Math.sin(rad) * (sw / 2 + 3),
      x2: q0[0] + Math.cos(rad) * (sw / 2 + 3),
      y2: q0[1] + Math.sin(rad) * (sw / 2 + 3),
      className: 'nc-gauge__mark'
    });
  })), h('div', {
    className: 'nc-gauge__center'
  }, h('span', {
    className: 'nc-gauge__value-text'
  }, v == null ? '—' : v), h('span', {
    className: 'nc-gauge__unit'
  }, 'AQI'), h(StatusBadge, {
    status: info.status,
    label: info.label
  })));
}

export { AqiGauge }
