import React from 'react'
import { cx, fmt } from '../core/nc-lib.js'
import { Sparkline } from './Sparkline.js'

const h = React.createElement

// Valor grande con su unidad, variación contra el periodo anterior, sparkline y semáforo de meta.
function KpiTile(p) {
  const dec = p.decimales == null ? 1 : p.decimales
  const valor = p.valor == null || !Number.isFinite(Number(p.valor)) ? null : Number(p.valor)
  const variable = p.variacion && typeof p.variacion === 'object' ? p.variacion : { valor: p.variacion }
  const cambio = variable.valor == null || !Number.isFinite(Number(variable.valor)) ? null : Number(variable.valor)
  const tipo = variable.tipo || variable.unidad || p.tipoVariacion || 'pct'
  const sentido = p.meta?.sentido || p.sentido || 'mayor'
  const tolerancia = p.meta?.tolerancia == null ? 5 : Number(p.meta.tolerancia)
  const meta = p.meta && typeof p.meta === 'object' ? p.meta.valor : p.meta
  let semaforo = p.semaforo || null
  if (!semaforo && meta != null && valor != null) {
    const cumple = sentido === 'menor' ? valor <= Number(meta) : valor >= Number(meta)
    if (cumple) semaforo = 'success'
    else {
      const diferencia = Math.abs(valor - Number(meta)) / (Math.abs(Number(meta)) || 1) * 100
      semaforo = diferencia <= tolerancia ? 'warning' : 'danger'
    }
  }
  const tonoCambio = cambio == null || cambio === 0 ? 'neutral' : (sentido === 'menor' ? cambio < 0 : cambio > 0) ? 'success' : 'danger'
  const signo = cambio == null ? '' : cambio > 0 ? '+' : cambio < 0 ? '−' : ''
  const flecha = cambio == null || cambio === 0 ? '■' : cambio > 0 ? '▲' : '▼'
  const textoCambio = cambio == null ? '' : `${flecha} ${signo}${Math.abs(cambio).toFixed(1)} ${tipo === 'pts' ? 'pts' : '%'}`
  const puntos = (p.sparkline || []).map((d) => (typeof d === 'number' ? d : Number(d.value ?? d.y ?? 0)))
  const etiquetaMeta = meta == null ? '' : `Meta ${sentido === 'menor' ? '≤' : '≥'} ${fmt(Number(meta), dec)}${p.unidad ? ` ${p.unidad}` : ''}`
  const etiqueta = `${p.titulo || 'Indicador'}: ${valor == null ? 'sin datos' : fmt(valor, dec)}${p.unidad ? ` ${p.unidad}` : ''}${textoCambio ? `, ${textoCambio}` : ''}${etiquetaMeta ? `, ${etiquetaMeta}` : ''}`
  return h('div', {
    className: cx('nc-kpi', p.className),
    role: 'group',
    'aria-label': etiqueta,
  },
  h('div', { className: 'nc-kpi__cabeza' },
    h('span', { className: 'nc-kpi__titulo' }, p.titulo || ''),
    p.cargando ? h('span', { className: 'nc-kpi__cargando' }, 'Cargando…') : null),
  h('div', { className: 'nc-kpi__cuerpo' },
    h('strong', { className: 'nc-kpi__valor ui-num' }, valor == null ? '—' : fmt(valor, dec),
      p.unidad ? h('small', { className: 'nc-kpi__unidad' }, p.unidad) : null),
    cambio != null ? h('span', {
      className: cx('nc-kpi__variacion', `is-${tonoCambio}`),
    }, textoCambio, h('small', null, ' vs anterior')) : null),
  h('div', { className: 'nc-kpi__pie' },
    p.sparkline?.length > 1 ? h('span', { className: 'nc-kpi__spark' },
      h(Sparkline, { data: puntos, width: p.sparkAncho || 120, height: 34, tone: semaforo || undefined })) : null,
    semaforo ? h('span', { className: cx('nc-kpi__semaforo', `is-${semaforo}`) },
      h('i', { style: { background: `var(--${semaforo})` } }), etiquetaMeta) : null),
  valor == null && !p.cargando ? h('span', { className: 'nc-kpi__sin-datos' }, p.vacio || 'Sin datos en el periodo') : null)
}

export { KpiTile }
