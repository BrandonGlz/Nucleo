import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function EmptyState(p) {
  return h('div', {
    className: cx('nc-empty', p.compact && 'nc-empty--compact', p.className)
  }, h('span', {
    className: 'nc-empty__icon'
  }, h(Icon, {
    name: p.icon || 'activity',
    size: 28
  })), h('strong', null, p.title), p.message ? h('p', null, p.message) : null, p.action || null);
}

export { EmptyState }
