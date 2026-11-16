import { lazy } from 'react'

// Secciones de la consola de Nico AI: ruta, menú y página (cada una se descarga al abrirla).
export const SECCIONES = [
  { ruta: '/', titulo: 'Panel', icono: 'layout-dashboard', grupo: 'Agente', Pagina: lazy(() => import('./paginas/PanelConsola')) },
  { ruta: '/chat', titulo: 'Chat', icono: 'sparkles', grupo: 'Agente', Pagina: lazy(() => import('./paginas/ChatConsola')) },
  { ruta: '/banco', titulo: 'Banco de respuestas', icono: 'book-open', grupo: 'Conocimiento', Pagina: lazy(() => import('./paginas/BancoConsola')) },
  { ruta: '/registro', titulo: 'Registro de preguntas', icono: 'list', grupo: 'Conocimiento', Pagina: lazy(() => import('./paginas/RegistroConsola')) },
  { ruta: '/herramientas', titulo: 'Herramientas', icono: 'wrench', grupo: 'Configuración', Pagina: lazy(() => import('./paginas/HerramientasConsola')) },
  { ruta: '/sugerencias', titulo: 'Sugerencias', icono: 'message-square-text', grupo: 'Configuración', Pagina: lazy(() => import('./paginas/SugerenciasConsola')) },
  { ruta: '/documentos', titulo: 'Documento', icono: 'file-code', grupo: 'Configuración', Pagina: lazy(() => import('./paginas/DocumentosConsola')) },
  { ruta: '/notificaciones', titulo: 'Notificaciones', icono: 'bell', grupo: 'Configuración', Pagina: lazy(() => import('./paginas/NotificacionesConsola')) },
]
export const GRUPOS = ['Agente', 'Conocimiento', 'Configuración']
