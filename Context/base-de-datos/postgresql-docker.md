# PostgreSQL y TimescaleDB con Docker

## Decisión

Núcleo usa cuatro servicios definidos en `docker-compose.yml`; dos son bases de datos:

```text
docker-compose.yml
├── postgres       postgres:17-alpine                   Base transaccional de Django
├── timescaledb    timescale/timescaledb:2.31.0-pg17    Telemetría de IoT
├── redis          redis:7-alpine                       Canal en vivo (sin persistencia)
└── mosquitto      eclipse-mosquitto:2                  Broker MQTT (ver Context/mqtt)
```

Las bases y el broker tienen su propio volumen: `nucleo_postgres_data`,
`nucleo_timescale_data` y `nucleo_mosquitto_data`; Redis no guarda datos en disco. No hay carpetas ni scripts de inicialización: las
imágenes crean la base y el usuario a partir de `.env` cuando el volumen está
vacío.

En el equipo existe un PostgreSQL 18 nativo preexistente, gestionado por
`postgresql-18.service`, que ocupa el puerto 5432. No forma parte de Núcleo, no
se utilizó y no se detuvo ni modificó. Por eso el proyecto usa los puertos 55432
y 55433, publicados solo en loopback.

## Servicios

- **PostgreSQL:** contenedor `nucleo_postgres`, base `nucleo_db`, usuario
  `nucleo_app`, puerto local `127.0.0.1:55432`.
- **TimescaleDB:** contenedor `nucleo_timescaledb`, base `nucleo_iot`, usuario
  `nucleo_iot`, puerto local `127.0.0.1:55433`.

- **Redis:** contenedor `nucleo_redis`, puerto local `127.0.0.1:56379` (`REDIS_PORT`),
  contraseña `REDIS_PASSWORD`; el backend la usa en `REDIS_URL`.

Las contraseñas son `POSTGRES_PASSWORD` e `IOT_PASSWORD` en `.env`. Las imágenes
crean usuarios con privilegios de superusuario dentro del contenedor; son
credenciales de desarrollo y no deben reutilizarse en producción.

## Usuarios sin superusuario para producción

`Database/crear-roles.sh` crea los roles con los que debe conectarse el backend fuera de
desarrollo: `nucleo_backend` (en `nucleo_db`) y `nucleo_backend_iot` (en `nucleo_iot`), ambos
`NOSUPERUSER NOCREATEDB NOCREATEROLE`, dueños solo de su base, con `CONNECT` revocado a
`PUBLIC` para que ninguno entre en la base del otro. La extensión `timescaledb` la crea el
script con el administrador del contenedor, de modo que `migrate --database=iot` funciona
sin privilegios especiales. Es idempotente. Lee del `.env` raíz `BACKEND_DB_PASSWORD` y
`BACKEND_IOT_DB_PASSWORD` (y, opcionales, `ROL_APP`, `ROL_IOT`, `DB_APP`, `DB_IOT`).

```bash
bash Database/crear-roles.sh
```

Después se actualizan `DATABASE_URL` e `IOT_DATABASE_URL` de `BackEnd/.env` con esos usuarios
y se vuelve a ejecutar `migrate` en ambas bases. Las pruebas de Django necesitan `CREATEDB`
(crean `test_nucleo_db` y `test_nucleo_iot`), así que en desarrollo se siguen ejecutando con
el superusuario del contenedor. El script se comprobó con bases desechables; no se ha
aplicado a `nucleo_db` ni `nucleo_iot` de desarrollo.

La imagen de TimescaleDB crea la extensión `timescaledb` automáticamente en
`nucleo_iot`. Las tablas de telemetría y sus hypertables se definirán cuando se
implemente la ingesta.

## Comandos de operación

```bash
docker compose up -d --wait
docker compose ps
docker compose logs -f --tail=100 postgres timescaledb
docker compose down
```

`down` sin `-v` conserva los volúmenes y los datos. No se debe usar `down -v` sin
autorización y respaldo.

## Cambios de esquema

Backend, con migraciones de Django (crean las 16 tablas de `nucleo_db` y la
hypertable `lectura` de `nucleo_iot`, descritas en
`Context/base-de-datos/modelo-relacional.md`):

```bash
cd BackEnd
.venv/bin/python manage.py makemigrations
.venv/bin/python manage.py migrate
.venv/bin/python manage.py migrate --database=iot
```

Recrear `nucleo_db` desde cero (solo en desarrollo, borra todos sus datos):

```bash
docker exec nucleo_postgres psql -U nucleo_app -d nucleo_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cd BackEnd && .venv/bin/python manage.py migrate
```

Para `nucleo_iot` el borrado equivalente es
`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` y luego
`manage.py migrate --database=iot`, que vuelve a crear la extensión y la hypertable.

Cambiar una contraseña en `.env` no modifica
un usuario que ya existe en el volumen; para rotarla hay que usar `ALTER ROLE` y
actualizar el archivo que la consume.

## Bases locales de pruebas

`Database/` contiene scripts manuales, uno por base. No forman parte de la
inicialización de Docker y no los usa el backend.

- `Database/Web-Mobile/` practica en `nucleo_test` (servicio PostgreSQL): `init.sql` y
  `drop.sql` crean y eliminan la base, `tables.sql` crea las 16 tablas, `seed.sql`
  carga los catálogos y datos de práctica y `queries.sql` reúne consultas de alertas,
  del límite de 2 minutos, de destinatarios y de reportes. `procedures.sql` y
  `triggers.sql` están vacíos.
- `Database/IoT/` practica en `nucleo_iot_test` (servicio TimescaleDB): `tables.sql`
  crea la extensión, la tabla `lectura` y la hypertable, `seed.sql` carga lecturas y
  `queries.sql` reúne consultas por intervalo, de calentamiento, de latencia y de chunks.

```bash
docker exec -i nucleo_postgres psql -U nucleo_app -d postgres -v ON_ERROR_STOP=1 < Database/Web-Mobile/init.sql
docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/tables.sql
docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/seed.sql
docker exec -i nucleo_postgres psql -U nucleo_app -d nucleo_test -v ON_ERROR_STOP=1 < Database/Web-Mobile/queries.sql

docker exec -i nucleo_timescaledb psql -U nucleo_iot -d postgres -v ON_ERROR_STOP=1 < Database/IoT/init.sql
docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/tables.sql
docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/seed.sql
docker exec -i nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot_test -v ON_ERROR_STOP=1 < Database/IoT/queries.sql
```

Cada `init.sql` elimina y recrea solo su base de práctica. Para borrarlas, ejecutar
el `drop.sql` de la carpeta correspondiente con `-d postgres`.

## Acceso

```bash
docker exec -it nucleo_postgres psql -U nucleo_app -d nucleo_db
docker exec -it nucleo_timescaledb psql -U nucleo_iot -d nucleo_iot
psql -h 127.0.0.1 -p 55432 -U nucleo_app -d nucleo_db
psql -h 127.0.0.1 -p 55433 -U nucleo_iot -d nucleo_iot
```

Comprobar TimescaleDB:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';
```

## Respaldos

Guardar fuera del repositorio, por ejemplo en `~/respaldos-nucleo/`:

```bash
mkdir -p ~/respaldos-nucleo
docker exec -t nucleo_postgres pg_dump -U nucleo_app -Fc nucleo_db \
  > ~/respaldos-nucleo/nucleo_db_$(date +%Y%m%d_%H%M%S).dump
docker exec -t nucleo_timescaledb pg_dump -U nucleo_iot -Fc nucleo_iot \
  > ~/respaldos-nucleo/nucleo_iot_$(date +%Y%m%d_%H%M%S).dump
```

La restauración sobre una base existente es destructiva y requiere un
procedimiento revisado.
