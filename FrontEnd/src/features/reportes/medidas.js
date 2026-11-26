// Medidas de las hojas a 96 ppp: carta (8.5 × 11 in) y A4 (210 × 297 mm), en píxeles.
export const MEDIDAS = {
  carta: { vertical: [816, 1056], horizontal: [1056, 816] },
  a4: { vertical: [794, 1123], horizontal: [1123, 794] },
}

export function medidaHoja(hoja = {}) {
  const [ancho, alto] = MEDIDAS[hoja.tamano]?.[hoja.orientacion] ?? MEDIDAS.carta.vertical
  return { ancho, alto, margenY: 56, pie: 28, separacion: 16 }
}
