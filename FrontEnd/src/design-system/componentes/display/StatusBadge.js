import React from 'react'
import { STATUS } from '../core/nc-lib.js'
import { Badge } from './Badge.js'
const h = React.createElement;
function StatusBadge(p) {
  var s = STATUS[p.status || 'normal'];
  return h(Badge, {
    tone: s.tone,
    icon: s.icon,
    size: p.size,
    className: p.className
  }, p.label || s.label);
}

export { StatusBadge }
