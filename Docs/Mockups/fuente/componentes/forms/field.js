import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function Field(p) {
  return h('label', {
    className: cx('nc-field', p.error && 'is-error', p.disabled && 'is-disabled', p.className)
  }, p.label ? h('span', {
    className: 'nc-field__label'
  }, p.label) : null, p.children, p.error ? h('span', {
    className: 'nc-field__msg nc-field__msg--error'
  }, h(Icon, {
    name: 'octagon-alert',
    size: 14
  }), p.error) : p.hint ? h('span', {
    className: 'nc-field__msg'
  }, p.hint) : null);
}

export { Field }
