import React from 'react'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
// `src`: foto (opcional). Si no hay o no carga, se ven las iniciales de `name`.
function Avatar(p) {
  var s = p.size || 40;
  var fallida = React.useState(null);
  var ini = (p.name || '?').split(' ').filter(Boolean).map(function (w) {
    return w[0];
  }).slice(0, 2).join('').toUpperCase();
  var conFoto = p.src && fallida[0] !== p.src;
  return h('span', {
    className: cx('nc-avatar', conFoto && 'nc-avatar--foto', p.className),
    style: {
      width: s,
      height: s,
      fontSize: Math.round(s * 0.38)
    },
    title: p.name
  }, conFoto ? h('img', {
    src: p.src,
    alt: p.name || '',
    loading: 'lazy',
    decoding: 'async',
    draggable: false,
    onError: function () {
      fallida[1](p.src);
    }
  }) : ini, p.status ? h('span', {
    className: 'nc-avatar__dot nc-dot--' + p.status,
    'aria-label': p.status
  }) : null);
}

export { Avatar }
