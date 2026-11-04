import React from 'react'
import { Icon } from '../core/Icon.js'
import { Logo } from '../core/Logo.js'
import { cx, useControlled } from '../core/nc-lib.js'
import { Avatar } from '../display/Avatar.js'
const h = React.createElement;
const DEFAULT_NAV = [{
  id: 'dashboard',
  label: 'Panel',
  icon: 'layout-dashboard'
}, {
  id: 'devices',
  label: 'Dispositivos',
  icon: 'cpu'
}, {
  id: 'history',
  label: 'Histórico',
  icon: 'history'
}, {
  id: 'thresholds',
  label: 'Umbrales',
  icon: 'sliders-horizontal'
}, {
  id: 'alerts',
  label: 'Alertas',
  icon: 'bell',
  count: 3
}, {
  id: 'users',
  label: 'Usuarios',
  icon: 'users'
}];
function Sidebar(p) {
  var items = p.items || DEFAULT_NAV;
  var st = useControlled(p.active, items[0].id, p.onSelect);
  return h('nav', {
    className: cx('nc-sidebar', p.className),
    'aria-label': 'Navegación principal'
  }, h('div', {
    className: 'nc-sidebar__brand'
  }, h(Logo, {
    size: 32,
    inverse: true
  })), h('span', {
    className: 'nc-sidebar__section'
  }, 'Menú'), h('ul', null, items.map(function (it) {
    var on = st[0] === it.id;
    return h('li', {
      key: it.id
    }, h('button', {
      type: 'button',
      'aria-current': on ? 'page' : undefined,
      className: cx('nc-navitem', on && 'is-active'),
      onClick: function () {
        st[1](it.id);
      }
    }, h(Icon, {
      name: it.icon,
      size: 20
    }), h('span', null, it.label), it.count ? h('span', {
      className: 'nc-navitem__count'
    }, it.count) : null));
  })), h('div', {
    className: 'nc-sidebar__foot'
  }, h('button', {
    type: 'button',
    className: 'nc-navitem'
  }, h(Icon, {
    name: 'settings',
    size: 20
  }), h('span', null, 'Configuración')), p.user ? h('div', {
    className: 'nc-sidebar__user'
  }, h(Avatar, {
    name: p.user.name,
    size: 36
  }), h('div', null, h('strong', null, p.user.name), h('span', null, p.user.role))) : null));
}

export { DEFAULT_NAV, Sidebar }
