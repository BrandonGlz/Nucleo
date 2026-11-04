import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function Badge(p) {
  return h('span', {
    className: cx('nc-badge', 'nc-tone--' + (p.tone || 'neutral'), p.size === 'lg' && 'nc-badge--lg', p.className)
  }, p.icon ? h(Icon, {
    name: p.icon,
    size: 14
  }) : p.dot ? h('span', {
    className: 'nc-badge__dot'
  }) : null, p.children);
}

export { Badge }
