import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, useControlled } from '../core/nc-lib.js'
const h = React.createElement;

// Pestañas con un indicador que se desliza hasta la elegida (la pastilla oscura, o la raya en la variante
// «underline»). El indicador se mide con la posición real del botón, así sigue al cambiar contadores o tamaño.
function Tabs(p) {
  var items = p.items || [];
  var st = useControlled(p.value, p.defaultValue || items[0] && items[0].id, p.onChange);
  var actual = st[0];
  var total = items.length;
  var caja = React.useRef(null);
  const [m, setMedida] = React.useState(null);
  // La primera vez se coloca sin animar; después cada cambio se desliza.
  const [deslizar, setDeslizar] = React.useState(false);

  React.useLayoutEffect(function () {
    var el = caja.current;
    if (!el) return undefined;
    function medir() {
      var b = el.querySelector('.nc-tab.is-active');
      setMedida(b ? { x: b.offsetLeft, w: b.offsetWidth } : null);
    }
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    var ro = new ResizeObserver(medir);
    ro.observe(el);
    el.querySelectorAll('.nc-tab').forEach(function (b) { ro.observe(b); });
    return function () { ro.disconnect(); };
  }, [actual, total]);

  React.useEffect(function () {
    if (!m || deslizar) return undefined;
    var id = requestAnimationFrame(function () { setDeslizar(true); });
    return function () { cancelAnimationFrame(id); };
  }, [m, deslizar]);

  return h('div', {
    ref: caja,
    className: cx('nc-tabs', p.variant === 'underline' && 'nc-tabs--underline', m && 'con-indicador', p.className),
    role: 'tablist'
  }, m ? h('span', {
    className: cx('nc-tabs__indicador', deslizar && 'is-deslizando'),
    'aria-hidden': true,
    style: { width: m.w, transform: 'translateX(' + m.x + 'px)' }
  }) : null, items.map(function (it) {
    return h('button', {
      key: it.id,
      role: 'tab',
      type: 'button',
      disabled: it.disabled,
      'aria-selected': st[0] === it.id,
      className: cx('nc-tab', st[0] === it.id && 'is-active'),
      onClick: function () {
        st[1](it.id);
      }
    }, it.icon ? h(Icon, {
      name: it.icon,
      size: 16
    }) : null, it.label, it.count != null ? h('span', {
      className: 'nc-tab__count'
    }, it.count) : null);
  }));
}

export { Tabs }
