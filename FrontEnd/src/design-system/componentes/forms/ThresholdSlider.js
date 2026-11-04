import React from 'react'
import { IconCircle } from '../core/IconCircle.js'
import { cx, fmt, useControlled } from '../core/nc-lib.js'
import { Input } from './Input.js'
const h = React.createElement;
function ThresholdSlider(p) {
  var min = p.min == null ? 0 : p.min,
    max = p.max == null ? 100 : p.max,
    step = p.step || 0.5;
  var st = useControlled(p.value, p.defaultValue || [min + (max - min) * 0.25, min + (max - min) * 0.75], p.onChange);
  var lo = st[0][0],
    hi = st[0][1];
  var pct = function (v) {
    return (v - min) / (max - min) * 100;
  };
  function set(i, v) {
    v = Math.max(min, Math.min(max, +v));
    if (isNaN(v)) return;
    var n = st[0].slice();
    n[i] = v;
    if (n[0] > n[1] - step) {
      if (i === 0) n[0] = n[1] - step;else n[1] = n[0] + step;
    }
    st[1](n);
  }
  var cur = p.current;
  return h('div', {
    className: cx('nc-threshold', p.disabled && 'is-disabled', p.className)
  }, h('div', {
    className: 'nc-threshold__head'
  }, h(IconCircle, {
    name: p.icon || 'thermometer',
    size: 'sm'
  }), h('div', {
    className: 'nc-threshold__title'
  }, h('span', {
    className: 'nc-threshold__label'
  }, p.label || 'Temperatura'), h('span', {
    className: 'nc-threshold__hint'
  }, 'Rango permitido ' + fmt(lo) + '–' + fmt(hi) + ' ' + (p.unit || ''))), p.headerAction || null), h('div', {
    className: 'nc-range'
  }, h('div', {
    className: 'nc-range__track'
  }, h('div', {
    className: 'nc-range__fill',
    style: {
      left: pct(lo) + '%',
      width: pct(hi) - pct(lo) + '%'
    }
  }), cur != null ? h('div', {
    className: cx('nc-range__current', (cur < lo || cur > hi) && 'is-out'),
    style: {
      left: pct(cur) + '%'
    },
    title: 'Lectura actual ' + cur
  }) : null), h('input', {
    type: 'range',
    min: min,
    max: max,
    step: step,
    value: lo,
    disabled: p.disabled,
    'aria-label': 'Mínimo',
    onChange: function (e) {
      set(0, e.target.value);
    }
  }), h('input', {
    type: 'range',
    min: min,
    max: max,
    step: step,
    value: hi,
    disabled: p.disabled,
    'aria-label': 'Máximo',
    onChange: function (e) {
      set(1, e.target.value);
    }
  })), h('div', {
    className: 'nc-threshold__inputs'
  }, h(Input, {
    label: 'Mínimo',
    type: 'number',
    value: lo,
    step: step,
    suffix: p.unit,
    disabled: p.disabled,
    onChange: function (e) {
      set(0, e.target.value);
    }
  }), h('span', {
    className: 'nc-threshold__dash'
  }, '–'), h(Input, {
    label: 'Máximo',
    type: 'number',
    value: hi,
    step: step,
    suffix: p.unit,
    disabled: p.disabled,
    onChange: function (e) {
      set(1, e.target.value);
    }
  })));
}

export { ThresholdSlider }
