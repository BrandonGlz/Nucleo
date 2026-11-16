// En celulares las tablas con la clase ui-tabla-tarjetas se muestran como tarjetas apiladas
// (estilos/movil.css, ≤560 px): cada celda muestra el nombre de su columna, que se copia del
// encabezado a data-etiqueta. Las demás tablas se desplazan a lo ancho dentro de su tarjeta.

function etiquetar(tabla) {
  const titulos = [...tabla.querySelectorAll(':scope > thead th')].map((th) => th.textContent.trim())
  if (!titulos.length) return
  for (const fila of tabla.querySelectorAll(':scope > tbody > tr')) {
    let columna = 0
    for (const celda of fila.cells) {
      const titulo = celda.colSpan > 1 ? '' : (titulos[columna] ?? '')
      if (celda.dataset.etiqueta !== titulo) celda.dataset.etiqueta = titulo
      columna += celda.colSpan || 1
    }
  }
}

// Etiqueta las tablas de `raiz` y las que React agregue o cambie después. Devuelve la limpieza.
export function etiquetarTablas(raiz) {
  let pendiente = 0
  const correr = () => {
    pendiente = 0
    raiz.querySelectorAll('table.ui-tabla-tarjetas').forEach(etiquetar)
  }
  const observador = new MutationObserver(() => {
    if (!pendiente) pendiente = requestAnimationFrame(correr)
  })
  observador.observe(raiz, { childList: true, subtree: true, characterData: true })
  correr()
  return () => {
    observador.disconnect()
    cancelAnimationFrame(pendiente)
  }
}
