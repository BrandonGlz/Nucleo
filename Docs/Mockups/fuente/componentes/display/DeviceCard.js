import React from 'react'
import { IconCircle } from '../core/IconCircle.js'
import { cx, useControlled } from '../core/nc-lib.js'
import { Battery } from './Battery.js'
import { SignalBars } from './SignalBars.js'
import { Toggle } from '../forms/Toggle.js'
const h = React.createElement;
function DeviceCard(p) {
  var st = useControlled(p.on, p.defaultOn !== false, p.onToggle);
  var off = !st[0] || p.status === 'offline';
  return h('section', {
    className: cx('nc-card', 'nc-device', st[0] && p.status !== 'offline' && 'is-on', off && 'is-off', p.className)
  }, h('div', {
    className: 'nc-device__top'
  }, h(IconCircle, {
    name: p.icon || 'radio',
    size: 'md',
    tone: st[0] && p.status !== 'offline' ? 'ink' : 'neutral'
  }), h(Toggle, {
    checked: st[0],
    onChange: st[1],
    ariaLabel: 'Transmisión de ' + p.name,
    disabled: p.status === 'offline'
  })), h('div', {
    className: 'nc-device__name'
  }, h('strong', null, p.name), h('span', null, p.location)), h('div', {
    className: 'nc-device__meta'
  }, h(Battery, {
    level: p.battery
  }), h(SignalBars, {
    level: p.status === 'offline' ? 0 : p.signal
  }), h('span', {
    className: 'nc-device__state'
  }, p.status === 'offline' ? 'Sin señal' : st[0] ? 'Transmitiendo' : 'En pausa')), p.reading ? h('div', {
    className: 'nc-device__reading'
  }, p.reading) : null);
}

export { DeviceCard }
