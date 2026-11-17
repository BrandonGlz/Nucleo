import React from 'react'
import { cx, useControlled } from '../core/nc-lib.js'
import { estiloIndicador, useIndicadorDeslizante } from '../core/useIndicadorDeslizante.js'
import { Chip } from './Chip.js'
const h = React.createElement;

// Fila de chips de filtro (con ícono y contador) de la que se elige uno: la pastilla del elegido se
// desliza hasta el nuevo, igual que en Tabs y PeriodFilter. Si los chips ocupan dos renglones, el
// indicador sigue también la posición vertical.
//   items: [{ id, label, icon?, count? }]
function ChipFilter(p) {
  var items = p.items || [];
  var st = useControlled(p.value, p.defaultValue || items[0] && items[0].id, p.onChange);
  var actual = st[0];
  var ind = useIndicadorDeslizante('.nc-chip.is-selected', '.nc-chip', [actual, items.length]);
  var m = ind.medida;

  return h('div', {
    ref: ind.caja,
    className: cx('nc-chipfilter', m && 'con-indicador', p.className),
    style: p.style,
    role: 'group',
    'aria-label': p.label || 'Filtro'
  }, m ? h('span', {
    className: cx('nc-chipfilter__indicador', ind.deslizar && 'is-deslizando'),
    'aria-hidden': true,
    style: estiloIndicador(m)
  }) : null, items.map(function (it) {
    return h(Chip, {
      key: it.id,
      icon: it.icon,
      count: it.count,
      selected: actual === it.id,
      onClick: function () {
        st[1](it.id);
      }
    }, it.label);
  }));
}

export { ChipFilter }
