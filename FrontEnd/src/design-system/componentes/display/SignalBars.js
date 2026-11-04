import React from 'react'
import { Icon } from '../core/Icon.js'
const h = React.createElement;
function SignalBars(p) {
  var lvl = p.level == null ? 4 : p.level;
  var names = ['Sin señal', 'Débil', 'Regular', 'Buena', 'Excelente'];
  if (lvl === 0) return h('span', {
    className: 'nc-signal nc-signal--off',
    title: 'Sin señal'
  }, h(Icon, {
    name: 'wifi-off',
    size: 16
  }), p.showLabel ? h('span', null, 'Sin señal') : null);
  return h('span', {
    className: 'nc-signal',
    title: 'Señal ' + names[lvl],
    role: 'img',
    'aria-label': 'Señal ' + names[lvl]
  }, h('span', {
    className: 'nc-signal__bars',
    'aria-hidden': true
  }, [1, 2, 3, 4].map(function (i) {
    return h('span', {
      key: i,
      className: i <= lvl ? 'is-on' : '',
      style: {
        height: 3 + i * 3
      }
    });
  })), p.showLabel ? h('span', null, names[lvl]) : null);
}

export { SignalBars }
