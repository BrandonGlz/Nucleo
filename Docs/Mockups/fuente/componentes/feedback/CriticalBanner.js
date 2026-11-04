import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function CriticalBanner(p) {
  return h('div', {
    role: 'alert',
    className: cx('nc-critical', p.className)
  }, h('span', {
    className: 'nc-critical__pulse'
  }, h(Icon, {
    name: 'octagon-alert',
    size: 22
  })), h('div', {
    className: 'nc-critical__body'
  }, h('strong', null, p.title), h('span', null, p.message)), p.time ? h('span', {
    className: 'nc-critical__time'
  }, p.time) : null, p.action || h('button', {
    type: 'button',
    className: 'nc-critical__btn'
  }, p.actionLabel || 'Ver detalle'));
}

export { CriticalBanner }
