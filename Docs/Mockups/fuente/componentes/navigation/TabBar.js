import React from 'react'
import { Icon } from '../core/Icon.js'
import { cx, useControlled } from '../core/nc-lib.js'
const h = React.createElement;
const DEFAULT_TABS = [{
  id: 'home',
  label: 'Inicio',
  icon: 'house'
}, {
  id: 'history',
  label: 'Historial',
  icon: 'activity'
}, {
  id: 'alerts',
  label: 'Alertas',
  icon: 'bell',
  count: 2
}, {
  id: 'profile',
  label: 'Perfil',
  icon: 'user'
}];
function TabBar(p) {
  var items = p.items || DEFAULT_TABS;
  var st = useControlled(p.active, items[0].id, p.onSelect);
  return h('nav', {
    className: cx('nc-tabbar', p.className),
    'aria-label': 'Navegación'
  }, items.map(function (it) {
    var on = st[0] === it.id;
    return h('button', {
      key: it.id,
      type: 'button',
      'aria-current': on ? 'page' : undefined,
      'aria-label': it.label,
      className: cx('nc-tabbar__item', on && 'is-active'),
      onClick: function () {
        st[1](it.id);
      }
    }, h('span', {
      className: 'nc-tabbar__icon'
    }, h(Icon, {
      name: it.icon,
      size: 22
    }), it.count ? h('span', {
      className: 'nc-tabbar__dot'
    }) : null), on ? h('span', {
      className: 'nc-tabbar__label'
    }, it.label) : null);
  }));
}

export { DEFAULT_TABS, TabBar }
