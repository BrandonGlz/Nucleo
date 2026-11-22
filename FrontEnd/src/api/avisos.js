// Avisos del sistema para la campana (además de las alertas de medición): dispositivos que se
// desconectan o vuelven, usuarios dados de alta o con otro rol, reportes listos y Nico AI.
// Cada aviso: {num, tipo, nivel: INFO|ADVERTENCIA|PELIGRO, titulo, detalle, ruta, fecha_hora, leido}.
// En vivo llegan por /ws/panel/ como {tipo: 'aviso.nuevo', aviso}.
export const AVISOS = '/avisos/' // GET paginado ?tipo=DISPOSITIVO|USUARIO|REPORTE|NICO, ?no_leidos=1
export const AVISOS_CONTEO = '/avisos/conteo/' // GET → {no_leidos}
export const AVISOS_MARCAR_LEIDOS = '/avisos/marcar-leidos/' // POST {nums: [...]} (vacío o sin nums = todos) → {marcados}
