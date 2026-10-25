#!/usr/bin/env bash
# Crea los usuarios de base de datos con los que debe conectarse el backend en producción
# (SRS 3.3.2): sin superusuario, sin CREATEDB ni CREATEROLE, dueños solo de su propia base
# y sin acceso a la otra. Las migraciones de Django funcionan con ellos, incluida la
# hypertable de TimescaleDB (la extensión se crea aquí, con el administrador del contenedor).
#
# Lee del .env de la carpeta principal: POSTGRES_USER, IOT_USER, BACKEND_DB_PASSWORD y
# BACKEND_IOT_DB_PASSWORD. Opcionales: ROL_APP, ROL_IOT, DB_APP, DB_IOT.
# Uso, desde la carpeta principal:  bash Database/crear-roles.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# shellcheck disable=SC1091
source "$raiz/.env"
set +a
: "${BACKEND_DB_PASSWORD:?Defina BACKEND_DB_PASSWORD en .env}"
: "${BACKEND_IOT_DB_PASSWORD:?Defina BACKEND_IOT_DB_PASSWORD en .env}"

admin_app="${POSTGRES_USER:-nucleo_app}"
admin_iot="${IOT_USER:-nucleo_iot}"
rol_app="${ROL_APP:-nucleo_backend}"
rol_iot="${ROL_IOT:-nucleo_backend_iot}"
db_app="${DB_APP:-${POSTGRES_DB:-nucleo_db}}"
db_iot="${DB_IOT:-${IOT_DB:-nucleo_iot}}"

preparar() { # contenedor administrador base rol clave
  docker exec -i "$1" psql -U "$2" -d postgres -v ON_ERROR_STOP=1 \
    -v "base=$3" -v "rol=$4" -v "clave=$5" -q <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE', :'rol')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'rol') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'rol', :'clave') \gexec
SELECT format('CREATE DATABASE %I', :'base')
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'base') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'base', :'rol') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'base') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'base', :'rol') \gexec
SQL
}

preparar nucleo_postgres "$admin_app" "$db_app" "$rol_app" "$BACKEND_DB_PASSWORD"
preparar nucleo_timescaledb "$admin_iot" "$db_iot" "$rol_iot" "$BACKEND_IOT_DB_PASSWORD"
docker exec -i nucleo_timescaledb psql -U "$admin_iot" -d "$db_iot" -v ON_ERROR_STOP=1 -q \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb"
echo "Usuarios listos: $rol_app sobre $db_app y $rol_iot sobre $db_iot."
echo "Apunte DATABASE_URL e IOT_DATABASE_URL de BackEnd/.env a estos usuarios y ejecute migrate."
