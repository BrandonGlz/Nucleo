import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, omit } from '../core/nc-lib.js'
import { Field } from './field.js'
const h = React.createElement;
function Input(p) {
  var rest = omit(p, ['label', 'hint', 'error', 'icon', 'suffix', 'className', 'state']);
  return h(Field, {
    label: p.label,
    hint: p.hint,
    error: p.error,
    disabled: p.disabled,
    className: p.className
  }, h('span', {
    className: cx('nc-input', p.state && 'is-' + p.state, p.error && 'is-error', p.disabled && 'is-disabled')
  }, p.icon ? h(Icon, {
    name: p.icon,
    size: 18
  }) : null, h('input', Object.assign({
    'aria-invalid': p.error ? true : undefined
  }, rest)), p.suffix ? h('span', {
    className: 'nc-input__suffix'
  }, p.suffix) : null));
}

export { Input }
