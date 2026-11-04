import React from 'react'
import { cx, omit } from '../core/nc-lib.js'
const h = React.createElement;
function Card(p) {
  var rest = omit(p, ['className', 'children', 'padding', 'interactive', 'title', 'action', 'subtitle']);
  return h('section', Object.assign({}, rest, {
    className: cx('nc-card', p.interactive && 'nc-card--interactive', p.padding === 'lg' && 'nc-card--lg', p.padding === 'sm' && 'nc-card--sm', p.className)
  }), p.title ? h('header', {
    className: 'nc-card__head'
  }, h('div', null, h('h3', {
    className: 'nc-card__title'
  }, p.title), p.subtitle ? h('p', {
    className: 'nc-card__sub'
  }, p.subtitle) : null), p.action || null) : null, p.children);
}

export { Card }
