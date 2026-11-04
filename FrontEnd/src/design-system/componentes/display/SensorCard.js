import React from 'react'
import { Sparkline } from '../charts/Sparkline.js'
import { Icon } from '../core/Icon.js'
import { IconCircle } from '../core/IconCircle.js'
import { VARIABLES, cx, fmt } from '../core/nc-lib.js'
import { StatusBadge } from './StatusBadge.js'
const h = React.createElement;
function SensorCard(p) {
  var v = VARIABLES[p.variable] || {};
  var status = p.status || 'normal';
  return h('section', {
    className: cx('nc-card', 'nc-sensor', status === 'offline' && p.value == null && 'is-offline', p.compact && 'nc-sensor--compact', p.className)
  }, h('div', {
    className: 'nc-sensor__top'
  }, h(IconCircle, {
    name: p.icon || v.icon || 'activity',
    size: p.compact ? 'sm' : 'md'
  }), h('span', {
    className: 'nc-sensor__label'
  }, p.label || v.label), h(StatusBadge, {
    status: status,
    label: p.statusLabel
  })), h('div', {
    className: 'nc-sensor__main'
  }, h('div', {
    className: 'nc-sensor__reading'
  }, h('span', {
    className: 'nc-sensor__value'
  }, status === 'offline' && p.value == null ? '—' : fmt(p.value, p.decimals)), h('span', {
    className: 'nc-sensor__unit'
  }, p.unit || v.unit)), p.trend ? h(Sparkline, {
    data: p.trend,
    width: p.compact ? 72 : 96,
    height: p.compact ? 28 : 36,
    tone: status === 'critical' ? 'danger' : status === 'warning' ? 'warning' : status === 'offline' ? 'offline' : undefined
  }) : null), h('div', {
    className: 'nc-sensor__foot'
  }, p.delta ? h('span', {
    className: 'nc-sensor__delta'
  }, h(Icon, {
    name: p.delta.charAt(0) === '-' ? 'arrow-down-right' : 'arrow-up-right',
    size: 14
  }), p.delta) : null, p.range ? h('span', null, 'Rango ' + p.range) : null, p.updated ? h('span', {
    className: 'nc-sensor__time'
  }, p.updated) : null));
}

export { SensorCard }
