import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, omit } from '../core/nc-lib.js'
const h = React.createElement;
function Button(p) {
  var rest = omit(p, ['variant', 'size', 'icon', 'iconRight', 'className', 'children', 'state', 'block']);
  return h('button', Object.assign({
    type: 'button'
  }, rest, {
    className: cx('nc-btn', 'nc-btn--' + (p.variant || 'primary'), 'nc-btn--' + (p.size || 'md'), p.block && 'nc-btn--block', p.state && 'is-' + p.state, p.className)
  }), p.icon ? h(Icon, {
    name: p.icon,
    size: p.size === 'sm' ? 16 : 18
  }) : null, p.children ? h('span', null, p.children) : null, p.iconRight ? h(Icon, {
    name: p.iconRight,
    size: p.size === 'sm' ? 16 : 18
  }) : null);
}

export { Button }
