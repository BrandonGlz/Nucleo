// Se carga en <head> antes de pintar: aplica el tema guardado o el del sistema sin parpadeo.
(function () {
  var guardado = null
  try { guardado = localStorage.getItem('tema') } catch (e) { /* sin almacenamiento */ }
  var claro = guardado ? guardado === 'claro' : window.matchMedia('(prefers-color-scheme: light)').matches
  document.documentElement.dataset.tema = claro ? 'claro' : 'oscuro'
})()
