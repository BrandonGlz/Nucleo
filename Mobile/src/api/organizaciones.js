// Organizaciones y áreas
export const ORGANIZACIONES = '/organizaciones/' // GET; POST solo ADMINPLAT
export const ORGANIZACION = (num) => `/organizaciones/${num}/` // GET, PATCH
export const ORGANIZACION_PRIMER_ADMINISTRADOR = (num) =>
  `/organizaciones/${num}/primer-administrador/` // POST, solo ADMINPLAT
export const AREAS = '/areas/' // GET; POST: ADMIN
export const AREA = (num) => `/areas/${num}/` // GET, PATCH, DELETE: ADMIN
