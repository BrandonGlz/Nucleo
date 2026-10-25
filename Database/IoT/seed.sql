\set ON_ERROR_STOP on

-- Datos de práctica del dispositivo NUC-001 (Database/Web-Mobile/seed.sql): sensor 1 es el
-- DHT22 (TEMP y HUM) y sensor 2 es el CCS811 (AIRE). El dispositivo arrancó a las 06:30
-- y envía una lectura por minuto hasta las 08:30 (hora de Tijuana).
--
-- Las lecturas 1 y 2 son las que disparan las alertas 1 y 2 de nucleo_test; por eso se
-- insertan primero. El resto son series normales.
INSERT INTO lectura (fecha_hora, sensor_num, variable_codigo, valor, recibida_en)
VALUES
    ('2026-10-24 07:40:00-07', 1, 'TEMP', 26.50, '2026-10-24 07:40:01-07'),
    ('2026-10-24 08:29:30-07', 1, 'TEMP', 29.10, '2026-10-24 08:29:31-07');

INSERT INTO lectura (fecha_hora, sensor_num, variable_codigo, valor, recibida_en)
SELECT t, 1, 'TEMP', 20 + (g % 5), t + interval '1 second'
FROM generate_series(0, 120) AS g,
     LATERAL (SELECT TIMESTAMPTZ '2026-10-24 06:30:00-07' + make_interval(mins => g) AS t) AS x;

INSERT INTO lectura (fecha_hora, sensor_num, variable_codigo, valor, recibida_en)
SELECT t, 1, 'HUM', 45 + (g % 11), t + interval '1 second'
FROM generate_series(0, 120) AS g,
     LATERAL (SELECT TIMESTAMPTZ '2026-10-24 06:30:00-07' + make_interval(mins => g) AS t) AS x;

-- Durante los primeros 20 minutos el CCS811 se calienta: sus lecturas no están estabilizadas.
INSERT INTO lectura (fecha_hora, sensor_num, variable_codigo, valor, recibida_en, estabilizada)
SELECT t, 2, 'AIRE', 400 + (g * 5), t + interval '1 second', g >= 20
FROM generate_series(0, 120) AS g,
     LATERAL (SELECT TIMESTAMPTZ '2026-10-24 06:30:00-07' + make_interval(mins => g) AS t) AS x;
