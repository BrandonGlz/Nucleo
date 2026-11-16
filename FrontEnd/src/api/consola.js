// Consola de administración (admin.bynucleo.com): solo el superusuario (ADMINPLAT); 403 a cualquier otro rol.
export const CONSOLA_RESUMEN = '/consola/resumen/' // GET → {sesiones_activas, usuarios, accesos, dispositivos, alertas, serie_accesos (14 días)}
export const CONSOLA_ORGANIZACIONES = '/consola/organizaciones/' // GET → [{num, nombre, areas: [{num, nombre}]}] (para los filtros)
// GET ?organizacion&rol&estado&q&page (paginada); POST {organizacion, area|null, rol, nombre, primer_apellido, segundo_apellido?, correo, password}
export const CONSOLA_USUARIOS = '/consola/usuarios/'
export const CONSOLA_USUARIO = (num) => `/consola/usuarios/${num}/` // PATCH {rol, area, estado_usuario (ACT desbloquea, INA da de baja), nombre, …}
export const CONSOLA_USUARIO_RESTABLECER = (num) => `/consola/usuarios/${num}/restablecer/` // POST → {detail} (le manda el enlace por correo)
export const CONSOLA_USUARIO_QUITAR_2FA = (num) => `/consola/usuarios/${num}/quitar-2fa/` // POST → {detail}
export const CONSOLA_USUARIO_CERRAR_SESIONES = (num) => `/consola/usuarios/${num}/cerrar-sesiones/` // POST → {cerradas}
export const CONSOLA_SESIONES = '/consola/sesiones/' // GET ?organizacion&usuario&cliente=web|app&q (paginada); `actual` = la de esta consola
export const CONSOLA_SESION = (id) => `/consola/sesiones/${id}/` // DELETE → 204 (cierra esa sesión)
export const CONSOLA_DISPOSITIVOS = '/consola/dispositivos/' // GET ?organizacion&estado&q (paginada) → equipos ESP32 de todas las organizaciones
export const CONSOLA_DISPOSITIVO = (num) => `/consola/dispositivos/${num}/` // PATCH {estado: MANT|BAJA|ACTIVO, recibe_ota}
export const CONSOLA_FIRMWARE = '/consola/firmware/' // GET → {version, publicada, ota_todos, dispositivos_ota}
// GET/PATCH {dias_sesion, intentos_login_por_minuto, roles_2fa_obligatorio, dias_auditoria, ota_todos} (+ actualizado, actualizado_por)
export const CONSOLA_POLITICAS = '/consola/politicas/'
