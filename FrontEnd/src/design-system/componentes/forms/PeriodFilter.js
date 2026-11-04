import React from 'react'
import { cx, useControlled } from '../core/nc-lib.js'
import { Chip } from './Chip.js'
const h = React.createElement;
function PeriodFilter(p) {
  var opts = p.options || ['Hoy', '7 días', '30 días'];
  var st = useControlled(p.value, p.defaultValue || opts[0], p.onChange);
  return h('div', {
    className: cx('nc-period', p.className),
    role: 'group',
    'aria-label': p.label || 'Periodo'
  }, opts.map(function (o) {
    return h(Chip, {
      key: o,
      selected: st[0] === o,
      onClick: function () {
        st[1](o);
      }
    }, o);
  }));
}

export { PeriodFilter }
