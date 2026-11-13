// Consola de Nico AI (nicoai.bynucleo.com): solo el superusuario (administrador de plataforma).
export const NICO_CHAT = '/nico/chat/' // POST, igual que AGENTE pero con cualquier dispositivo
export const NICO_CALIFICAR = '/nico/calificar/' // POST {registro, voto}
export const NICO_CHAT_SUGERENCIAS = '/nico/chat/sugerencias/' // GET ?dispositivo= → igual que /agente/sugerencias/
// GET [?dispositivo=] → {ajuste, candidatas: [{texto, tipo, etiqueta, clave, oculta}]}; PATCH {activas, maximo, usar_*, fijadas, ocultas}
export const NICO_SUGERENCIAS = '/nico/sugerencias/'
export const NICO_ESTADO = '/nico/estado/' // GET → {puente, activos, fisicos} de todas las empresas
export const NICO_ARBOL = '/nico/arbol/' // GET → {puente, empresas: [{num, nombre, areas: [{num, nombre, dispositivos}]}]}
export const NICO_RESUMEN = '/nico/resumen/' // GET → cifras y series del dashboard de inicio
// GET → respuestas que Nico ya trae en código: [{id, tipo, tema, pregunta, otras, respuesta, personalizada}]
export const NICO_INCLUIDAS = '/nico/incluidas/'
// Banco de preguntas y respuestas. GET ?organizacion&tema&activa&q; POST {organizacion|todas, pregunta, tema, plantilla}
export const NICO_BANCO = '/nico/banco/'
export const NICO_RESPUESTA = (num) => `/nico/banco/${num}/` // PATCH, DELETE
export const NICO_REGISTRO = '/nico/registro/' // GET ?organizacion&via&calificacion=si|no&q&page
export const NICO_HERRAMIENTAS = '/nico/herramientas/' // GET {herramientas, propositos}
export const NICO_HERRAMIENTA = (nombre) => `/nico/herramientas/${nombre}/` // PATCH {descripcion, proposito (clave de la lista), ejemplo, activa, restaurar}
export const NICO_DOCUMENTOS = '/nico/documentos/' // GET → {documentos: [NICO], secciones: [{titulo, descripcion}], limite, usados}
export const NICO_DOCUMENTO = (num) => `/nico/documentos/${num}/` // PATCH {contenido, activo, descripcion}
// Un solo documento (NICO.md) dividido en secciones «## Título»; no se crean ni se borran documentos.
// POST {seccion}: la IA lee esa sección una vez y propone respuestas para el banco (en segundo plano).
// GET ?seccion= → {estado: sin_generar|generando|listo|error, propuestas: [{pregunta, respuesta}], error}
export const NICO_DOCUMENTO_GENERAR = (num) => `/nico/documentos/${num}/generar/`
