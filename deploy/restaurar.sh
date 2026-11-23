#!/usr/bin/env bash
# Restaura Núcleo desde respaldos: una carpeta (~/traspaso, ~/respaldos/nucleo, o la carpeta donde se
# extrajo un zip semanal) o el zip semanal directamente (nucleo_semana_<lunes>_al_<domingo>.zip).
# Trae la aplicación (nucleo_aplicacion_*: código, .env raíz, BackEnd/.env, Caddy, Mosquitto…), el
# broker y lo subido (nucleo_broker_media_*), y restaura nucleo_db (PostgreSQL) y nucleo_iot
# (TimescaleDB) en bases vacías. La llave de firma del APK (nucleo_firma_app_*) solo con --firma.
#
# Uso, desde la carpeta del proyecto:  bash deploy/restaurar.sh [opciones] <carpeta o zip>
#   --lista            muestra los respaldos que hay de cada tipo y cuáles se usarían; no cambia nada
#   --fecha F          usa el respaldo de esa fecha (AAAA-MM-DD o AAAA-MM-DD_HHMM, como en el nombre) en vez
#                      del más reciente
#   --destino DIR      extrae los archivos en DIR en vez de la carpeta del proyecto (p. ej. para probar)
#   --firma DIR        extrae también la llave de firma del APK en DIR/nucleo-app (va en el equipo que compila: ~)
#   --sobrescribir     reemplaza los archivos que ya existen con otro contenido sin preguntar
#   -y, --si           no pregunta; sin --sobrescribir conserva los archivos que ya existen
# Se elige el volcado de nucleo_db más reciente (o el de --fecha) y, de cada otro tipo, el más reciente que
# no sea posterior: en el zip semanal un tar que no cambió solo está en un día anterior y así se encuentra.
# Nada se pisa sin confirmar: los archivos que ya existen con otro contenido se listan y se pregunta (sin
# terminal se conservan) y las bases deben estar vacías.
# Respaldos cifrados en Drive: primero  rclone copy gdrive-nucleo-cifrado:semanal ~/traspaso --max-age 8d
# Variables: NUCLEO_PG / NUCLEO_TS (contenedores destino), NUCLEO_SIN_COMPOSE=1 (no levanta los del
# proyecto) y NUCLEO_SOLO_BASES=1 (no toca archivos; lo usa deploy/probar_restauracion.sh).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uso() { sed -n '8,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

origen="" destino="$raiz" fecha="" lista="" si="" sobrescribir="" firma_en=""
while (( $# )); do
  case "$1" in
    --lista) lista=1; shift ;;
    --fecha) fecha="${2:?--fecha necesita una fecha}"; shift 2 ;;
    --destino) destino="${2:?--destino necesita una carpeta}"; shift 2 ;;
    --firma) firma_en="${2:?--firma necesita una carpeta}"; shift 2 ;;
    --sobrescribir) sobrescribir=1; shift ;;
    -y|--si) si=1; shift ;;
    -h|--help) uso; exit 0 ;;
    -*) echo "Opción desconocida: $1"; uso; exit 2 ;;
    *) [[ -z "$origen" ]] || { uso; exit 2; }; origen="$1"; shift ;;
  esac
done
[[ -n "$origen" ]] || { uso; exit 2; }
pg="${NUCLEO_PG:-nucleo_postgres}"
ts="${NUCLEO_TS:-nucleo_timescaledb}"
interactivo() { [[ -t 0 && -z "$si" ]]; }
pregunta() { local r; read -rp "$1 [s/N] " r; [[ "$r" =~ ^[sS] ]]; }

# Zip semanal: se extrae en un temporal (se borra al terminar) y se busca en sus carpetas de día.
temporal=""
trap '[[ -z "$temporal" ]] || rm -rf "$temporal"' EXIT
if [[ -f "$origen" ]]; then
  [[ "$origen" == *.zip ]] || { echo "$origen no es una carpeta ni un .zip"; exit 1; }
  temporal="$(mktemp -d)"
  echo "Extrayendo $(basename "$origen") en un temporal…"
  python3 -I -m zipfile -e "$origen" "$temporal"
  origen="$temporal"
fi
[[ -d "$origen" ]] || { echo "No existe $origen"; exit 1; }

# candidatos <patrón>: «clave<TAB>ruta», con la clave AAAA-MM-DD_HHMM del nombre (o la fecha del archivo
# si el nombre no la trae). Busca en la carpeta y un nivel abajo (las carpetas de día del zip).
clave() {
  local c
  c="$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}' <<<"$(basename "$1")" | tail -1 || true)"
  [[ -n "$c" ]] && echo "$c" || date -r "$1" +%F_%H%M
}
candidatos() {
  local f
  while IFS= read -r -d '' f; do printf '%s\t%s\n' "$(clave "$f")" "$f"; done \
    < <(find "$origen" -maxdepth 2 -type f -name "$1" -print0) | sort
}
# elegir <patrón> <límite>: el más reciente cuya clave no pase del límite (vacío = sin límite).
elegir() { candidatos "$1" | awk -F'\t' -v l="$2" 'l == "" || $1 <= l' | tail -1 | cut -f2; }

declare -A patron=(
  [db]='nucleo_db*.dump' [iot]='nucleo_iot*.dump' [aplicacion]='nucleo_aplicacion*.tar.gz'
  [broker_media]='nucleo_broker_media*.tar.gz' [firma_app]='nucleo_firma_app*.tar.gz'
  [archivos]='nucleo_archivos*.tar.gz'  # traspaso viejo (.env y broker), antes de nucleo_aplicacion
)
tipos=(db iot aplicacion broker_media firma_app archivos)

if [[ -n "$fecha" ]]; then
  dump_db="$(candidatos "${patron[db]}" | awk -F'\t' -v p="$fecha" 'index($1, p) == 1' | tail -1 | cut -f2)"
  [[ -n "$dump_db" ]] || { echo "No hay nucleo_db de $fecha en $origen (ve --lista)"; exit 1; }
else
  dump_db="$(elegir "${patron[db]}" "")"
fi
[[ -n "$dump_db" ]] || { echo "No hay nucleo_db*.dump en $origen"; exit 1; }
limite="$(clave "$dump_db")"
declare -A elegido=([db]="$dump_db")
for t in "${tipos[@]:1}"; do elegido[$t]="$(elegir "${patron[$t]}" "$limite")"; done
# La aplicación y el broker ya traen lo de nucleo_archivos: el viejo solo se usa si no están.
[[ -z "${elegido[aplicacion]}" && -z "${elegido[broker_media]}" ]] || elegido[archivos]=""

if [[ -n "$lista" ]]; then
  for t in "${tipos[@]}"; do
    echo "${patron[$t]}:"
    candidatos "${patron[$t]}" | while IFS=$'\t' read -r c f; do
      [[ "$f" == "${elegido[$t]}" ]] && m="→" || m=" "
      echo "  $m ${f#"$origen"/}"
    done
  done
  echo "(→ = el que se usaría$([[ -n "$fecha" ]] && echo " con --fecha $fecha"))"
  exit 0
fi

dump_iot="${elegido[iot]}"
[[ -n "$dump_iot" ]] || { echo "No hay nucleo_iot*.dump de $limite o anterior en $origen"; exit 1; }
solo_bases="${NUCLEO_SOLO_BASES:-}"

echo "Respaldo de $limite (en $origen):"
for t in "${tipos[@]}"; do
  f="${elegido[$t]}"
  if [[ -z "$f" ]]; then [[ "$t" == archivos ]] || printf '  %-13s no hay\n' "$t"; continue; fi
  nota=""
  [[ "$(clave "$f")" == "$limite" ]] || nota=" (de $(clave "$f"))"
  [[ -z "$solo_bases" || "$t" == db || "$t" == iot ]] || nota+=" (no se usa: solo bases)"
  [[ "$t" != firma_app || -n "$firma_en" || -n "$solo_bases" ]] || nota+=" (no se usa: falta --firma <carpeta>)"
  printf '  %-13s %s%s\n' "$t" "${f#"$origen"/}" "$nota"
done
[[ "$(clave "$dump_iot")" == "$limite" ]] || echo "Aviso: nucleo_iot no es del mismo respaldo que nucleo_db."
[[ -n "$solo_bases" ]] || echo "Archivos a: $destino$([[ -n "$firma_en" ]] && echo "; llave de firma a: $firma_en/nucleo-app")"
echo "Bases a: $pg y $ts (deben estar vacías)"
if interactivo; then pregunta "¿Continuar?" || { echo "Cancelado."; exit 1; }; fi

# extraer <tar.gz> <carpeta>: agrega lo que falta. Si hay archivos que ya existen con otro contenido (tar
# --diff, sin contar fechas ni dueños), los lista y solo los reemplaza con confirmación o --sobrescribir.
extraer() {
  local tar="$1" dir="$2" r
  local -a dif opc=(--skip-old-files)
  mkdir -p "$dir"
  mapfile -t dif < <(LC_ALL=C tar -dzf "$tar" -C "$dir" 2>/dev/null \
    | sed -nE 's/^(.*): (Contents differ|Size differs|File type differs|Symlink differs)$/\1/p' | sort -u)
  if (( ${#dif[@]} )); then
    echo "$(basename "$tar"): ${#dif[@]} archivo(s) ya existen en $dir con otro contenido:"
    printf '  %s\n' "${dif[@]:0:15}"
    (( ${#dif[@]} <= 15 )) || echo "  … y $(( ${#dif[@]} - 15 )) más"
    if [[ -n "$sobrescribir" ]] || { interactivo && pregunta "¿Reemplazarlos por los del respaldo?"; }; then
      opc=(--overwrite); echo "Se reemplazan."
    else
      echo "Se conservan los que ya están (solo se agregan los que faltan)."
    fi
  fi
  tar -xzpf "$tar" -C "$dir" "${opc[@]}"
  echo "Extraído $(basename "$tar") en $dir"
}

if [[ -z "$solo_bases" ]]; then
  for t in aplicacion broker_media archivos; do
    [[ -z "${elegido[$t]}" ]] || extraer "${elegido[$t]}" "$destino"
  done
  if [[ -n "$firma_en" && -n "${elegido[firma_app]}" ]]; then extraer "${elegido[firma_app]}" "$firma_en"; fi
  chmod 600 "$destino/.env" "$destino/BackEnd/.env" 2>/dev/null || true
  [[ -f "$destino/.env" ]] || { echo "Falta .env en $destino (no venía en el respaldo)"; exit 1; }
fi

# Una base recién creada arranca un servidor temporal para inicializarse, lo apaga y arranca el
# definitivo; el healthcheck ya pasa con el temporal. Se espera al mensaje del arranque definitivo.
listo() {
  local i
  for i in $(seq 60); do
    docker logs "$1" 2>&1 | grep -qE 'init process complete; ready for start up|Skipping initialization' \
      && docker exec "$1" pg_isready -q && return 0
    sleep 2
  done
  echo "$1 no terminó de arrancar"; exit 1
}
sql() { docker exec "$1" sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' _ "$2"; }
tablas() { sql "$1" "select count(*) from information_schema.tables where table_schema = 'public'"; }

[[ -n "${NUCLEO_SIN_COMPOSE:-}" ]] || (cd "$destino" && docker compose up -d --wait postgres timescaledb redis)
listo "$pg"; listo "$ts"
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
[[ -n "$solo_bases" ]] && exit 0
if [[ -f "$destino/VERSION_DESPLEGADA" ]]; then
  echo "Versión que corría al respaldar: $(cat "$destino/VERSION_DESPLEGADA")"
  actual="$(git -C "$destino" rev-parse HEAD 2>/dev/null || true)"
  [[ -z "$actual" || "$(cut -d' ' -f1 "$destino/VERSION_DESPLEGADA")" == "$actual" ]] \
    || echo "El repositorio está en ${actual:0:12}; para la misma versión: git checkout $(cut -c1-12 "$destino/VERSION_DESPLEGADA")"
fi
[[ -n "$firma_en" || -z "${elegido[firma_app]}" ]] \
  || echo "Llave de firma del APK (equipo que compila): tar -xzf ${elegido[firma_app]} -C ~  (o --firma ~)"
echo "Listo. Sigue con: bash deploy/configurar_env.sh (si falta BackEnd/.env) y bash deploy/instalar.sh"
