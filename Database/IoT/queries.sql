\set ON_ERROR_STOP on

-- Estas consultas usan solo nucleo_iot_test. El dispositivo, el área y los umbrales viven
-- en PostgreSQL: el backend traduce el dispositivo a sus sensor_num antes de consultar.

-- 3.2.11: histórico de temperatura del sensor 1, promediado cada 10 minutos.
SELECT time_bucket('10 minutes', fecha_hora) AS periodo,
       round(avg(valor), 2) AS promedio,
       min(valor) AS minimo,
       max(valor) AS maximo,
       count(*) AS muestras
FROM lectura
WHERE sensor_num = 1
  AND variable_codigo = 'TEMP'
  AND fecha_hora >= '2026-10-24 07:30:00-07'
  AND fecha_hora <  '2026-10-24 08:30:00-07'
GROUP BY periodo
ORDER BY periodo;

-- Última lectura de cada variable por sensor (panel en tiempo real).
SELECT sensor_num, variable_codigo,
       last(valor, fecha_hora) AS valor,
       max(fecha_hora) AS fecha_hora
FROM lectura
GROUP BY sensor_num, variable_codigo
ORDER BY sensor_num, variable_codigo;

-- 3.2.1: las lecturas de aire del calentamiento no entran en los reportes.
SELECT variable_codigo,
       round(avg(valor), 2) AS promedio,
       max(valor) AS maximo,
       min(valor) AS minimo,
       count(*) AS muestras
FROM lectura
WHERE fecha_hora >= '2026-10-24 06:30:00-07'
  AND fecha_hora <  '2026-10-24 08:30:00-07'
  AND estabilizada
GROUP BY variable_codigo
ORDER BY variable_codigo;

-- Lecturas guardadas durante el calentamiento del CCS811.
SELECT sensor_num, count(*) AS lecturas,
       min(fecha_hora) AS desde, max(fecha_hora) AS hasta
FROM lectura
WHERE NOT estabilizada
GROUP BY sensor_num;

-- Picos de humedad por hora (por ejemplo, de la última semana) para ver en qué horarios ocurren.
SELECT time_bucket('1 hour', fecha_hora) AS hora,
       max(valor) AS pico,
       round(avg(valor), 2) AS promedio
FROM lectura
WHERE variable_codigo = 'HUM'
GROUP BY hora
ORDER BY pico DESC, hora;

-- 3.3.1: latencia entre que el dispositivo midió y la lectura llegó al servidor.
SELECT sensor_num,
       round(avg(extract(epoch FROM recibida_en - fecha_hora))::numeric, 2) AS promedio_seg,
       round(max(extract(epoch FROM recibida_en - fecha_hora))::numeric, 2) AS maximo_seg
FROM lectura
GROUP BY sensor_num
ORDER BY sensor_num;

-- Volumen diario por sensor (con intervalo de 30 s y tres variables son 8 640 por dispositivo).
SELECT time_bucket('1 day', fecha_hora) AS dia, sensor_num, count(*) AS lecturas
FROM lectura
GROUP BY dia, sensor_num
ORDER BY dia, sensor_num;

-- La tabla es una hypertable particionada por día.
SELECT hypertable_name, num_dimensions, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'lectura';

SELECT chunk_name, range_start, range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = 'lectura'
ORDER BY range_start;
