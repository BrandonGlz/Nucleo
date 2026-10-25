\set ON_ERROR_STOP on

-- Modelo relacional de Núcleo para web y móvil: 16 tablas de negocio. Equivale a lo
-- que crean las migraciones de Django en nucleo_db. Las lecturas no están aquí:
-- viven en TimescaleDB (Database/IoT) y no hay llaves foráneas entre las dos bases.

-- ---------- Catálogos ----------
CREATE TABLE rol (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150)
);

CREATE TABLE estado_usuario (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150)
);

CREATE TABLE estado_dispositivo (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150)
);

CREATE TABLE estado_sensor (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(150)
);

CREATE TABLE variable_ambiental (
    codigo VARCHAR(10) PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    unidad VARCHAR(15) NOT NULL,
    rango_min NUMERIC(8,2) NOT NULL,
    rango_max NUMERIC(8,2) NOT NULL,
    CHECK (rango_min < rango_max)
);

-- ---------- Organización y dispositivos ----------
CREATE TABLE organizacion (
    num SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    dir_calle VARCHAR(100),
    dir_numero VARCHAR(10),
    dir_colonia VARCHAR(80),
    ciudad VARCHAR(60),
    telefono VARCHAR(15),
    estado VARCHAR(12) NOT NULL DEFAULT 'ACTIVA',
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (estado IN ('ACTIVA', 'SUSPENDIDA', 'BAJA'))
);

CREATE TABLE area (
    num SERIAL PRIMARY KEY,
    organizacion_num INTEGER NOT NULL REFERENCES organizacion(num),
    nombre VARCHAR(80) NOT NULL,
    descripcion VARCHAR(200),
    UNIQUE (organizacion_num, nombre)
);

CREATE TABLE usuario (
    num SERIAL PRIMARY KEY,
    organizacion_num INTEGER REFERENCES organizacion(num),
    area_num INTEGER REFERENCES area(num),
    rol_codigo VARCHAR(10) NOT NULL REFERENCES rol(codigo),
    estado_usuario_codigo VARCHAR(10) NOT NULL REFERENCES estado_usuario(codigo),
    nombre VARCHAR(60) NOT NULL,
    primer_apellido VARCHAR(60) NOT NULL,
    segundo_apellido VARCHAR(60),
    correo VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(15),
    password VARCHAR(128) NOT NULL,
    ultimo_acceso TIMESTAMPTZ,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- solo el administrador de plataforma no pertenece a una organización
    CHECK ((rol_codigo = 'ADMINPLAT') = (organizacion_num IS NULL))
);

CREATE TABLE telefono_push (
    num SERIAL PRIMARY KEY,
    usuario_num INTEGER NOT NULL REFERENCES usuario(num) ON DELETE CASCADE,
    token_expo VARCHAR(255) NOT NULL UNIQUE,
    plataforma VARCHAR(10) NOT NULL,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (plataforma IN ('ANDROID', 'IOS'))
);

CREATE TABLE dispositivo (
    num SERIAL PRIMARY KEY,
    area_num INTEGER NOT NULL REFERENCES area(num),
    estado_dispositivo_codigo VARCHAR(10) NOT NULL REFERENCES estado_dispositivo(codigo),
    operador_num INTEGER REFERENCES usuario(num),
    registrado_por INTEGER NOT NULL REFERENCES usuario(num),
    nombre VARCHAR(60) NOT NULL,
    codigo_mqtt VARCHAR(40) NOT NULL UNIQUE,
    intervalo_muestreo_seg SMALLINT NOT NULL DEFAULT 30,
    nivel_bateria SMALLINT,
    ultima_conexion TIMESTAMPTZ,
    ultimo_arranque TIMESTAMPTZ,
    fecha_alta TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (intervalo_muestreo_seg BETWEEN 5 AND 120),
    CHECK (nivel_bateria BETWEEN 0 AND 100)
);

CREATE TABLE sensor (
    num SERIAL PRIMARY KEY,
    dispositivo_num INTEGER NOT NULL REFERENCES dispositivo(num),
    estado_sensor_codigo VARCHAR(10) NOT NULL REFERENCES estado_sensor(codigo),
    modelo VARCHAR(30) NOT NULL,
    funcion VARCHAR(100),
    fecha_acondicionamiento DATE,
    fecha_calibracion DATE,
    UNIQUE (dispositivo_num, modelo)
);

-- ---------- Operación ----------
CREATE TABLE umbral (
    num SERIAL PRIMARY KEY,
    dispositivo_num INTEGER NOT NULL REFERENCES dispositivo(num),
    variable_codigo VARCHAR(10) NOT NULL REFERENCES variable_ambiental(codigo),
    configurado_por INTEGER NOT NULL REFERENCES usuario(num),
    peligro_min NUMERIC(8,2) NOT NULL,
    advertencia_min NUMERIC(8,2) NOT NULL,
    advertencia_max NUMERIC(8,2) NOT NULL,
    peligro_max NUMERIC(8,2) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dispositivo_num, variable_codigo),
    CHECK (peligro_min <= advertencia_min
           AND advertencia_min < advertencia_max
           AND advertencia_max <= peligro_max)
);

-- lectura_num, lectura_fecha_hora y lectura_valor copian la lectura de nucleo_iot que
-- disparó la alerta: la alerta se consulta completa sin depender de la otra base.
CREATE TABLE alerta (
    num BIGSERIAL PRIMARY KEY,
    umbral_num INTEGER NOT NULL REFERENCES umbral(num),
    atendida_por INTEGER REFERENCES usuario(num),
    lectura_num BIGINT NOT NULL,
    lectura_fecha_hora TIMESTAMPTZ NOT NULL,
    lectura_valor NUMERIC(8,2) NOT NULL,
    nivel VARCHAR(12) NOT NULL,
    tipo VARCHAR(12) NOT NULL,
    estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_atencion TIMESTAMPTZ,
    observaciones TEXT,
    CHECK (nivel IN ('ADVERTENCIA', 'PELIGRO')),
    CHECK (tipo IN ('POR_ENCIMA', 'POR_DEBAJO')),
    CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'DESCARTADA'))
);

-- no se repite una alerta pendiente del mismo umbral y nivel
CREATE UNIQUE INDEX uq_alerta_pendiente ON alerta (umbral_num, nivel) WHERE estado = 'PENDIENTE';

CREATE INDEX idx_alerta_estado ON alerta (estado, fecha_hora DESC);

CREATE TABLE notificacion (
    num BIGSERIAL PRIMARY KEY,
    alerta_num BIGINT NOT NULL REFERENCES alerta(num),
    usuario_num INTEGER NOT NULL REFERENCES usuario(num),
    telefono_push_num INTEGER REFERENCES telefono_push(num) ON DELETE SET NULL,
    canal VARCHAR(10) NOT NULL,
    estado_envio VARCHAR(10) NOT NULL,
    fecha_envio TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (canal IN ('CORREO', 'PUSH')),
    CHECK (estado_envio IN ('ENVIADA', 'FALLIDA')),
    CHECK (canal = 'PUSH' OR telefono_push_num IS NULL)
);

CREATE TABLE programacion_reporte (
    num SERIAL PRIMARY KEY,
    organizacion_num INTEGER NOT NULL REFERENCES organizacion(num),
    area_num INTEGER REFERENCES area(num),
    creada_por INTEGER NOT NULL REFERENCES usuario(num),
    frecuencia VARCHAR(10) NOT NULL,
    destinatarios INTEGER[] NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    proxima_ejecucion TIMESTAMPTZ NOT NULL,
    ultima_ejecucion TIMESTAMPTZ,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (frecuencia IN ('DIARIA', 'SEMANAL', 'MENSUAL')),
    CHECK (cardinality(destinatarios) > 0)
);

CREATE TABLE reporte (
    num SERIAL PRIMARY KEY,
    organizacion_num INTEGER NOT NULL REFERENCES organizacion(num),
    area_num INTEGER REFERENCES area(num),
    generado_por INTEGER REFERENCES usuario(num),
    origen VARCHAR(12) NOT NULL,
    periodo_inicio TIMESTAMPTZ NOT NULL,
    periodo_fin TIMESTAMPTZ NOT NULL,
    cifras JSONB NOT NULL,
    contenido TEXT NOT NULL,
    archivo_pdf VARCHAR(255),
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (origen IN ('MANUAL', 'PROGRAMADO', 'AGENTE')),
    CHECK (periodo_inicio < periodo_fin)
);

CREATE INDEX idx_dispositivo_area ON dispositivo (area_num);
CREATE INDEX idx_usuario_organizacion ON usuario (organizacion_num, area_num);
CREATE INDEX idx_programacion_activa ON programacion_reporte (activa, proxima_ejecucion);
