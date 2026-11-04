import React from 'react'
import { cx, fmt, smoothPath, useId, useWidth } from '../core/nc-lib.js'
import { StatusBadge } from '../display/StatusBadge.js'
const h = React.createElement;
const {
  useState
} = React;
function TrendChart(p) {
  var data = p.data || [];
  var H = p.height || 260;
  var unit = p.unit || '';
  var wr = useWidth(640);
  var ref = wr[0],
    W = wr[1];
  var id = useId().replace(/:/g, '');
  var hover = useState(p.activeIndex != null ? p.activeIndex : data.length - 1);
  var padL = 44,
    padR = 16,
    padT = 16,
    padB = 28;
  var vals = data.map(function (d) {
    return d.value;
  });
  var th = p.threshold || {};
  var all = vals.concat([th.max, th.min].filter(function (v) {
    return v != null;
  }));
  var mn = p.min != null ? p.min : Math.floor(Math.min.apply(null, all) - 1),
    mx = p.max != null ? p.max : Math.ceil(Math.max.apply(null, all) + 1);
  if (p.max == null) mx = mn + Math.ceil((mx - mn) / 4) * 4;
  var iw = Math.max(10, W - padL - padR),
    ih = H - padT - padB;
  var X = function (i) {
    return padL + (data.length > 1 ? i / (data.length - 1) * iw : iw / 2);
  };
  var Y = function (v) {
    return padT + ih - (v - mn) / (mx - mn || 1) * ih;
  };
  var pts = data.map(function (d, i) {
    return [+X(i).toFixed(1), +Y(d.value).toFixed(1)];
  });
  var line = smoothPath(pts);
  var ticks = [];
  var steps = 4;
  for (var t = 0; t <= steps; t++) ticks.push(mn + (mx - mn) * t / steps);
  var hi = Math.max(0, Math.min(data.length - 1, hover[0]));
  var cur = data[hi];
  var labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 64))));
  function onMove(e) {
    var r = e.currentTarget.getBoundingClientRect();
    var x = e.clientX - r.left;
    var i = Math.round((x - padL) / iw * (data.length - 1));
    hover[1](Math.max(0, Math.min(data.length - 1, i)));
  }
  var status = function (v) {
    if (th.max != null && v > th.max) return 'critical';
    if (th.min != null && v < th.min) return 'critical';
    if (th.warnMax != null && v > th.warnMax) return 'warning';
    return 'normal';
  };
  var tipX = cur ? X(hi) : 0;
  var tipLeft = tipX > W - 150;
  return h('div', {
    ref: ref,
    className: cx('nc-trend', p.className),
    style: {
      height: H
    }
  }, h('svg', {
    width: W,
    height: H,
    onMouseMove: onMove,
    role: 'img',
    'aria-label': (p.label || 'Tendencia') + (th.max != null ? ', umbral máximo ' + th.max + ' ' + unit : '')
  }, h('defs', null, h('linearGradient', {
    id: 'ta' + id,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1
  }, h('stop', {
    offset: '0%',
    style: {
      stopColor: 'var(--chart-area)',
      stopOpacity: 0.32
    }
  }), h('stop', {
    offset: '100%',
    style: {
      stopColor: 'var(--chart-area)',
      stopOpacity: 0
    }
  }))), ticks.map(function (tv, i) {
    return h('g', {
      key: 'g' + i
    }, h('line', {
      x1: padL,
      x2: W - padR,
      y1: Y(tv),
      y2: Y(tv),
      className: 'nc-trend__grid'
    }), h('text', {
      x: padL - 10,
      y: Y(tv) + 4,
      textAnchor: 'end',
      className: 'nc-trend__axis'
    }, fmt(tv, 0)));
  }), data.map(function (d, i) {
    return i % labelEvery === 0 ? h('text', {
      key: 'x' + i,
      x: X(i),
      y: H - 6,
      textAnchor: 'middle',
      className: 'nc-trend__axis'
    }, d.label) : null;
  }), th.max != null ? h('g', {
    className: 'nc-trend__threshold'
  }, h('line', {
    x1: padL,
    x2: W - padR,
    y1: Y(th.max),
    y2: Y(th.max)
  }), h('rect', {
    x: W - padR - 92,
    y: Y(th.max) - 22,
    width: 92,
    height: 18,
    rx: 9
  }), h('text', {
    x: W - padR - 46,
    y: Y(th.max) - 9,
    textAnchor: 'middle'
  }, 'Máx ' + fmt(th.max) + ' ' + unit)) : null, th.min != null ? h('g', {
    className: 'nc-trend__threshold nc-trend__threshold--min'
  }, h('line', {
    x1: padL,
    x2: W - padR,
    y1: Y(th.min),
    y2: Y(th.min)
  }), h('rect', {
    x: W - padR - 92,
    y: Y(th.min) + 4,
    width: 92,
    height: 18,
    rx: 9
  }), h('text', {
    x: W - padR - 46,
    y: Y(th.min) + 17,
    textAnchor: 'middle'
  }, 'Mín ' + fmt(th.min) + ' ' + unit)) : null, h('path', {
    d: line + ' L' + pts[pts.length - 1][0] + ' ' + (padT + ih) + ' L' + pts[0][0] + ' ' + (padT + ih) + ' Z',
    fill: 'url(#ta' + id + ')'
  }), h('path', {
    d: line,
    className: 'nc-trend__line'
  }), cur ? h('g', null, h('line', {
    x1: tipX,
    x2: tipX,
    y1: padT,
    y2: padT + ih,
    className: 'nc-trend__cursor'
  }), h('circle', {
    cx: tipX,
    cy: Y(cur.value),
    r: 7,
    className: 'nc-trend__halo'
  }), h('circle', {
    cx: tipX,
    cy: Y(cur.value),
    r: 4.5,
    className: 'nc-trend__dot'
  })) : null), cur && p.tooltip !== false ? h('div', {
    className: 'nc-tooltip',
    style: {
      left: tipLeft ? tipX - 12 : tipX + 12,
      top: Math.max(4, Y(cur.value) - 34),
      transform: tipLeft ? 'translateX(-100%)' : 'none'
    }
  }, h('span', {
    className: 'nc-tooltip__time'
  }, cur.time || cur.label), h('span', {
    className: 'nc-tooltip__value'
  }, fmt(cur.value, p.decimals == null ? 1 : p.decimals), h('small', null, ' ' + unit)), h(StatusBadge, {
    status: status(cur.value)
  })) : null);
}

export { TrendChart }
