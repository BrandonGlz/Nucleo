import React from 'react'
import { cx, useControlled } from '../core/nc-lib.js'
import { estiloIndicador, useIndicadorDeslizante } from '../core/useIndicadorDeslizante.js'
import { Chip } from './Chip.js'
const h = React.createElement;

// Selector de periodo con la pastilla de la opción elegida que se desliza hasta la nueva (igual que Tabs).
function PeriodFilter(p) {
  var opts = p.options || ['Hoy', '7 días', '30 días'];
  var st = useControlled(p.value, p.defaultValue || opts[0], p.onChange);
  var actual = st[0];
  var ind = useIndicadorDeslizante('.nc-chip.is-selected', '.nc-chip', [actual, opts.length]);
  var m = ind.medida;

  return h('div', {
    ref: ind.caja,
    className: cx('nc-period', m && 'con-indicador', p.className),
    role: 'group',
    'aria-label': p.label || 'Periodo'
  }, m ? h('span', {
    className: cx('nc-period__indicador', ind.deslizar && 'is-deslizando'),
    'aria-hidden': true,
    style: estiloIndicador(m)
  }) : null, opts.map(function (o) {
    return h(Chip, {
      key: o,
      selected: actual === o,
      onClick: function () {
        st[1](o);
      }
    }, o);
  }));
}

export { PeriodFilter }
