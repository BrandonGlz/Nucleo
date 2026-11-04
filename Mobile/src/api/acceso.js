// Acceso: inicio y cierre de sesión
export const AUTH_LOGIN = '/auth/login/' // POST {correo, password, token_expo?, plataforma?} → {token, usuario}
export const AUTH_LOGOUT = '/auth/logout/' // POST {token_expo?}
export const AUTH_YO = '/auth/yo/' // GET: usuario autenticado
export const AUTH_CAMBIAR_PASSWORD = '/auth/cambiar-password/' // POST {password_actual, password_nueva}
