// Mediciones
export const LECTURAS = '/lecturas/' // GET ?dispositivo, sensor, variable, desde, hasta, estabilizada
export const LECTURA = (num) => `/lecturas/${num}/` // GET
export const LECTURAS_SERIE = '/lecturas/serie/' // GET ?dispositivo&variable (obligatorios), intervalo, desde, hasta
export const LECTURAS_EXPORTAR = '/lecturas/exportar/' // GET CSV, mismos filtros que LECTURAS (sin fechas: últimos 7 días)
