import React from 'react'
import { Icon } from '../core/Icon.js'
import { STATUS, cx, fmt } from '../core/nc-lib.js'
const h = React.createElement;
function HeroCard(p) {
  var st = STATUS[p.status || 'normal'];
  return h('section', {
    className: cx('nc-hero', p.layout === 'mobile' && 'nc-hero--mobile', p.className)
  }, h('div', {
    className: 'nc-hero__top'
  }, h('div', null, p.eyebrow ? h('span', {
    className: 'nc-hero__eyebrow'
  }, p.eyebrow) : null, h('h2', {
    className: 'nc-hero__title'
  }, p.title)), h('span', {
    className: 'nc-hero__status'
  }, h(Icon, {
    name: st.icon,
    size: 16
  }), p.statusLabel || st.label)), p.value != null ? h('div', {
    className: 'nc-hero__reading'
  }, h('span', {
    className: 'nc-hero__value'
  }, fmt(p.value, p.decimals)), h('span', {
    className: 'nc-hero__unit'
  }, p.unit), p.valueLabel ? h('span', {
    className: 'nc-hero__vlabel'
  }, p.valueLabel) : null) : null, p.metrics ? h('div', {
    className: 'nc-hero__metrics'
  }, p.metrics.map(function (m, i) {
    return h('div', {
      key: i,
      className: 'nc-hero__metric'
    }, m.icon ? h('span', {
      className: 'nc-hero__micon'
    }, h(Icon, {
      name: m.icon,
      size: 16
    })) : null, h('div', null, h('span', {
      className: 'nc-hero__mvalue'
    }, fmt(m.value, m.decimals), h('small', null, ' ' + (m.unit || ''))), h('span', {
      className: 'nc-hero__mlabel'
    }, m.label)));
  })) : null, p.footer ? h('div', {
    className: 'nc-hero__foot'
  }, p.footer) : null);
}

export { HeroCard }
