// Mediciones
export const LECTURAS = '/lecturas/' // GET ?dispositivo, sensor, variable, desde, hasta, estabilizada
export const LECTURA = (num) => `/lecturas/${num}/` // GET
export const LECTURAS_SERIE = '/lecturas/serie/' // GET ?dispositivo&variable (obligatorios), intervalo, desde, hasta
