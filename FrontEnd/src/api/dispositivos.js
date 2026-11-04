// Dispositivos y sensores
export const DISPOSITIVOS = '/dispositivos/' // GET; POST: ADMIN
export const DISPOSITIVO = (num) => `/dispositivos/${num}/` // GET; PATCH del intervalo: ADMIN y SUPER; DELETE: ADMIN
export const DISPOSITIVO_ULTIMAS_LECTURAS = (num) => `/dispositivos/${num}/ultimas-lecturas/` // GET
export const SENSORES = '/sensores/' // GET ?dispositivo=; POST: ADMIN y SUPER
export const SENSOR = (num) => `/sensores/${num}/` // GET, PATCH, DELETE: ADMIN y SUPER
