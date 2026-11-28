import { LIMITES, TIPOS } from './catalogo'

export const clonar = (valor) => JSON.parse(JSON.stringify(valor))

export function minimoDe(tipo) {
  return TIPOS[tipo]?.minimo || [1, 1]
}

// ¿Cabe una tarjeta en la rejilla sin salirse y sin encimarse con otra?
export function cabeTarjeta(tarjetas, id, x, y, w, h, tipo) {
  const [minW, minH] = minimoDe(tipo)
  if (x < 0 || y < 0 || x + w > LIMITES.columnas || y + h > LIMITES.filas) return false
  if (w < minW || h < minH) return false
  return !tarjetas.some((otra) => {
    if (otra.id === id) return false
    return x < otra.x + otra.w && x + w > otra.x && y < otra.y + otra.h && y + h > otra.y
  })
}

export function primerHueco(tarjetas, w, h, tipo) {
  for (let y = 0; y <= LIMITES.filas - h; y += 1) {
    for (let x = 0; x <= LIMITES.columnas - w; x += 1) {
      if (cabeTarjeta(tarjetas, null, x, y, w, h, tipo)) return { x, y }
    }
  }
  return null
}

export function nuevoIdTarjeta(conf) {
  const usados = new Set((conf?.paginas || []).flatMap((p) => (p.tarjetas || []).map((t) => t.id)))
  let n = 1
  while (usados.has(`t${n}`)) n += 1
  return `t${n}`
}

export function nuevoIdPagina(conf) {
  const usados = new Set((conf?.paginas || []).map((p) => p.id))
  let n = 1
  while (usados.has(`p${n}`)) n += 1
  return `p${n}`
}

export function opcionesIniciales(tipo) {
  const definicion = TIPOS[tipo]
  if (!definicion) return {}
  return Object.fromEntries(
    definicion.opciones.map((o) => [o.clave, Array.isArray(o.porOmision) ? [...o.porOmision] : o.porOmision]),
  )
}
