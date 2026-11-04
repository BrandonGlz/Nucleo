import React from 'react'
const {
  useState,
  useRef,
  useEffect
} = React;
const useId = React.useId || function () {
  const r = React.useRef('nc' + Math.random().toString(36).slice(2, 8));
  return r.current;
};
function cx() {
  var out = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) out.push(arguments[i]);
  }
  return out.join(' ');
}
function omit(o, keys) {
  var r = {};
  for (var k in o) {
    if (keys.indexOf(k) < 0) r[k] = o[k];
  }
  return r;
}
function useControlled(value, initial, onChange) {
  var s = useState(initial);
  var controlled = value !== undefined;
  return [controlled ? value : s[0], function (v) {
    if (!controlled) s[1](v);
    if (onChange) onChange(v);
  }];
}
function useWidth(fallback) {
  var ref = useRef(null);
  var s = useState(fallback);
  useEffect(function () {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function (e) {
      var w = Math.round(e[0].contentRect.width);
      if (w > 0) s[1](w);
    });
    ro.observe(ref.current);
    return function () {
      ro.disconnect();
    };
  }, []);
  return [ref, s[0]];
}
function fmt(v, d) {
  if (typeof v !== 'number') return v;
  return v.toLocaleString('es-MX', {
    minimumFractionDigits: d == null ? 0 : d,
    maximumFractionDigits: d == null ? 1 : d
  });
}
const STATUS = {
  normal: {
    tone: 'success',
    icon: 'circle-check',
    label: 'Normal'
  },
  warning: {
    tone: 'warning',
    icon: 'triangle-alert',
    label: 'Advertencia'
  },
  critical: {
    tone: 'danger',
    icon: 'octagon-alert',
    label: 'Crítico'
  },
  offline: {
    tone: 'offline',
    icon: 'wifi-off',
    label: 'Sin señal'
  }
};
const VARIABLES = {
  temperature: {
    icon: 'thermometer',
    label: 'Temperatura',
    unit: '°C'
  },
  humidity: {
    icon: 'droplets',
    label: 'Humedad',
    unit: '%'
  },
  air: {
    icon: 'wind',
    label: 'Calidad del aire',
    unit: 'AQI'
  },
  devices: {
    icon: 'cpu',
    label: 'Dispositivos activos',
    unit: ''
  }
};
function smoothPath(pts) {
  if (!pts.length) return '';
  var d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (var i = 1; i < pts.length; i++) {
    var p0 = pts[i - 1],
      p1 = pts[i],
      mxp = (p0[0] + p1[0]) / 2;
    d += ' C' + mxp + ' ' + p0[1] + ' ' + mxp + ' ' + p1[1] + ' ' + p1[0] + ' ' + p1[1];
  }
  return d;
}
function aqiInfo(v, warn, crit) {
  warn = warn || 100;
  crit = crit || 150;
  if (v == null) return {
    status: 'offline',
    label: 'Sin datos'
  };
  if (v > crit) return {
    status: 'critical',
    label: 'Dañina'
  };
  if (v > warn) return {
    status: 'warning',
    label: 'Dañina a sensibles'
  };
  if (v > 50) return {
    status: 'normal',
    label: 'Aceptable'
  };
  return {
    status: 'normal',
    label: 'Buena'
  };
}
const LEVEL = {
  info: {
    tone: 'neutral',
    icon: 'info'
  },
  normal: {
    tone: 'success',
    icon: 'circle-check'
  },
  warning: {
    tone: 'warning',
    icon: 'triangle-alert'
  },
  critical: {
    tone: 'danger',
    icon: 'octagon-alert'
  },
  offline: {
    tone: 'offline',
    icon: 'wifi-off'
  }
};

export { useId, cx, omit, useControlled, useWidth, fmt, STATUS, VARIABLES, smoothPath, aqiInfo, LEVEL }
