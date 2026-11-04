import React from 'react'
import { IconButton } from '../actions/IconButton.js'
import { Icon } from '../core/Icon.js'
import { cx } from '../core/nc-lib.js'
import { Avatar } from '../display/Avatar.js'
const h = React.createElement;
function Header(p) {
  return h('header', {
    className: cx('nc-header', p.className)
  }, h('div', {
    className: 'nc-header__titles'
  }, p.eyebrow ? h('span', {
    className: 'nc-header__eyebrow'
  }, p.eyebrow) : null, h('h1', {
    className: 'nc-header__title'
  }, p.title), p.subtitle ? h('p', {
    className: 'nc-header__sub'
  }, p.subtitle) : null), h('div', {
    className: 'nc-header__actions'
  }, p.search === false ? null : h('label', {
    className: 'nc-search'
  }, h(Icon, {
    name: 'search',
    size: 18
  }), h('input', {
    type: 'search',
    placeholder: p.searchPlaceholder || 'Buscar dispositivo, área…',
    'aria-label': 'Buscar'
  })), p.actions || null, h(IconButton, {
    icon: 'bell',
    label: 'Notificaciones',
    badge: p.notifications
  }), p.user ? h(Avatar, {
    name: p.user.name,
    size: 44
  }) : null));
}

export { Header }
