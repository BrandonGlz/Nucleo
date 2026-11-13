// Filtra las sugerencias del chat con lo que se lleva escrito (sin pedir nada al servidor).
// Cada palabra escrita debe ser el inicio de alguna palabra de la sugerencia, sin importar
// acentos, mayúsculas ni signos. Primero las que empiezan igual, luego por orden del servidor
// (fijadas, banco, consultas, frecuentes).

export const normalizar = (t) =>
  (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function filtrar(sugerencias, escrito, maximo = 6) {
  const q = normalizar(escrito)
  if (q.length < 2) return []
  const palabras = q.split(' ')
  const encontradas = []
  sugerencias.forEach((s, orden) => {
    const n = s.normal ?? normalizar(s.texto)
    if (n === q) return // ya está escrita completa
    const suyas = n.split(' ')
    if (!palabras.every((p) => suyas.some((w) => w.startsWith(p)))) return
    encontradas.push({ ...s, puntos: n.startsWith(q) ? 0 : 1, orden })
  })
  return encontradas.sort((a, b) => a.puntos - b.puntos || a.orden - b.orden).slice(0, maximo)
}

// Partes del texto para resaltar lo que coincide con lo escrito: [{texto, marca}].
export function resaltar(texto, escrito) {
  const palabras = normalizar(escrito).split(' ').filter(Boolean)
  const partes = []
  const regex = /[^\s]+|\s+/g
  let m
  while ((m = regex.exec(texto))) {
    const trozo = m[0]
    const n = normalizar(trozo)
    const p = n && palabras.find((x) => n.startsWith(x))
    if (p) {
      // El largo de la coincidencia en el texto original (los signos iniciales no cuentan).
      const inicio = trozo.search(/[\p{L}\p{N}]/u)
      const largo = Math.min(trozo.length - inicio, p.length)
      if (inicio > 0) partes.push({ texto: trozo.slice(0, inicio), marca: false })
      partes.push({ texto: trozo.slice(inicio, inicio + largo), marca: true })
      partes.push({ texto: trozo.slice(inicio + largo), marca: false })
    } else partes.push({ texto: trozo, marca: false })
  }
  return partes.filter((x) => x.texto)
}
