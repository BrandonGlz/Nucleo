\set ON_ERROR_STOP on

-- Códigos iniciales de los catálogos.
INSERT INTO rol (codigo, nombre, descripcion) VALUES
    ('ADMINPLAT', 'Administrador de plataforma', 'Equipo Núcleo: alta, baja y suspensión de organizaciones'),
    ('ADMIN', 'Administrador', 'Áreas, dispositivos, usuarios, permisos y umbrales de su organización'),
    ('SUPER', 'Supervisor', 'Operadores de su área, umbrales, intervalo de muestreo y alertas'),
    ('ANALISTA', 'Analista', 'Histórico de mediciones y reportes con IA'),
    ('OPER', 'Operador', 'Monitoreo en tiempo real de su dispositivo asignado');

INSERT INTO estado_usuario (codigo, nombre) VALUES
    ('ACT', 'Activo'), ('INA', 'Inactivo'), ('BLQ', 'Bloqueado');

INSERT INTO estado_dispositivo (codigo, nombre, descripcion) VALUES
    ('LINEA', 'En línea', 'Envía lecturas con normalidad'),
    ('CALENT', 'Calentando', 'Primeros 20 minutos del CCS811 tras el arranque'),
    ('SINCONEX', 'Sin conexión', 'Más de 3 intervalos de muestreo sin lecturas'),
    ('BATBAJA', 'Batería baja', 'Nivel de batería bajo'),
    ('MANT', 'Mantenimiento', 'Fuera de servicio por mantenimiento'),
    ('BAJA', 'Dado de baja', 'Ya no se utiliza');

INSERT INTO estado_sensor (codigo, nombre) VALUES
    ('OPERA', 'Operando'), ('CALIB', 'Requiere calibración'), ('FALLA', 'Falla');

INSERT INTO variable_ambiental (codigo, nombre, unidad, rango_min, rango_max) VALUES
    ('TEMP', 'Temperatura', '°C', -40, 80),
    ('HUM', 'Humedad relativa', '%HR', 0, 100),
    ('AIRE', 'Calidad del aire (eCO2)', 'ppm', 0, 10000);

-- Datos de práctica: una organización con un dispositivo, dos alertas y un reporte.
-- La contraseña '!' es inutilizable: estos usuarios no inician sesión.
-- Las lecturas 1 y 2 de las alertas están en Database/IoT/seed.sql.
INSERT INTO organizacion (nombre, ciudad) VALUES ('Universidad Tecnológica de Tijuana', 'Tijuana');

INSERT INTO area (organizacion_num, nombre, descripcion)
VALUES (1, 'Laboratorio', 'Prueba piloto');

INSERT INTO usuario (organizacion_num, area_num, rol_codigo, estado_usuario_codigo,
                     nombre, primer_apellido, correo, telefono, password)
VALUES
    (NULL, NULL, 'ADMINPLAT', 'ACT', 'Pablo', 'Plataforma', 'plataforma@nucleo.local', NULL, '!'),
    (1, NULL, 'ADMIN', 'ACT', 'Ada', 'Administradora', 'admin@nucleo.local', '6641000001', '!'),
    (1, 1, 'SUPER', 'ACT', 'Sergio', 'Supervisor', 'supervisor@nucleo.local', '6641000002', '!'),
    (1, 1, 'ANALISTA', 'ACT', 'Ana', 'Analista', 'analista@nucleo.local', NULL, '!'),
    (1, 1, 'OPER', 'ACT', 'Omar', 'Operador', 'operador@nucleo.local', '6641000003', '!');

INSERT INTO telefono_push (usuario_num, token_expo, plataforma) VALUES
    (3, 'ExponentPushToken[practica-supervisor]', 'ANDROID'),
    (5, 'ExponentPushToken[practica-operador]', 'IOS');

INSERT INTO dispositivo (area_num, estado_dispositivo_codigo, operador_num, registrado_por,
                         nombre, codigo_mqtt, nivel_bateria, ultima_conexion, ultimo_arranque)
VALUES (1, 'LINEA', 5, 2, 'Nodo de laboratorio', 'NUC-001', 87,
        '2026-10-24 08:30:00-07', '2026-10-24 06:30:00-07');

INSERT INTO sensor (dispositivo_num, estado_sensor_codigo, modelo, funcion,
                    fecha_acondicionamiento, fecha_calibracion)
VALUES
    (1, 'OPERA', 'DHT22', 'Temperatura y humedad relativa', NULL, '2026-10-01'),
    (1, 'OPERA', 'CCS811', 'Calidad del aire (eCO2)', '2026-10-03', '2026-10-05');

INSERT INTO umbral (dispositivo_num, variable_codigo, configurado_por,
                    peligro_min, advertencia_min, advertencia_max, peligro_max)
VALUES
    (1, 'TEMP', 2, 15, 18, 25, 28),
    (1, 'HUM', 2, 20, 30, 60, 70),
    (1, 'AIRE', 2, 0, 0, 1000, 2000);

INSERT INTO alerta (umbral_num, atendida_por, lectura_num, lectura_fecha_hora, lectura_valor,
                    nivel, tipo, estado, fecha_hora, fecha_atencion, observaciones)
VALUES
    (1, 3, 1, '2026-10-24 07:40:00-07', 26.50, 'ADVERTENCIA', 'POR_ENCIMA', 'ATENDIDA',
     '2026-10-24 07:40:02-07', '2026-10-24 07:43:00-07', 'Se abrió la ventana del laboratorio'),
    (1, NULL, 2, '2026-10-24 08:29:30-07', 29.10, 'PELIGRO', 'POR_ENCIMA', 'PENDIENTE',
     '2026-10-24 08:29:32-07', NULL, NULL);

INSERT INTO notificacion (alerta_num, usuario_num, telefono_push_num, canal, estado_envio, fecha_envio)
VALUES
    (1, 3, NULL, 'CORREO', 'ENVIADA', '2026-10-24 07:40:03-07'),
    (2, 3, NULL, 'CORREO', 'ENVIADA', '2026-10-24 08:29:33-07'),
    (2, 3, 1, 'PUSH', 'ENVIADA', '2026-10-24 08:29:34-07'),
    (2, 5, 2, 'PUSH', 'FALLIDA', '2026-10-24 08:29:34-07');

INSERT INTO programacion_reporte (organizacion_num, area_num, creada_por, frecuencia,
                                  destinatarios, proxima_ejecucion)
VALUES (1, NULL, 4, 'SEMANAL', ARRAY[3, 4], '2026-10-31 08:00:00-07');

INSERT INTO reporte (organizacion_num, area_num, generado_por, origen, periodo_inicio,
                     periodo_fin, cifras, contenido, fecha_generacion)
VALUES (1, 1, 4, 'MANUAL', '2026-10-24 06:30:00-07', '2026-10-24 08:30:00-07',
        '{"variables": {"TEMP": {"promedio": 22.0, "minimo": 20.0, "maximo": 29.1}}}',
        'Texto de práctica: la temperatura se mantuvo cerca de 22 °C con un pico de 29.1 °C.',
        '2026-10-24 08:35:00-07');
