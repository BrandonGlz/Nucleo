import React from 'react'
import { IconButton } from '../actions/IconButton.js'
import { Icon } from '../core/Icon.js'
import { LEVEL, cx } from '../core/nc-lib.js'
const h = React.createElement;
function Toast(p) {
  var lv = LEVEL[p.level || 'normal'];
  return h('div', {
    role: 'status',
    className: cx('nc-toast', p.className)
  }, h('span', {
    className: cx('nc-toast__icon', 'nc-tone--' + lv.tone)
  }, h(Icon, {
    name: lv.icon,
    size: 18
  })), h('div', {
    className: 'nc-toast__body'
  }, h('strong', null, p.title), p.message ? h('span', null, p.message) : null), p.action || null, h(IconButton, {
    icon: 'x',
    label: 'Cerrar',
    variant: 'ghost',
    size: 'sm',
    onClick: p.onClose
  }));
}

export { Toast }
