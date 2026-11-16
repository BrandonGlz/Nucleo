// Bitácora de auditoría e integraciones (solo ADMIN; la bitácora también ADMINPLAT)
export const AUDITORIA = '/auditoria/' // GET ?accion, recurso, usuario, desde, hasta (paginada)
export const TOKENS_API = '/integraciones/tokens/' // GET; POST {nombre, fecha_expiracion?} → {..., clave} (solo esa vez)
export const TOKEN_API = (num) => `/integraciones/tokens/${num}/` // DELETE = revocar
export const WEBHOOKS = '/integraciones/webhooks/' // GET; POST {nombre, url, eventos} → {..., secreto} (solo esa vez)
export const WEBHOOK = (num) => `/integraciones/webhooks/${num}/` // PATCH {activo, eventos, ...}; DELETE
export const WEBHOOK_PROBAR = (num) => `/integraciones/webhooks/${num}/probar/` // POST → {exito, estado}
