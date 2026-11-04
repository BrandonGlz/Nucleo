import React from 'react'
import { Icon } from './Icon.js'
import { cx } from './nc-lib.js'
const h = React.createElement;
function IconCircle(p) {
  var size = p.size || 'md';
  var px = {
    sm: 32,
    md: 44,
    lg: 56
  }[size];
  var ic = {
    sm: 16,
    md: 20,
    lg: 24
  }[size];
  return h('span', {
    className: cx('nc-iconcircle', 'nc-iconcircle--' + size, 'nc-tone--' + (p.tone || 'neutral'), p.className),
    style: {
      width: px,
      height: px
    }
  }, h(Icon, {
    name: p.name,
    size: ic
  }));
}

export { IconCircle }
