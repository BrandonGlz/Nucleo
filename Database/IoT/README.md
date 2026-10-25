# Base de datos IoT — TimescaleDB

> **En simple:** aquí están los scripts de la base de series de tiempo donde se guardan
> las lecturas de los sensores. Se practican en una base aparte (`nucleo_iot_test`) sin
> tocar la base real (`nucleo_iot`), que crean las migraciones de Django.

TimescaleDB es PostgreSQL con una extensión para series de tiempo. Guarda una sola
tabla, `lectura`, convertida en *hypertable* que se divide en bloques (*chunks*) de un
día por la columna `fecha_hora`. PostgreSQL (`nucleo_db`) conserva todo lo demás.

## Archivos

```text
Database/IoT/
├── init.sql      Crea la base local nucleo_iot_test
├── tables.sql    Extensión, tabla lectura, hypertable e índice de consulta
├── seed.sql      Lecturas de práctica: dos que disparan las alertas del seed web y móvil, y series de TEMP, HUM y AIRE
├── queries.sql   Promedios por intervalo, última lectura, calentamiento, picos, latencia y chunks
├── drop.sql      Elimina nucleo_iot_test
└── README.md     Este documento
```

## La tabla `lectura`

- **Llave:** `(num, fecha_hora)`. Una hypertable exige incluir la columna de partición en
  la llave; `num` es una identidad `GENERATED ALWAYS`.
- **Columnas:** `sensor_num` y `variable_codigo` identifican de qué sensor y variable es
  el valor; `recibida_en` registra cuándo llegó (con `fecha_hora` permite medir la
  latencia de 2 minutos); `estabilizada` es falso para el aire durante el calentamiento
  del CCS811.
- **Validaciones:** `variable_codigo` solo admite `TEMP`, `HUM` o `AIRE`, y el valor debe
  estar en el rango físico de la variable (TEMP −40 a 80, HUM 0 a 100, AIRE 0 a 10000).
- **Índice:** `(sensor_num, variable_codigo, fecha_hora DESC)` para consultar por sensor,
  variable y fecha.
- **Sin llaves foráneas:** `sensor_num` apunta a `sensor.num` de `nucleo_db`, pero no hay
  llaves entre bases. El backend resuelve esa relación al consultar.
- Las lecturas con `estabilizada = false` no generan alertas ni entran en los reportes.

## Antes de empezar

- `docker compose up -d --wait timescaledb` — "enciende TimescaleDB y espera; termina con el contenedor saludable."
- `docker compose ps` — "muestra el estado; debe decir `running` o `healthy`."

## Ejecutar cada archivo

Todos los comandos se ejecutan desde la carpeta principal del proyecto y en este
orden la primera vez:

- `docker exec -i nucleo_timescaledb psql -U nucleo_iot -d postgres -v ON_ERROR_STOP=1 < Database/IoT/init.sql` — "crea `nucleo_iot_test`; no toca `nucleo_iot`."
- `docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/tables.sql` — "crea la extensión, la tabla y la hypertable."
- `docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/seed.sql` — "carga las lecturas de práctica."
- `docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/queries.sql` — "ejecuta las consultas y muestra sus resultados."
- `docker exec -it nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test` — "abre una consola en `nucleo_iot_test`; se sale con `\q`."
- `docker exec -i nucleo_timescaledb psql -U nucleo_iot -d postgres -v ON_ERROR_STOP=1 < Database/IoT/drop.sql` — "elimina solo `nucleo_iot_test`."

`init.sql` borra y recrea `nucleo_iot_test`, así que basta volver a ejecutar desde el
principio para empezar de cero.

## Para profundizar

- [Modelo relacional](../../Context/base-de-datos/modelo-relacional.md)
- [PostgreSQL con Docker](../../Context/base-de-datos/postgresql-docker.md)
