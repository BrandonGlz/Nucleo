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
    className: 'nc-table-wrap'
  }, [0, 1, 2, 3].map(function (i) {
    return h('div', {
      key: i,
      className: 'nc-table-skel'
    }, h(Skeleton, {
      variant: 'circle',
      width: 32
    }), h(Skeleton, {
      width: '28%'
    }), h(Skeleton, {
      width: '18%'
    }), h(Skeleton, {
      width: '12%'
    }), h(Skeleton, {
      width: '14%'
    }));
  }));
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
    className: 'nc-table'
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
