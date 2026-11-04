import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, omit } from '../core/nc-lib.js'
import { Field } from './field.js'
const h = React.createElement;
function Select(p) {
  var rest = omit(p, ['label', 'hint', 'error', 'options', 'className', 'state', 'icon']);
  return h(Field, {
    label: p.label,
    hint: p.hint,
    error: p.error,
    disabled: p.disabled,
    className: p.className
  }, h('span', {
    className: cx('nc-input', 'nc-select', p.state && 'is-' + p.state, p.disabled && 'is-disabled')
  }, p.icon ? h(Icon, {
    name: p.icon,
    size: 18
  }) : null, h('select', rest, (p.options || []).map(function (o) {
    var v = typeof o === 'string' ? o : o.value;
    return h('option', {
      key: v,
      value: v
    }, typeof o === 'string' ? o : o.label);
  })), h(Icon, {
    name: 'chevron-down',
    size: 18,
    className: 'nc-select__chev'
  })));
}

export { Select }
