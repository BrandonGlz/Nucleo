import React from 'react'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function Avatar(p) {
  var s = p.size || 40;
  var ini = (p.name || '?').split(' ').map(function (w) {
    return w[0];
  }).slice(0, 2).join('').toUpperCase();
  return h('span', {
    className: cx('nc-avatar', p.className),
    style: {
      width: s,
      height: s,
      fontSize: Math.round(s * 0.38)
    },
    title: p.name
  }, p.src ? h('img', {
    src: p.src,
    alt: p.name || ''
  }) : ini, p.status ? h('span', {
    className: 'nc-avatar__dot nc-dot--' + p.status,
    'aria-label': p.status
  }) : null);
}

export { Avatar }
