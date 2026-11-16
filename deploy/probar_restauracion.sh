#!/usr/bin/env bash
# Prueba de restauración: restaura el respaldo más reciente de ~/respaldos/nucleo en dos
# contenedores temporales (sin puertos publicados, sin tocar las bases reales ni los archivos del
# proyecto), comprueba que los datos estén y mide cuánto tarda. Ese tiempo es el RTO de las bases.
# Al terminar borra los contenedores y manda el resultado por correo (manage.py avisar_servidor).
# Si falla, el correo lo manda nucleo-aviso@ con la salida (OnFailure= de la unidad).
#
# La corre nucleo-prueba-restauracion.timer el primer domingo de cada mes; a mano:
#   bash deploy/probar_restauracion.sh [carpeta con respaldos]
# Con 8 GB de RAM se detiene la IA local (Ollama) mientras dura y se vuelve a encender al final.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
origen="${1:-$HOME/respaldos/nucleo}"
pg_prueba=nucleo_prueba_pg
ts_prueba=nucleo_prueba_ts
inicio="$(date +%s)"
bitacora_dir="$HOME/respaldos/nucleo-pruebas"
mkdir -p "$bitacora_dir"
bitacora="$bitacora_dir/prueba_$(date +%F_%H%M).log"
exec > >(tee "$bitacora") 2>&1

ollama_estaba=""
limpiar() {
  docker rm -f "$pg_prueba" "$ts_prueba" >/dev/null 2>&1 || true
  if [[ -n "$ollama_estaba" ]]; then docker start nucleo_ollama >/dev/null 2>&1 || true; fi
}
trap limpiar EXIT

echo "== Prueba de restauración de Núcleo ($(date '+%Y-%m-%d %H:%M %Z')) desde $origen"
reciente() { ls -t "$origen"/$1 2>/dev/null | head -1 || true; }
dump_db="$(reciente 'nucleo_db*.dump')"
dump_iot="$(reciente 'nucleo_iot*.dump')"
[[ -n "$dump_db" && -n "$dump_iot" ]] || { echo "No hay respaldos en $origen"; exit 1; }
echo "Respaldos: $(basename "$dump_db") ($(du -h "$dump_db" | cut -f1)), $(basename "$dump_iot") ($(du -h "$dump_iot" | cut -f1))"
edad_h=$(( ( $(date +%s) - $(stat -c %Y "$dump_db") ) / 3600 ))
echo "Antigüedad del respaldo: ${edad_h} h"
(( edad_h <= 26 )) || { echo "El respaldo más reciente tiene más de 26 h: el respaldo no está corriendo."; exit 1; }

if docker ps --format '{{.Names}}' | grep -qx nucleo_ollama; then
  echo "Deteniendo Ollama durante la prueba para liberar memoria"
  ollama_estaba=1
  docker stop nucleo_ollama >/dev/null
fi

# Mismas imágenes, usuarios y nombres de base que producción: es lo que pasaría al restaurar en
# un equipo nuevo con docker compose.
imagen() { docker inspect "$1" --format '{{.Config.Image}}'; }
variable() { docker exec "$1" printenv "$2"; }
clave="$(openssl rand -hex 16)"
docker rm -f "$pg_prueba" "$ts_prueba" >/dev/null 2>&1 || true
docker run -d --name "$pg_prueba" --memory 512m \
  -e POSTGRES_USER="$(variable nucleo_postgres POSTGRES_USER)" \
  -e POSTGRES_DB="$(variable nucleo_postgres POSTGRES_DB)" \
  -e POSTGRES_PASSWORD="$clave" "$(imagen nucleo_postgres)" >/dev/null
docker run -d --name "$ts_prueba" --memory 1g \
  -e POSTGRES_USER="$(variable nucleo_timescaledb POSTGRES_USER)" \
  -e POSTGRES_DB="$(variable nucleo_timescaledb POSTGRES_DB)" \
  -e POSTGRES_PASSWORD="$clave" "$(imagen nucleo_timescaledb)" >/dev/null

restaurado_en=""
NUCLEO_PG="$pg_prueba" NUCLEO_TS="$ts_prueba" NUCLEO_SIN_COMPOSE=1 NUCLEO_SOLO_BASES=1 \
  bash "$raiz/deploy/restaurar.sh" "$origen"
restaurado_en="$(date +%s)"

sql() { docker exec "$1" sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' _ "$2"; }
contar() {  # contenedor tabla -> filas (o "—" si la tabla no existe en ese respaldo)
  sql "$1" "select case when to_regclass('public.$2') is null then '—' else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.$2', false, true, '')))[1]::text end"
}

echo
echo "== Verificación"
fallos=0
printf '%-22s %12s %12s\n' "Tabla" "Restaurado" "Producción"
for tabla in organizacion area usuario dispositivo sensor umbral alerta notificacion reporte registro_auditoria; do
  r="$(contar "$pg_prueba" "$tabla")"; p="$(contar nucleo_postgres "$tabla")"
  printf '%-22s %12s %12s\n' "$tabla" "$r" "$p"
done
printf '%-22s %12s %12s\n' "lectura (TimescaleDB)" "$(contar "$ts_prueba" lectura)" "$(contar nucleo_timescaledb lectura)"
for tabla in organizacion usuario dispositivo; do
  [[ "$(contar "$pg_prueba" "$tabla")" =~ ^[1-9] ]] || { echo "FALLA: $tabla quedó vacía"; fallos=$((fallos + 1)); }
done
[[ "$(contar "$ts_prueba" lectura)" =~ ^[1-9] ]] || { echo "FALLA: lectura quedó vacía"; fallos=$((fallos + 1)); }
mig_r="$(sql "$pg_prueba" "select count(*) from django_migrations")"
mig_p="$(sql nucleo_postgres "select count(*) from django_migrations")"
echo "Migraciones: restaurado $mig_r, producción $mig_p"
(( mig_r > 0 )) || { echo "FALLA: el respaldo no trae migraciones"; fallos=$((fallos + 1)); }
echo "Lectura más reciente del respaldo: $(sql "$ts_prueba" "select max(fecha_hora) from lectura")"

fin="$(date +%s)"
minutos=$(( (restaurado_en - inicio + 59) / 60 ))
echo
echo "Tiempo de restauración de las bases (RTO medido): ${minutos} min; prueba completa: $(( (fin - inicio + 59) / 60 )) min"
echo "Bitácora: $bitacora"
(( fallos == 0 )) || { echo "Prueba FALLIDA ($fallos fallas)"; exit 1; }
echo "Prueba CORRECTA"

find "$bitacora_dir" -type f -mtime +400 -delete
cd "$raiz/BackEnd"
DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}" \
  .venv/bin/python manage.py avisar_servidor \
  --asunto "Prueba de restauración correcta (${minutos} min)" --stdin < "$bitacora" || true
