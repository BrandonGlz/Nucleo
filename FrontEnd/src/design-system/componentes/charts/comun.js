import React from 'react'

const { useLayoutEffect, useState } = React

// Escala del eje y con marcas «bonitas» (1, 2, 2.5, 5 × 10^n, nunca menores a 1): el eje acaba en
// valores redondos (0–1500, no 0–1504) con, como mucho, `pasos` renglones. `fijoMin`/`fijoMax`
// respetan los límites que pida quien usa la gráfica.
export function escalaBonita(bajo, alto, pasos, fijoMin, fijoMax) {
  if (fijoMin != null && fijoMax != null) {
    const marcas = []
    for (let t = 0; t <= pasos; t++) marcas.push(fijoMin + (fijoMax - fijoMin) * t / pasos)
    return { mn: fijoMin, mx: fijoMax, ticks: marcas }
  }
  if (fijoMin != null) bajo = fijoMin
  if (fijoMax != null) alto = fijoMax
  if (alto - bajo < 1e-9) {
    bajo -= 1
    alto += 1
  }
  const base = Math.pow(10, Math.max(0, Math.floor(Math.log10((alto - bajo) / pasos))))
  let paso, mn, mx
  for (let intento = 0; intento < 40; intento++) {
    const m = [1, 2, 2.5, 5][intento % 4] * base * Math.pow(10, Math.floor(intento / 4))
    if (m === 2.5) continue // 2.5 daría marcas con decimales (22.5); desde 25 sí es redondo
    mn = fijoMin != null ? fijoMin : Math.floor(bajo / m + 1e-9) * m
    mx = fijoMax != null ? fijoMax : fijoMin != null ? mn + Math.ceil((alto - mn) / m - 1e-9) * m : Math.ceil(alto / m - 1e-9) * m
    if (fijoMax != null) mn = mx - Math.ceil((mx - bajo) / m - 1e-9) * m
    paso = m
    if (Math.round((mx - mn) / m) <= pasos) break
  }
  if (mx <= mn) mx = mn + paso
  const ticks = []
  for (let v = mn; v <= mx + paso / 2; v += paso) ticks.push(+v.toFixed(6))
  return { mn, mx, ticks }
}

// Si el tooltip fijo pisa la etiqueta Máx/Mín, se mueve justo encima o debajo de ella (lo más
// cerca posible de su lugar) sin salirse de la gráfica.
export function evitarEtiquetas(top, alto, H, franjas) {
  const choca = (y) => franjas.some((f) => y < f[1] && y + alto > f[0])
  if (!choca(top)) return top
  let opciones = []
  franjas.forEach((f) => {
    opciones.push(f[0] - alto - 4, f[1] + 4)
  })
  opciones = opciones.filter((y) => y >= 0 && y + alto <= H && !choca(y)).sort((a, b) => Math.abs(a - top) - Math.abs(b - top))
  return opciones.length ? opciones[0] : top
}

// Paleta de series para las gráficas de Analítica. Son tokens: el tema claro y el oscuro cambian
// solos y ninguna gráfica escribe un color a mano.
export const PALETA = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
]
export const colorSerie = (i) => PALETA[i % PALETA.length]
export const colorTono = (tono) => (tono ? `var(--${tono})` : 'var(--chart-line)')

// Un filtro cruzado guarda `{dimension, valor}`. Las tarjetas comparan por cadena para que un id
// numérico de la API y el mismo id del DOM se consideren iguales.
export const mismoValor = (a, b) => a != null && b != null && String(a) === String(b)
export function esSeleccion(seleccion, dimension, valor) {
  return Boolean(seleccion && dimension && seleccion.dimension === dimension && mismoValor(seleccion.valor, valor))
}
export function atenuado(seleccion, dimension, valor) {
  return seleccion && !esSeleccion(seleccion, dimension, valor) ? 0.32 : 1
}
export function valorDe(item) {
  return item?.dimensionValor ?? item?.dimension_valor ?? item?.valor ?? item?.label
}

// Elemento clicable de una gráfica: `button` cuando hay filtro cruzado y `g` normal cuando no.
export function propsSeleccion(p, item) {
  if (!p.alSeleccionar) return {}
  const dimension = item?.dimension
  const valor = valorDe(item)
  if (!dimension || valor == null) return {}
  return {
    role: 'button',
    tabIndex: 0,
    className: 'nc-seleccionable',
    'aria-pressed': esSeleccion(p.seleccion, dimension, valor),
    style: { cursor: 'pointer', opacity: atenuado(p.seleccion, dimension, valor) },
    onClick: (evento) => {
      evento.stopPropagation()
      p.alSeleccionar({ dimension, valor })
    },
    onKeyDown: (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault()
        p.alSeleccionar({ dimension, valor })
      }
    },
  }
}

// El tooltip de las gráficas nuevas: se pega al punto pero se voltea y se recorta para no salirse
// del contenedor ni tapar las etiquetas de los extremos.
export function ChartTooltip({ x, y, ancho, alto, children }) {
  const [el, setEl] = useState(null)
  const [tam, setTam] = useState([0, 0])
  useLayoutEffect(() => {
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (tam[0] !== w || tam[1] !== h) setTam([w, h])
  }, [el, tam, children])
  const margen = 8
  let left = x + 12
  if (tam[0] && left + tam[0] > ancho - margen) left = x - 12 - tam[0]
  left = Math.max(margen, Math.min(ancho - (tam[0] || 0) - margen, left))
  let top = y - (tam[1] || 0) - 10
  if (top < margen) top = y + 14
  top = Math.max(margen, Math.min(alto - (tam[1] || 0) - margen, top))
  return React.createElement(
    'div',
    { ref: setEl, className: 'nc-tooltip nc-tooltip--libre', style: { left, top } },
    children,
  )
}

// Resumen para el aria-label: nombres de las series con su último valor.
export function resumenSeries(series, unidad = '', decimales = 1) {
  return series
    .map((s) => {
      const ultimo = s.puntos?.filter((p) => p.value != null).at(-1)
      return `${s.nombre || 'Serie'}: ${ultimo ? Number(ultimo.value).toFixed(decimales) : 'sin datos'}${unidad ? ` ${unidad}` : ''}`
    })
    .join('; ')
}
