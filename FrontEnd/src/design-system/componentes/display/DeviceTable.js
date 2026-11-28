import React from 'react'
import { Button } from '../actions/Button.js'
import { Icon } from '../core/Icon.js'
import { IconCircle } from '../core/IconCircle.js'
import { cx } from '../core/nc-lib.js'
import { Battery } from './Battery.js'
import { SignalBars } from './SignalBars.js'
import { StatusBadge } from './StatusBadge.js'
import { EmptyState } from '../feedback/EmptyState.js'
import { Skeleton } from '../feedback/Skeleton.js'
const h = React.createElement;
function DeviceTable(p) {
  var rows = p.devices || [];
  if (p.loading) return h('div', {
    className: 'nc-table-wrap ui-esqueleto-tabla',
    'aria-busy': true,
    'aria-label': 'Cargando dispositivos'
  }, h('table', {
    className: 'nc-table ui-tabla-tarjetas'
  }, h('thead', null, h('tr', null, ['Dispositivo', 'Ubicación', 'Batería', 'Señal', 'Última lectura', 'Estado'].map(function (c) {
    return h('th', {
      key: c,
      scope: 'col'
    }, c);
  }))), h('tbody', null, [0, 1, 2, 3, 4].map(function (i) {
    return h('tr', {
      key: i
    }, h('td', {
      'data-etiqueta': 'Dispositivo'
    }, h('div', {
      className: 'nc-table__device'
    }, h(Skeleton, {
      variant: 'circle',
      width: 32
    }), h('span', {
      className: 'ui-esqueleto-lineas'
    }, h(Skeleton, {
      width: '64%',
      height: 12
    }), h(Skeleton, {
      width: '42%',
      height: 9
    })))), h('td', {
      'data-etiqueta': 'Ubicación'
    }, h(Skeleton, {
      width: '68%',
      height: 12
    })), h('td', {
      'data-etiqueta': 'Batería'
    }, h(Skeleton, {
      width: 46,
      height: 12
    })), h('td', {
      'data-etiqueta': 'Señal'
    }, h(Skeleton, {
      width: 52,
      height: 12
    })), h('td', {
      'data-etiqueta': 'Última lectura'
    }, h(Skeleton, {
      width: '58%',
      height: 12
    })), h('td', {
      'data-etiqueta': 'Estado'
    }, h(Skeleton, {
      variant: 'circle',
      width: 72,
      height: 22
    })));
  }))));
  if (!rows.length) return h(EmptyState, {
    icon: 'cpu',
    title: 'Aún no hay dispositivos',
    message: 'Vincula tu primer Núcleo para empezar a recibir lecturas.',
    action: h(Button, {
      icon: 'plus'
    }, 'Agregar dispositivo')
  });
  return h('div', {
    className: cx('nc-table-wrap', p.className)
  }, h('table', {
    className: 'nc-table ui-tabla-tarjetas'
  }, h('thead', null, h('tr', null, ['Dispositivo', 'Ubicación', 'Batería', 'Señal', 'Última lectura', 'Estado'].map(function (c) {
    return h('th', {
      key: c,
      scope: 'col'
    }, c);
  }))), h('tbody', null, rows.map(function (d, i) {
    return h('tr', {
      key: d.id || i,
      className: d.selected ? 'is-selected' : ''
    }, h('td', null, h('div', {
      className: 'nc-table__device'
    }, h(IconCircle, {
      name: 'cpu',
      size: 'sm',
      tone: d.status === 'offline' ? 'offline' : 'neutral'
    }), h('div', null, h('strong', null, d.name), h('span', null, d.id)))), h('td', null, h('span', {
      className: 'nc-table__loc'
    }, h(Icon, {
      name: 'map-pin',
      size: 14
    }), d.location)), h('td', null, h(Battery, {
      level: d.battery
    })), h('td', null, h(SignalBars, {
      level: d.signal
    })), h('td', null, h('div', {
      className: 'nc-table__last'
    }, h('strong', null, d.reading || '—'), h('span', null, d.last))), h('td', null, h(StatusBadge, {
      status: d.status
    })));
  }))));
}

export { DeviceTable }
