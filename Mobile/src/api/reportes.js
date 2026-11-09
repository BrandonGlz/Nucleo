// Reportes (ADMIN, SUPER y ANALISTA)
export const REPORTES = '/reportes/' // GET; POST {area?, periodo_inicio, periodo_fin}
export const REPORTE = (num) => `/reportes/${num}/` // GET
export const REPORTE_PDF = (num) => `/reportes/${num}/pdf/` // GET: descarga en PDF
export const PROGRAMACIONES_REPORTE = '/programaciones-reporte/' // GET, POST
export const PROGRAMACION_REPORTE = (num) => `/programaciones-reporte/${num}/` // GET, PATCH, DELETE

// Agente IA: uno por dispositivo. POST {pregunta, dispositivo} → {texto, picos?, serie?, etiquetas?, unidad?, maximo?}
export const AGENTE = '/agente/'
