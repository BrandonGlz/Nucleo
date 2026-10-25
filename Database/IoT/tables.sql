\set ON_ERROR_STOP on

-- Lecturas de los dispositivos como serie de tiempo en TimescaleDB. Equivale a lo que
-- crea la migración de Django en nucleo_iot. sensor_num y variable_codigo son
-- referencias lógicas a nucleo_db: no hay llaves foráneas entre bases y el backend
-- las valida antes de insertar.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE lectura (
    num BIGINT GENERATED ALWAYS AS IDENTITY,
    fecha_hora TIMESTAMPTZ NOT NULL,                      -- hora de medición (partición)
    sensor_num INTEGER NOT NULL,                          -- ref. lógica a nucleo_db.sensor(num)
    variable_codigo VARCHAR(10) NOT NULL,                 -- ref. lógica a nucleo_db.variable_ambiental(codigo)
    valor NUMERIC(8,2) NOT NULL,
    recibida_en TIMESTAMPTZ NOT NULL DEFAULT now(),       -- llegada al servidor
    estabilizada BOOLEAN NOT NULL DEFAULT TRUE,           -- FALSE durante el calentamiento del CCS811
    PRIMARY KEY (num, fecha_hora),                        -- la llave debe incluir la columna de partición
    CHECK (variable_codigo IN ('TEMP', 'HUM', 'AIRE')),
    CHECK ((variable_codigo = 'TEMP' AND valor BETWEEN -40 AND 80)
        OR (variable_codigo = 'HUM'  AND valor BETWEEN 0 AND 100)
        OR (variable_codigo = 'AIRE' AND valor BETWEEN 0 AND 10000))
);

-- convierte la tabla en hypertable particionada por día
SELECT create_hypertable('lectura', by_range('fecha_hora', INTERVAL '1 day'));

-- histórico, gráficas de tendencia y cifras de reportes
CREATE INDEX idx_lectura_consulta ON lectura (sensor_num, variable_codigo, fecha_hora DESC);
