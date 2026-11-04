// Alertas y notificaciones
export const ALERTAS = '/alertas/' // GET ?estado, nivel, dispositivo, variable, desde, hasta
export const ALERTA = (num) => `/alertas/${num}/` // GET
export const ALERTA_ATENDER = (num) => `/alertas/${num}/atender/` // POST {observaciones}: ADMIN y SUPER
export const ALERTA_DESCARTAR = (num) => `/alertas/${num}/descartar/` // POST {observaciones}: ADMIN y SUPER
export const NOTIFICACIONES = '/notificaciones/' // GET: las del propio usuario
