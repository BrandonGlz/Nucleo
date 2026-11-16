// Consola de administración (admin.bynucleo.com): solo el superusuario (ADMINPLAT); 403 a cualquier otro rol.
// GET → {sesiones_activas, sesiones: {web, app}, usuarios, accesos, dispositivos, alertas_seguridad: {nuevas, criticas},
//        serie_accesos (14 días), accesos_por_hora (24 h)}
export const CONSOLA_RESUMEN = '/consola/resumen/'
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
// Carga de firmware por USB (página «Cargar firmware»).
export const CONSOLA_FLASHEO = '/consola/flasheo/' // GET → {version, micropython: [{chip, archivo, direccion, tamano}], archivos, puente_ia}
export const CONSOLA_FLASHEO_MICROPYTHON = (chip) => `/consola/flasheo/micropython/${chip}/` // GET → imagen binaria de MicroPython
export const CONSOLA_FLASHEO_ARCHIVOS = '/consola/flasheo/archivos/' // GET → {version, archivos: [{ruta, contenido (base64)}]}
// POST {dispositivo, redes: [{ssid, password}], puente} → {codigo_mqtt, secrets, aviso} (crea una contraseña MQTT nueva)
export const CONSOLA_FLASHEO_CONFIGURACION = '/consola/flasheo/configuracion/'
// Alertas de seguridad (módulo «Alertas»): GET ?estado=nueva|revisada|descartada&nivel=critico|advertencia&tipo&q&page (paginada)
export const CONSOLA_ALERTAS = '/consola/alertas/'
export const CONSOLA_ALERTAS_RESUMEN = '/consola/alertas/resumen/' // GET → {nuevas, criticas, ultimos_30_dias, por_tipo: [{tipo, total}], sin_2fa}
export const CONSOLA_ALERTA_REVISAR = (num) => `/consola/alertas/${num}/revisar/` // POST {nota?} → alerta
export const CONSOLA_ALERTA_DESCARTAR = (num) => `/consola/alertas/${num}/descartar/` // POST {nota?} → alerta
export const CONSOLA_ALERTAS_REVISAR_TODAS = '/consola/alertas/revisar-todas/' // POST → {revisadas}
// Notificaciones de la consola (campana): GET ?leida&page → paginada + no_leidas; solo los niveles de niveles_consola
export const CONSOLA_NOTIFICACIONES = '/consola/notificaciones/'
export const CONSOLA_NOTIFICACIONES_LEER = '/consola/notificaciones/leer/' // POST {nums?} → {leidas} (sin nums, todas)
export const CONSOLA_NOTIFICACIONES_PREFERENCIAS = '/consola/notificaciones/preferencias/' // GET/PATCH {niveles_consola, niveles_correo}
