import React from 'react'
import { cx } from '../core/nc-lib.js'
const h = React.createElement;
function Battery(p) {
  var lvl = Math.max(0, Math.min(100, p.level == null ? 0 : p.level));
  var tone = lvl <= 15 ? 'danger' : lvl <= 30 ? 'warning' : 'neutral';
  return h('span', {
    className: cx('nc-battery', 'nc-battery--' + tone, p.className),
    title: 'Batería ' + lvl + '%'
  }, h('span', {
    className: 'nc-battery__body',
    'aria-hidden': true
  }, h('span', {
    className: 'nc-battery__fill',
    style: {
      width: lvl + '%'
    }
  })), p.hideLabel ? null : h('span', {
    className: 'nc-battery__label'
  }, lvl + '%'));
}

export { Battery }
