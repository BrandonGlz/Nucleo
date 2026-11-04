import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, useControlled } from '../core/nc-lib.js'
const h = React.createElement;
function Tabs(p) {
  var items = p.items || [];
  var st = useControlled(p.value, p.defaultValue || items[0] && items[0].id, p.onChange);
  return h('div', {
    className: cx('nc-tabs', p.variant === 'underline' && 'nc-tabs--underline', p.className),
    role: 'tablist'
  }, items.map(function (it) {
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
