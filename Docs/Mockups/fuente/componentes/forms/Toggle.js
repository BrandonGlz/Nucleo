import React from 'react'
import { cx, useControlled } from '../core/nc-lib.js'
const h = React.createElement;
function Toggle(p) {
  var st = useControlled(p.checked, !!p.defaultChecked, p.onChange);
  var sw = h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': st[0],
    'aria-label': p.label ? undefined : p.ariaLabel,
    disabled: p.disabled,
    className: cx('nc-toggle', st[0] && 'is-on', p.size === 'lg' && 'nc-toggle--lg', p.state && 'is-' + p.state),
    onClick: function () {
      st[1](!st[0]);
    }
  }, h('span', {
    className: 'nc-toggle__thumb'
  }));
  if (!p.label) return sw;
  return h('label', {
    className: cx('nc-togglefield', p.disabled && 'is-disabled')
  }, sw, h('span', null, p.label));
}

export { Toggle }
