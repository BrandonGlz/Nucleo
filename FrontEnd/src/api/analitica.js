// Analítica (ADMIN, SUPER y ANALISTA leen; ADMIN y SUPER escriben)
export const TABLEROS_ANALITICA = '/tableros-analitica/' // GET; POST {nombre?, descripcion?, conf?, desde?}
export const TABLERO_ANALITICA = (num) => `/tableros-analitica/${num}/` // GET, PATCH, DELETE
export const TABLERO_PREDETERMINAR = (num) => `/tableros-analitica/${num}/predeterminar/` // POST
export const TABLERO_RESTAURAR = (num) => `/tableros-analitica/${num}/restaurar/` // POST {numero}
export const TABLERO_VERSIONES = (num) => `/tableros-analitica/${num}/versiones/` // GET
export const ANALITICA_CONSULTA = '/analitica/consulta/' // POST {tarjetas, filtros, cruzado?}
export const ANALITICA_CONSULTA_CSV = '/analitica/consulta/csv/' // POST {tarjeta, filtros, cruzado?}
export const ANALITICA_HALLAZGOS = '/analitica/hallazgos/' // POST {tarjetas, filtros, cruzado?}
