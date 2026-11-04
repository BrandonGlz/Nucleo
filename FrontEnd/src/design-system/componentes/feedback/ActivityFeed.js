import React from 'react'
import { Icon } from '../core/Icon.js'
import { LEVEL, cx } from '../core/nc-lib.js'
import { EmptyState } from './EmptyState.js'
const h = React.createElement;
function ActivityFeed(p) {
  var items = p.items || [];
  if (!items.length) return h(EmptyState, {
    icon: 'bell-off',
    title: 'Sin alertas',
    message: 'Todo está en rango. Te avisaremos si algo cambia.',
    compact: true
  });
  return h('ol', {
    className: cx('nc-feed', p.className)
  }, items.map(function (it, i) {
    var lv = LEVEL[it.level || 'info'];
    return h('li', {
      key: i,
      className: cx('nc-feed__item', it.unread && 'is-unread')
    }, h('span', {
      className: cx('nc-feed__icon', 'nc-tone--' + lv.tone)
    }, h(Icon, {
      name: it.icon || lv.icon,
      size: 16
    })), h('div', {
      className: 'nc-feed__body'
    }, h('span', {
      className: 'nc-feed__title'
    }, it.title), h('span', {
      className: 'nc-feed__meta'
    }, it.meta)), h('time', {
      className: 'nc-feed__time'
    }, it.time));
  }));
}

export { ActivityFeed }
