import React from 'react'
import { cx, fmt, smoothPath, useId, useWidth } from '../core/nc-lib.js'
import { ChartTooltip, atenuado, colorSerie, escalaBonita, esSeleccion, evitarEtiquetas, resumenSeries } from './comun.js'
import { StatusBadge } from '../display/StatusBadge.js'
const h = React.createElement;
const {
  useLayoutEffect,
  useState
} = React;

function TrendChartSimple(p) {
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
  var comparativa = (p.comparativa || [])
    .map(function (x) { return typeof x === 'number' ? x : x.value })
    .filter(function (x) { return x != null });
  var bandas = p.bandas || [];
  var all = vals.concat([th.max, th.min].filter(function (v) {
    return v != null;
  }));
  bandas.forEach(function (b) {
    if (b.min != null) all.push(b.min);
    if (b.max != null) all.push(b.max);
  });
  all = all.concat(comparativa);
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
  var comparativaPts = comparativa.map(function (v, i) {
    var pos = comparativa.length > 1 ? i / (comparativa.length - 1) * (data.length - 1) : 0;
    return [+X(pos).toFixed(1), +Y(v).toFixed(1)];
  });
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
  }))), bandas.map(function (b, i) {
    var alto = Y(b.max == null ? mx : b.max);
    var bajo = Y(b.min == null ? mn : b.min);
    return h('rect', {
      key: 'banda' + i,
      x: padL,
      y: Math.min(alto, bajo),
      width: iw,
      height: Math.abs(bajo - alto),
      fill: 'var(--' + (b.tono || 'warning') + '-soft)',
      opacity: b.opacidad == null ? 0.55 : b.opacidad
    });
  }), ticks.map(function (tv, i) {
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
  }, 'Mín ' + fmt(th.min) + ' ' + unit)) : null, comparativaPts.length ? h('path', {
    d: smoothPath(comparativaPts),
    className: 'nc-trend__line nc-trend__line--comparativa'
  }) : null, h('path', {
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

function TrendChart(p) {
  return p.series && p.series.length ? h(TrendChartSeries, p) : h(TrendChartSimple, p)
}

// Varias series en la misma gráfica: una línea por serie, comparativa punteada opcional, bandas de
// umbral y leyenda clicable cuando hay filtro cruzado. La versión de una sola serie sigue siendo
// TrendChartSimple para que Panel, Histórico y Reportes no cambien.
function TrendChartSeries(p) {
  var series = p.series || []
  var H = p.height || 260
  var unit = p.unit || ''
  var dec = p.decimals == null ? 1 : p.decimals
  var wr = useWidth(640)
  var ref = wr[0], W = wr[1]
  var id = useId().replace(/:/g, '')
  var interactivo = p.interactivo !== false
  var hover = useState(null)
  var th = p.threshold || {}
  var bandas = p.bandas || []
  var datos = series.map(function (s) { return s.puntos || s.data || [] })
  var base = datos.reduce(function (a, b) { return b.length > a.length ? b : a }, [])
  var hayDatos = datos.some(function (lista) {
    return lista.some(function (d) { return d.value != null })
  })
  if (!hayDatos) {
    return h('div', {
      ref: ref,
      className: cx('nc-trend', 'nc-trend--vacia', p.className),
      style: { height: H }
    }, p.vacio || 'Sin datos en el periodo')
  }
  var all = []
  datos.forEach(function (lista) {
    lista.forEach(function (d) { if (d.value != null) all.push(d.value) })
  })
  series.forEach(function (s) {
    ;(s.comparativa || []).forEach(function (x) {
      var v = typeof x === 'number' ? x : x.value
      if (v != null) all.push(v)
    })
  })
  ;[th.max, th.min].forEach(function (v) { if (v != null) all.push(v) })
  bandas.forEach(function (b) {
    if (b.min != null) all.push(b.min)
    if (b.max != null) all.push(b.max)
  })
  var padL = 44, padR = 16
  var leyenda = series.length > 1 && p.leyenda !== false
  var padT = leyenda ? 34 : 16
  var padB = 28
  var iw = Math.max(10, W - padL - padR)
  var ih = H - padT - padB
  var steps = ih < 60 ? 1 : ih < 110 ? 2 : 4
  var escala = escalaBonita(Math.min.apply(null, all), Math.max.apply(null, all), steps, p.min, p.max)
  var mn = escala.mn, mx = escala.mx, ticks = escala.ticks
  var X = function (i) {
    return padL + (base.length > 1 ? i / (base.length - 1) * iw : iw / 2)
  }
  var Y = function (v) {
    return padT + ih - (v - mn) / (mx - mn || 1) * ih
  }
  var labelEvery = Math.max(1, Math.ceil(base.length / Math.max(2, Math.floor(iw / 64))))
  var hi = hover[0]
  var cur = hi == null ? null : base[hi]
  var fijo = p.tooltipFijo === true
  if (fijo && hi == null) cur = base[base.length - 1]
  var indice = fijo && hover[0] == null ? base.length - 1 : hi
  var tipX = indice == null ? 0 : X(indice)
  var verTip = interactivo && p.tooltip !== false && cur != null && (fijo || hover[0] != null)
  function onMove(e) {
    var r = e.currentTarget.getBoundingClientRect()
    var x = e.clientX - r.left
    var i = Math.round((x - padL) / iw * (base.length - 1))
    hover[1](Math.max(0, Math.min(base.length - 1, i)))
  }
  var yMax = th.max != null ? (Y(th.max) - 22 < 0 ? Y(th.max) + 4 : Y(th.max) - 22) : 0
  var yMin = th.min != null ? (Y(th.min) + 22 > padT + ih ? Y(th.min) - 22 : Y(th.min) + 4) : 0
  var etiquetas = ih >= 60
  var resumen = resumenSeries(series, unit, dec)
  var leyendaAncho = Math.max(70, iw / Math.max(1, series.length))
  return h('div', {
    ref: ref,
    className: cx('nc-trend', 'nc-trend--series', p.className),
    style: { height: H }
  }, h('svg', {
    width: W,
    height: H,
    viewBox: '0 0 ' + W + ' ' + H,
    style: { width: '100%', height: H },
    onMouseMove: interactivo ? onMove : undefined,
    onMouseLeave: interactivo ? function () { hover[1](null) } : undefined,
    role: 'img',
    'aria-label': (p.label || 'Tendencia') + (resumen ? '. ' + resumen : '')
  }, h('defs', null, series.map(function (s, i) {
    return h('linearGradient', {
      key: 'g' + i,
      id: 'ts' + id + i,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1
    }, h('stop', {
      offset: '0%',
      style: { stopColor: s.color || colorSerie(i), stopOpacity: 0.2 }
    }), h('stop', {
      offset: '100%',
      style: { stopColor: s.color || colorSerie(i), stopOpacity: 0 }
    }))
  })), leyenda && series.map(function (s, i) {
    var color = s.color || colorSerie(i)
    var elegido = esSeleccion(p.seleccion, s.dimension, s.dimensionValor)
    var opacidad = p.seleccion ? atenuado(p.seleccion, s.dimension, s.dimensionValor) : 1
    var x0 = padL + i * leyendaAncho
    var clic = p.alSeleccionar && s.dimension && s.dimensionValor != null
    var props = clic ? {
      role: 'button',
      tabIndex: 0,
      className: 'nc-seleccionable',
      'aria-pressed': elegido,
      style: { cursor: 'pointer', opacity: opacidad },
      onClick: function (evento) {
        evento.stopPropagation()
        p.alSeleccionar({ dimension: s.dimension, valor: s.dimensionValor })
      },
      onKeyDown: function (evento) {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault()
          p.alSeleccionar({ dimension: s.dimension, valor: s.dimensionValor })
        }
      }
    } : { style: { opacity: opacidad } }
    return h('g', { key: 'leyenda' + i, ...props },
      h('circle', { cx: x0 + 4, cy: 14, r: 4, fill: color }),
      h('text', {
        x: x0 + 12,
        y: 18,
        className: 'nc-trend__leyenda-texto'
      }, s.nombre || 'Serie ' + (i + 1)))
  }), bandas.map(function (b, i) {
    var alto = Y(b.max == null ? mx : b.max)
    var bajo = Y(b.min == null ? mn : b.min)
    return h('rect', {
      key: 'banda' + i,
      x: padL,
      y: Math.min(alto, bajo),
      width: iw,
      height: Math.abs(bajo - alto),
      fill: 'var(--' + (b.tono || 'warning') + '-soft)',
      opacity: b.opacidad == null ? 0.55 : b.opacidad
    })
  }), ticks.map(function (tv, i) {
    return h('g', { key: 'g' + i },
      h('line', {
        x1: padL,
        x2: W - padR,
        y1: Y(tv),
        y2: Y(tv),
        className: 'nc-trend__grid'
      }),
      h('text', {
        x: padL - 10,
        y: Y(tv) + 4,
        textAnchor: 'end',
        className: 'nc-trend__axis'
      }, fmt(tv, 0)))
  }), base.map(function (d, i) {
    var repetida = i % labelEvery === 0 && i > 0 && d.label === base[Math.max(0, i - labelEvery)].label
    return i % labelEvery === 0 && !repetida ? h('text', {
      key: 'x' + i,
      x: X(i),
      y: H - 6,
      textAnchor: 'middle',
      className: 'nc-trend__axis'
    }, d.label) : null
  }), th.max != null ? h('g', { className: 'nc-trend__threshold' },
    h('line', { x1: padL, x2: W - padR, y1: Y(th.max), y2: Y(th.max) }),
    etiquetas && h('rect', { x: W - padR - 92, y: yMax, width: 92, height: 18, rx: 9 }),
    etiquetas && h('text', { x: W - padR - 46, y: yMax + 13, textAnchor: 'middle' }, 'Máx ' + fmt(th.max) + ' ' + unit)) : null,
    th.min != null ? h('g', { className: 'nc-trend__threshold nc-trend__threshold--min' },
      h('line', { x1: padL, x2: W - padR, y1: Y(th.min), y2: Y(th.min) }),
      etiquetas && h('rect', { x: W - padR - 92, y: yMin, width: 92, height: 18, rx: 9 }),
      etiquetas && h('text', { x: W - padR - 46, y: yMin + 13, textAnchor: 'middle' }, 'Mín ' + fmt(th.min) + ' ' + unit)) : null,
    series.map(function (s, i) {
      var lista = datos[i]
      var color = s.color || colorSerie(i)
      var puntos = lista.map(function (d, j) {
        var pos = base.length > 1 ? (lista.length === base.length ? j : j / Math.max(1, lista.length - 1) * (base.length - 1)) : 0
        return [+X(pos).toFixed(1), +Y(d.value).toFixed(1)]
      })
      var linea = smoothPath(puntos)
      var previa = (s.comparativa || []).map(function (x, j) {
        var v = typeof x === 'number' ? x : x.value
        var pos = (s.comparativa || []).length > 1 ? j / ((s.comparativa || []).length - 1) * (base.length - 1) : 0
        return [+X(pos).toFixed(1), +Y(v).toFixed(1)]
      })
      var opacidad = p.seleccion ? atenuado(p.seleccion, s.dimension, s.dimensionValor) : 1
      return h('g', { key: 'serie' + i, style: { opacity: opacidad } },
        p.estilo === 'area' && lista.length > 1 ? h('path', {
          d: linea + ' L' + puntos[puntos.length - 1][0] + ' ' + (padT + ih) + ' L' + puntos[0][0] + ' ' + (padT + ih) + ' Z',
          fill: 'url(#ts' + id + i + ')'
        }) : null,
        previa.length ? h('path', {
          d: smoothPath(previa),
          className: 'nc-trend__line nc-trend__line--comparativa',
          style: { stroke: color, opacity: 0.55, filter: 'none' }
        }) : null,
        h('path', {
          d: linea,
          className: 'nc-trend__line',
          style: { stroke: color, filter: 'none' }
        }))
    }), indice != null ? h('g', null,
      h('line', { x1: tipX, x2: tipX, y1: padT, y2: padT + ih, className: 'nc-trend__cursor' }),
      series.map(function (s, i) {
        var v = (datos[i][indice] || {}).value
        return v == null ? null : h('circle', {
          key: 'punto' + i,
          cx: tipX,
          cy: Y(v),
          r: 4.5,
          className: 'nc-trend__dot',
          style: { stroke: s.color || colorSerie(i) }
        })
      })) : null), verTip ? h(ChartTooltip, {
      x: tipX,
      y: Math.min.apply(null, series.map(function (s, i) {
        var v = (datos[i][indice] || {}).value
        return v == null ? H : Y(v)
      })),
      ancho: W,
      alto: H
    }, h('span', { className: 'nc-tooltip__time' }, cur.time || cur.label),
      series.map(function (s, i) {
        var v = (datos[i][indice] || {}).value
        return h('span', { key: 'valor' + i, className: 'nc-tooltip__serie' },
          h('i', { style: { background: s.color || colorSerie(i) } }),
          h('span', { className: 'nc-tooltip__serie-nombre' }, s.nombre || 'Serie ' + (i + 1)),
          h('strong', { className: 'ui-num' }, v == null ? '—' : fmt(v, dec) + ' ' + unit))
      })) : null)
}

export { TrendChart }
