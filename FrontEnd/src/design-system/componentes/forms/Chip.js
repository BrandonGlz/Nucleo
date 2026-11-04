import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, omit } from '../core/nc-lib.js'
const h = React.createElement;
function Chip(p) {
  var rest = omit(p, ['selected', 'icon', 'className', 'children', 'state', 'count']);
  return h('button', Object.assign({
    type: 'button',
    'aria-pressed': !!p.selected
  }, rest, {
    className: cx('nc-chip', p.selected && 'is-selected', p.state && 'is-' + p.state, p.className)
  }), p.icon ? h(Icon, {
    name: p.icon,
    size: 16
  }) : null, p.children, p.count != null ? h('span', {
    className: 'nc-chip__count'
  }, p.count) : null);
}

export { Chip }
