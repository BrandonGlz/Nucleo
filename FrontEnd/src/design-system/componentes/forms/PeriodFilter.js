import React from 'react'
import { cx, useControlled } from '../core/nc-lib.js'
import { Chip } from './Chip.js'
const h = React.createElement;

// Selector de periodo con la pastilla de la opción elegida que se desliza hasta la nueva (igual que
// Tabs). El indicador se mide con la posición real del botón, así sigue al cambiar el tamaño.
function PeriodFilter(p) {
  var opts = p.options || ['Hoy', '7 días', '30 días'];
  var st = useControlled(p.value, p.defaultValue || opts[0], p.onChange);
  var actual = st[0];
  var total = opts.length;
  var caja = React.useRef(null);
  const [m, setMedida] = React.useState(null);
  // La primera vez se coloca sin animar; después cada cambio se desliza.
  const [deslizar, setDeslizar] = React.useState(false);

  React.useLayoutEffect(function () {
    var el = caja.current;
    if (!el) return undefined;
    function medir() {
      var b = el.querySelector('.nc-chip.is-selected');
      setMedida(b ? { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight } : null);
    }
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    var ro = new ResizeObserver(medir);
    ro.observe(el);
    el.querySelectorAll('.nc-chip').forEach(function (b) { ro.observe(b); });
    return function () { ro.disconnect(); };
  }, [actual, total]);

  React.useEffect(function () {
    if (!m || deslizar) return undefined;
    var id = requestAnimationFrame(function () { setDeslizar(true); });
    return function () { cancelAnimationFrame(id); };
  }, [m, deslizar]);

  return h('div', {
    ref: caja,
    className: cx('nc-period', m && 'con-indicador', p.className),
    role: 'group',
    'aria-label': p.label || 'Periodo'
  }, m ? h('span', {
    className: cx('nc-period__indicador', deslizar && 'is-deslizando'),
    'aria-hidden': true,
    style: { width: m.w, height: m.h, transform: 'translate(' + m.x + 'px, ' + m.y + 'px)' }
  }) : null, opts.map(function (o) {
    return h(Chip, {
      key: o,
      selected: actual === o,
      onClick: function () {
        st[1](o);
      }
    }, o);
  }));
}

export { PeriodFilter }
