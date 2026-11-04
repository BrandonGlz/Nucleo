import React from 'react'
import { ICONS } from './icons.js'
import { cx } from './nc-lib.js'
const h = React.createElement;
function Icon(p) {
  var Glifo = ICONS[p.name] || ICONS['info'];
  return h(Glifo, {
    className: cx('nc-icon', p.className),
    size: p.size || 20,
    strokeWidth: p.strokeWidth || 2,
    'aria-hidden': p.label ? undefined : true,
    role: p.label ? 'img' : undefined,
    'aria-label': p.label
  });
}
const ICON_NAMES = Object.keys(ICONS);

export { Icon, ICON_NAMES }
