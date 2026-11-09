// Descarga el reporte en PDF con las mismas hojas A4 de la vista previa: las copia a un
// contenedor de impresión y abre el diálogo del navegador, donde se elige «Guardar como PDF».
// El nombre sugerido del archivo es el título del documento, que se cambia mientras dura.
export function descargarPdf(nombre) {
  const paginas = document.querySelector('.ui-paginas')
  if (!paginas) return
  const contenedor = document.createElement('div')
  contenedor.id = 'ui-impresion'
  contenedor.innerHTML = paginas.innerHTML
  document.body.appendChild(contenedor)
  document.documentElement.classList.add('ui-imprimiendo')
  const titulo = document.title
  document.title = nombre
  const limpiar = () => {
    contenedor.remove()
    document.documentElement.classList.remove('ui-imprimiendo')
    document.title = titulo
    window.removeEventListener('afterprint', limpiar)
  }
  window.addEventListener('afterprint', limpiar)
  window.print()
}
