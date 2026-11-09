#!/usr/bin/env bash
# Restaura Núcleo desde una carpeta con respaldos: ~/traspaso o ~/respaldos/nucleo
# (toma los más recientes). Trae el .env raíz y el broker (certificados y usuarios) si
# faltan, y restaura nucleo_db (PostgreSQL) y nucleo_iot (TimescaleDB) en bases vacías.
# Uso, desde la carpeta del proyecto:  bash deploy/restaurar.sh ~/traspaso
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
origen="${1:?Uso: bash deploy/restaurar.sh <carpeta con los respaldos>}"
pg="${NUCLEO_PG:-nucleo_postgres}"
ts="${NUCLEO_TS:-nucleo_timescaledb}"
reciente() { ls -t "$origen"/$1 2>/dev/null | head -1 || true; }
dump_db="$(reciente 'nucleo_db*.dump')"
dump_iot="$(reciente 'nucleo_iot*.dump')"
archivos="$(reciente 'nucleo_archivos*.tar.gz')"
[[ -n "$archivos" ]] || archivos="$(reciente 'nucleo_broker_media*.tar.gz')"
[[ -n "$dump_db" && -n "$dump_iot" ]] || { echo "Faltan nucleo_db*.dump o nucleo_iot*.dump en $origen"; exit 1; }

if [[ -n "$archivos" ]]; then
  # --skip-old-files: no pisa un .env o certificados que ya existan.
  tar -xzf "$archivos" -C "$raiz" --skip-old-files
  chmod 600 "$raiz/.env" 2>/dev/null || true
  echo "Archivos restaurados desde $(basename "$archivos")"
fi
[[ -f "$raiz/.env" ]] || { echo "Falta .env en la raíz del proyecto"; exit 1; }

sql() { docker exec "$1" sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' _ "$2"; }
tablas() { sql "$1" "select count(*) from information_schema.tables where table_schema = 'public'"; }

[[ -n "${NUCLEO_SIN_COMPOSE:-}" ]] || (cd "$raiz" && docker compose up -d --wait postgres timescaledb redis)
for c in "$pg" "$ts"; do
  n="$(tablas "$c")"
  if [[ "$n" != 0 ]]; then
    echo "$c ya tiene $n tablas; no se restaura encima."
    echo "Para empezar de cero (borra las bases):  docker compose down -v"
    exit 1
  fi
done

echo "Restaurando $(basename "$dump_db") en $pg…"
docker exec -i "$pg" sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$dump_db"

echo "Restaurando $(basename "$dump_iot") en $ts (TimescaleDB)…"
sql "$ts" "CREATE EXTENSION IF NOT EXISTS timescaledb" >/dev/null
sql "$ts" "SELECT timescaledb_pre_restore()" >/dev/null
# TimescaleDB deja avisos esperados (extensión ya existente); se revisa el resultado después.
docker exec -i "$ts" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  < "$dump_iot" || echo "(pg_restore terminó con avisos; se verifica abajo)"
sql "$ts" "SELECT timescaledb_post_restore()" >/dev/null

echo "nucleo_db: $(tablas "$pg") tablas"
echo "nucleo_iot: $(tablas "$ts") tablas, hypertables: $(sql "$ts" "select string_agg(hypertable_name, ', ') from timescaledb_information.hypertables")"
echo "Listo. Sigue con: bash deploy/configurar_env.sh"
