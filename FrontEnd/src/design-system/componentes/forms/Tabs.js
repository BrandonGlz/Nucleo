import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, useControlled } from '../core/nc-lib.js'
import { useIndicadorDeslizante } from '../core/useIndicadorDeslizante.js'
const h = React.createElement;

// Pestañas con un indicador que se desliza hasta la elegida (la pastilla oscura, o la raya en la variante
// «underline»), medido con useIndicadorDeslizante: sigue al cambiar contadores o tamaño.
function Tabs(p) {
  var items = p.items || [];
  var st = useControlled(p.value, p.defaultValue || items[0] && items[0].id, p.onChange);
  var actual = st[0];
  var total = items.length;
  var ind = useIndicadorDeslizante('.nc-tab.is-active', '.nc-tab', [actual, total]);
  var m = ind.medida;

  return h('div', {
    ref: ind.caja,
    className: cx('nc-tabs', p.variant === 'underline' && 'nc-tabs--underline', m && 'con-indicador', p.className),
    role: 'tablist'
  }, m ? h('span', {
    className: cx('nc-tabs__indicador', ind.deslizar && 'is-deslizando'),
    'aria-hidden': true,
    // En celular las pestañas pueden ocupar dos renglones: el indicador sigue también la posición vertical.
    style: p.variant === 'underline' ? { width: m.w, transform: 'translateX(' + m.x + 'px)' } : { width: m.w, height: m.h, top: 0, bottom: 'auto', transform: 'translate(' + m.x + 'px, ' + m.y + 'px)' }
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
