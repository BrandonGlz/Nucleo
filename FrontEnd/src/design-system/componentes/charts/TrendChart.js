import React from 'react'
import { cx, fmt, smoothPath, useId, useWidth } from '../core/nc-lib.js'
import { StatusBadge } from '../display/StatusBadge.js'
const h = React.createElement;
const {
  useLayoutEffect,
  useState
} = React;

// Escala del eje y con marcas «bonitas» (1, 2, 2.5, 5 × 10^n, nunca menores a 1): el eje acaba en
// valores redondos (0–1500, no 0–1504) con, como mucho, `pasos` renglones. `fijoMin`/`fijoMax`
// respetan los límites que pida quien usa la gráfica.
function escalaBonita(bajo, alto, pasos, fijoMin, fijoMax) {
  if (fijoMin != null && fijoMax != null) {
    var marcas = [];
    for (var t = 0; t <= pasos; t++) marcas.push(fijoMin + (fijoMax - fijoMin) * t / pasos);
    return { mn: fijoMin, mx: fijoMax, ticks: marcas };
  }
  if (fijoMin != null) bajo = fijoMin;
  if (fijoMax != null) alto = fijoMax;
  if (alto - bajo < 1e-9) {
    bajo -= 1;
    alto += 1;
  }
  var base = Math.pow(10, Math.max(0, Math.floor(Math.log10((alto - bajo) / pasos))));
  var paso, mn, mx;
  for (var intento = 0; intento < 40; intento++) {
    var m = [1, 2, 2.5, 5][intento % 4] * base * Math.pow(10, Math.floor(intento / 4));
    if (m === 2.5) continue; // 2.5 daría marcas con decimales (22.5); desde 25 sí es redondo
    mn = fijoMin != null ? fijoMin : Math.floor(bajo / m + 1e-9) * m;
    mx = fijoMax != null ? fijoMax : fijoMin != null ? mn + Math.ceil((alto - mn) / m - 1e-9) * m : Math.ceil(alto / m - 1e-9) * m;
    if (fijoMax != null) mn = mx - Math.ceil((mx - bajo) / m - 1e-9) * m;
    paso = m;
    if (Math.round((mx - mn) / m) <= pasos) break;
  }
  if (mx <= mn) mx = mn + paso;
  var ticks = [];
  for (var v = mn; v <= mx + paso / 2; v += paso) ticks.push(+v.toFixed(6));
  return { mn: mn, mx: mx, ticks: ticks };
}

// Si el tooltip fijo pisa la etiqueta Máx/Mín, se mueve justo encima o debajo de ella (lo más
// cerca posible de su lugar) sin salirse de la gráfica.
function evitarEtiquetas(top, alto, H, franjas) {
  var choca = function (y) {
    return franjas.some(function (f) {
      return y < f[1] && y + alto > f[0];
    });
  };
  if (!choca(top)) return top;
  var opciones = [];
  franjas.forEach(function (f) {
    opciones.push(f[0] - alto - 4, f[1] + 4);
  });
  opciones = opciones.filter(function (y) {
    return y >= 0 && y + alto <= H && !choca(y);
  }).sort(function (a, b) {
    return Math.abs(a - top) - Math.abs(b - top);
  });
  return opciones.length ? opciones[0] : top;
}
function TrendChart(p) {
  var data = p.data || [];
  var H = p.height || 260;
  var unit = p.unit || '';
  var wr = useWidth(640);
  var ref = wr[0],
    W = wr[1];
  var id = useId().replace(/:/g, '');
  // `interactivo={false}` (reportes) dibuja la gráfica fija: sin cursor, punto ni tooltip
  var interactivo = p.interactivo !== false;
  var inicial = p.activeIndex != null ? p.activeIndex : data.length - 1;
  var hover = useState(null);
  // Nodo del tooltip (ref de callback) y su tamaño real, que cambia con el texto y la variante compacta
  var tipEl = useState(null);
  var tamTip = useState(null);
  useLayoutEffect(function () {
    var el = tipEl[0];
    if (!el) return;
    var w = el.offsetWidth,
      alto = el.offsetHeight;
    if (!tamTip[0] || tamTip[0][0] !== w || tamTip[0][1] !== alto) tamTip[1]([w, alto]);
  });
  // `tooltipFijo={false}` (gráficas bajas): el tooltip del punto inicial no se queda fijo, solo
  // aparece al pasar el mouse, para no tapar la línea cuando hay poco alto.
  var fijo = p.tooltipFijo !== false;
  // Sin puntos no hay línea que dibujar: se muestra un aviso en lugar de la gráfica
  if (!data.length) {
    return h('div', {
      ref: ref,
      className: cx('nc-trend', 'nc-trend--vacia', p.className),
      style: { height: H }
    }, p.vacio || 'Sin lecturas en este periodo');
  }
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
  var minimo = Math.min.apply(null, all);
  var iw = Math.max(10, W - padL - padR),
    ih = H - padT - padB;
  // Con poco alto (vista previa de Umbrales en escritorio bajo) cinco renglones del eje se encimarían
  var steps = ih < 60 ? 1 : ih < 110 ? 2 : 4;
  // Una variable que nunca baja de 0 (aire, humedad) no muestra un eje negativo: el piso de la
  // escala es un múltiplo del paso, así que con datos ≥ 0 nunca queda por debajo de 0.
  var escala = escalaBonita(minimo, Math.max.apply(null, all), steps, p.min, p.max);
  var mn = escala.mn,
    mx = escala.mx,
    ticks = escala.ticks;
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
  // Al salir el mouse vuelve al punto inicial en vez de quedarse en el último que se tocó
  var hi = Math.max(0, Math.min(data.length - 1, hover[0] != null ? hover[0] : inicial));
  var cur = interactivo ? data[hi] : null;
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
  // Las etiquetas de umbral van por fuera de su línea (Máx arriba, Mín abajo), salvo que así se
  // salgan del área de la gráfica y choquen con el eje x o el borde: entonces van por dentro.
  var yMax = th.max != null ? (Y(th.max) - 22 < 0 ? Y(th.max) + 4 : Y(th.max) - 22) : 0;
  var yMin = th.min != null ? (Y(th.min) + 22 > padT + ih ? Y(th.min) - 22 : Y(th.min) + 4) : 0;
  // Sin alto para las dos etiquetas sin encimarse se quedan solo las líneas (el rango va en el subtítulo)
  var etiquetas = ih >= 60;
  var tipX = cur ? X(hi) : 0;
  var tipLeft = tipX > W - 150;
  var verTip = cur && p.tooltip !== false && (fijo || hover[0] != null);
  var tipTop = cur ? Math.max(4, Y(cur.value) - 34) : 0;
  if (verTip && tamTip[0] && etiquetas) {
    var tw = tamTip[0][0],
      tAlto = tamTip[0][1];
    var tx0 = tipLeft ? tipX - 12 - tw : tipX + 12;
    var franjas = [];
    // Las etiquetas ocupan [W - padR - 92, W - padR]; solo cuentan si el tooltip cae encima en x
    if (tx0 < W - padR && tx0 + tw > W - padR - 92) {
      if (th.max != null) franjas.push([yMax, yMax + 18]);
      if (th.min != null) franjas.push([yMin, yMin + 18]);
    }
    tipTop = evitarEtiquetas(Math.min(tipTop, H - tAlto), tAlto, H, franjas);
  }
  return h('div', {
    ref: ref,
    className: cx('nc-trend', p.className),
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
    onMouseMove: interactivo ? onMove : undefined,
    onMouseLeave: interactivo ? function () {
      hover[1](null);
    } : undefined,
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
    // Con varios puntos por día la fecha se repetiría: solo se escribe cuando cambia
    var repetida = i % labelEvery === 0 && i > 0 && d.label === data[Math.max(0, i - labelEvery)].label;
    return i % labelEvery === 0 && !repetida ? h('text', {
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
  }), etiquetas && h('rect', {
    x: W - padR - 92,
    y: yMax,
    width: 92,
    height: 18,
    rx: 9
  }), etiquetas && h('text', {
    x: W - padR - 46,
    y: yMax + 13,
    textAnchor: 'middle'
  }, 'Máx ' + fmt(th.max) + ' ' + unit)) : null, th.min != null ? h('g', {
    className: 'nc-trend__threshold nc-trend__threshold--min'
  }, h('line', {
    x1: padL,
    x2: W - padR,
    y1: Y(th.min),
    y2: Y(th.min)
  }), etiquetas && h('rect', {
    x: W - padR - 92,
    y: yMin,
    width: 92,
    height: 18,
    rx: 9
  }), etiquetas && h('text', {
    x: W - padR - 46,
    y: yMin + 13,
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
  })) : null), verTip ? h('div', {
    ref: tipEl[1],
    className: 'nc-tooltip',
    style: {
      left: tipLeft ? tipX - 12 : tipX + 12,
      top: tipTop,
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
