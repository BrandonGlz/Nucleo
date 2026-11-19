// Acceso: inicio y cierre de sesión
export const AUTH_LOGIN = '/auth/login/' // POST {correo, password, codigo?, token_expo?, plataforma?} → {token, usuario, configurar_segundo_factor}; 401 {requiere_codigo} si falta el código de 2 pasos
export const AUTH_LOGOUT = '/auth/logout/' // POST {token_expo?}
export const AUTH_YO = '/auth/yo/' // GET: usuario autenticado
export const AUTH_SESIONES = '/auth/sesiones/' // GET: sesiones abiertas de la propia cuenta (`actual` = esta)
export const AUTH_SESION = (num) => `/auth/sesiones/${num}/` // DELETE: cierra otra de sus sesiones
export const AUTH_CAMBIAR_PASSWORD = '/auth/cambiar-password/' // POST {password_actual, password_nueva}
// Recuperar contraseña (sin sesión): manda un enlace de un solo uso al correo
export const AUTH_RECUPERAR = '/auth/recuperar/' // POST {correo} → 204 siempre
export const AUTH_RESTABLECER = '/auth/restablecer/' // POST {uid, token, password_nueva} → 204
// Verificación en dos pasos (TOTP). Con NUCLEO_2FA_OBLIGATORIO, los roles indicados reciben 403
// {segundo_factor_pendiente} fuera de /auth/ hasta configurarla.
export const AUTH_2FA = '/auth/2fa/' // GET → {activo, obligatorio, codigos_restantes, fecha_activacion}
export const AUTH_2FA_CONFIGURAR = '/auth/2fa/configurar/' // POST → {secreto, uri, qr_svg}
export const AUTH_2FA_ACTIVAR = '/auth/2fa/activar/' // POST {codigo} → {codigos_recuperacion}
export const AUTH_2FA_DESACTIVAR = '/auth/2fa/desactivar/' // POST {password, codigo} (no en roles obligatorios)
export const AUTH_2FA_CODIGOS = '/auth/2fa/codigos/' // POST {codigo} → {codigos_recuperacion} nuevos
// Solicitud de acceso (sin sesión): GET → [{num, nombre, areas: [{num, nombre}]}] de las organizaciones activas;
// POST {organizacion, area, nombre, primer_apellido, segundo_apellido?, correo} → 204 (avisa a los administradores)
export const AUTH_SOLICITAR_ACCESO = '/auth/solicitar-acceso/'
// Revisión de una solicitud (ADMIN de la organización o ADMINPLAT)
export const SOLICITUD_ACCESO = (num) => `/solicitudes-acceso/${num}/` // GET → datos, áreas y roles asignables
export const SOLICITUD_APROBAR = (num) => `/solicitudes-acceso/${num}/aprobar/` // POST {area, rol, nombre, primer_apellido, segundo_apellido?} → crea la cuenta y manda la bienvenida
export const SOLICITUD_RECHAZAR = (num) => `/solicitudes-acceso/${num}/rechazar/` // POST → avisa a la persona
