import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, omit } from '../core/nc-lib.js'
const h = React.createElement;
function IconButton(p) {
  var rest = omit(p, ['variant', 'icon', 'label', 'badge', 'className', 'size', 'state']);
  return h('button', Object.assign({
    type: 'button',
    'aria-label': p.label,
    title: p.label
  }, rest, {
    className: cx('nc-iconbtn', 'nc-iconbtn--' + (p.variant || 'secondary'), p.size === 'sm' && 'nc-iconbtn--sm', p.state && 'is-' + p.state, p.className)
  }), h(Icon, {
    name: p.icon,
    size: p.size === 'sm' ? 16 : 20
  }), p.badge ? h('span', {
    className: 'nc-iconbtn__badge',
    'aria-label': p.badge + ' sin leer'
  }, p.badge) : null);
}

export { IconButton }
