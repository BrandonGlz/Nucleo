\set ON_ERROR_STOP on

-- Estas consultas usan solo nucleo_test. Las lecturas viven en TimescaleDB
-- (Database/IoT/queries.sql); la alerta copia la lectura que la disparó.

-- Alertas pendientes con su valor, su nivel, sus límites y a quién se avisó.
SELECT a.num, d.nombre AS dispositivo, u.variable_codigo, a.lectura_valor, a.nivel, a.tipo,
       u.advertencia_min, u.advertencia_max, u.peligro_min, u.peligro_max,
       a.fecha_hora, count(n.num) AS avisos
FROM alerta a
JOIN umbral u ON u.num = a.umbral_num
JOIN dispositivo d ON d.num = u.dispositivo_num
LEFT JOIN notificacion n ON n.alerta_num = a.num
WHERE a.estado = 'PENDIENTE'
GROUP BY a.num, d.nombre, u.variable_codigo, u.advertencia_min, u.advertencia_max,
         u.peligro_min, u.peligro_max
ORDER BY a.fecha_hora DESC;

-- 3.3.1: tiempo entre la medición y cada aviso; debe ser de 2 minutos como máximo.
SELECT a.num AS alerta, n.canal,
       a.lectura_fecha_hora AS medida,
       n.fecha_envio AS avisada,
       n.fecha_envio - a.lectura_fecha_hora AS demora,
       (n.fecha_envio - a.lectura_fecha_hora) <= interval '2 minutes' AS cumple
FROM alerta a
JOIN notificacion n ON n.alerta_num = a.num
ORDER BY a.num, n.fecha_envio;

-- Tiempo de respuesta de las alertas ya atendidas o descartadas.
SELECT a.estado, count(*) AS total,
       avg(a.fecha_atencion - a.fecha_hora) AS respuesta_promedio
FROM alerta a
WHERE a.fecha_atencion IS NOT NULL
GROUP BY a.estado;

-- Destinatarios del correo de una alerta: supervisores del área o, si no hay, administradores.
SELECT u.num, u.correo, u.rol_codigo
FROM usuario u
WHERE u.organizacion_num = 1
  AND u.estado_usuario_codigo = 'ACT'
  AND u.rol_codigo = 'SUPER'
  AND u.area_num = 1
UNION ALL
SELECT u.num, u.correo, u.rol_codigo
FROM usuario u
WHERE u.organizacion_num = 1
  AND u.estado_usuario_codigo = 'ACT'
  AND u.rol_codigo = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM usuario s
                  WHERE s.organizacion_num = 1 AND s.area_num = 1
                    AND s.rol_codigo = 'SUPER' AND s.estado_usuario_codigo = 'ACT');

-- Teléfonos que reciben el push de un dispositivo: supervisores del área y operador asignado.
SELECT t.num, t.usuario_num, t.plataforma
FROM telefono_push t
JOIN usuario u ON u.num = t.usuario_num
JOIN dispositivo d ON d.num = 1
WHERE u.num = d.operador_num
   OR (u.rol_codigo = 'SUPER' AND u.area_num = d.area_num);

-- Dispositivos sin conexión: llevan más de tres intervalos de muestreo sin enviar datos.
SELECT d.num, d.nombre, d.ultima_conexion, d.intervalo_muestreo_seg
FROM dispositivo d
WHERE d.estado_dispositivo_codigo NOT IN ('MANT', 'BAJA')
  AND d.ultima_conexion < now() - 3 * d.intervalo_muestreo_seg * interval '1 second';

-- Dispositivos en calentamiento: el CCS811 tarda 20 minutos en estabilizarse tras el arranque.
SELECT d.num, d.nombre, d.ultimo_arranque,
       d.ultimo_arranque + interval '20 minutes' AS estabiliza_a_las
FROM dispositivo d
WHERE d.estado_dispositivo_codigo = 'CALENT';

-- Sensores que requieren calibración o están en falla, con su última calibración.
SELECT s.num, d.nombre AS dispositivo, s.modelo, s.estado_sensor_codigo, s.fecha_calibracion
FROM sensor s
JOIN dispositivo d ON d.num = s.dispositivo_num
WHERE s.estado_sensor_codigo <> 'OPERA'
ORDER BY d.nombre, s.modelo;

-- Programaciones de reporte que el cron debe ejecutar.
SELECT p.num, p.frecuencia, p.area_num, p.destinatarios, p.proxima_ejecucion
FROM programacion_reporte p
WHERE p.activa AND p.proxima_ejecucion <= '2026-11-01 00:00:00-07'
ORDER BY p.proxima_ejecucion;

-- Reportes de una organización con la cifra máxima de temperatura que guardaron.
SELECT r.num, r.origen, r.periodo_inicio, r.periodo_fin,
       r.cifras -> 'variables' -> 'TEMP' ->> 'maximo' AS temperatura_maxima
FROM reporte r
WHERE r.organizacion_num = 1
ORDER BY r.fecha_generacion DESC;
