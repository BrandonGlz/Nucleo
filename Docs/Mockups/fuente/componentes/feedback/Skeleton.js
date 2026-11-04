import React from 'react'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function Skeleton(p) {
  if (p.variant === 'card') return h('div', {
    className: 'nc-card nc-skel-card',
    'aria-busy': true,
    'aria-label': 'Cargando'
  }, h('div', {
    className: 'nc-skel-row'
  }, h(Skeleton, {
    variant: 'circle',
    width: 44
  }), h(Skeleton, {
    width: '40%'
  })), h(Skeleton, {
    width: '55%',
    height: 44
  }), h(Skeleton, {
    width: '80%'
  }));
  var w = p.width || '100%';
  var ht = p.height || (p.variant === 'circle' ? w : 14);
  return h('span', {
    className: cx('nc-skel', p.variant === 'circle' && 'nc-skel--circle', p.className),
    style: {
      width: w,
      height: ht
    }
  });
}

export { Skeleton }
