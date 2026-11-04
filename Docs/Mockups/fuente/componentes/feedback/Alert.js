import React from 'react'
import { IconButton } from '../actions/IconButton.js'
import { Icon } from '../core/Icon.js'
import { LEVEL, cx } from '../core/nc-lib.js'
const h = React.createElement;
function Alert(p) {
  var lv = LEVEL[p.level || 'warning'];
  return h('div', {
    role: p.level === 'critical' ? 'alert' : 'status',
    className: cx('nc-alert', 'nc-tone--' + lv.tone, p.className)
  }, h('span', {
    className: 'nc-alert__icon'
  }, h(Icon, {
    name: lv.icon,
    size: 20
  })), h('div', {
    className: 'nc-alert__body'
  }, h('strong', null, p.title), p.children ? h('p', null, p.children) : null, p.action ? h('div', {
    className: 'nc-alert__actions'
  }, p.action) : null), p.onClose ? h(IconButton, {
    icon: 'x',
    label: 'Cerrar',
    variant: 'ghost',
    size: 'sm',
    onClick: p.onClose
  }) : null);
}

export { Alert }
