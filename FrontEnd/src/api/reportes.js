// Reportes (ADMIN, SUPER y ANALISTA)
export const REPORTES = '/reportes/' // GET; POST {area?, areas?, formato?, periodo_inicio, periodo_fin}
export const REPORTE = (num) => `/reportes/${num}/` // GET
export const REPORTE_VISTA_PREVIA = '/reportes/vista-previa/' // GET ?areas=1,2&desde=…&hasta=…
export const REPORTE_PDF = (num) => `/reportes/${num}/pdf/` // GET: descarga en PDF
export const REPORTE_FORMATO = (num) => `/reportes/${num}/formato/` // POST {formato}: cambia el formato y regenera el PDF
export const PROGRAMACIONES_REPORTE = '/programaciones-reporte/' // GET, POST
// GET, PATCH {activa} para pausar/reanudar; DELETE deshabilitado (405)
export const PROGRAMACION_REPORTE = (num) => `/programaciones-reporte/${num}/`
export const PROGRAMACION_PROBAR = (num) => `/programaciones-reporte/${num}/probar/` // POST: prueba solo al solicitante

// Formatos de reporte (ADMIN y SUPER escriben; ANALISTA solo lee y usa)
export const FORMATOS_REPORTE = '/formatos-reporte/' // GET; ?archivados=1; POST {nombre, conf}
export const FORMATO_REPORTE = (num) => `/formatos-reporte/${num}/` // GET, PATCH {nombre?, conf?}, DELETE (archiva)
export const FORMATO_DUPLICAR = (num) => `/formatos-reporte/${num}/duplicar/` // POST {nombre?}
export const FORMATO_PREDETERMINADO = (num) => `/formatos-reporte/${num}/predeterminado/` // POST
export const FORMATO_AREAS = (num) => `/formatos-reporte/${num}/areas/` // POST {areas: [num]}
export const FORMATO_VERSIONES = (num) => `/formatos-reporte/${num}/versiones/` // GET

// Agente IA: uno por dispositivo. POST {pregunta, dispositivo} → {texto, picos?, serie?, etiquetas?, unidad?, maximo?}
export const AGENTE = '/agente/'
// POST {registro, voto: 'si'|'no'|null}: 👍 a una respuesta de la IA la guarda en el banco → {aprendida}
export const AGENTE_CALIFICAR = '/agente/calificar/'
// GET → {puente, activos: [num], fisicos, exige_puente, disponibles: [num]}: agentes cuyo ESP32 puente
// está conectado (sin puente, todos) y los que este usuario puede usar (el administrador, aunque
// el ESP32 esté sin conexión: modo de pruebas)
export const AGENTE_ESTADO = '/agente/estado/'
// GET ?dispositivo= → {activas, maximo, sugerencias: [{texto, tipo, etiqueta}]}: la web las filtra mientras se escribe
export const AGENTE_SUGERENCIAS = '/agente/sugerencias/'
