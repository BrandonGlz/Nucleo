#!/usr/bin/env bash
# Vigila los recursos del servidor y avisa por correo (manage.py avisar_servidor) si algo se sale
# de rango. Lo corre nucleo-recursos.timer cada 10 minutos. Revisa:
#   - disco de / por encima de NUCLEO_DISCO_MAX (85 %)
#   - memoria disponible por debajo de NUCLEO_MEMORIA_MIN (10 %)
#   - temperatura del procesador por encima de NUCLEO_TEMPERATURA_MAX (85 °C)
#   - la laptop sin corriente (cargador desconectado) y su batería
#   - contenedores de Núcleo detenidos o con salud "unhealthy"
# Cada tipo de aviso se manda como mucho una vez cada NUCLEO_AVISO_MINUTOS (60); cuando el
# problema se corrige llega un aviso de «normalizado».
# A mano:  bash deploy/vigilar_recursos.sh        (con --prueba solo imprime, no manda correos)
set -uo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marcas="$HOME/.cache/nucleo-avisos"
minutos="${NUCLEO_AVISO_MINUTOS:-60}"
prueba=0
[[ "${1:-}" == "--prueba" ]] && prueba=1
mkdir -p "$marcas"

enviar() {  # enviar <asunto> <mensaje>
  if ((prueba)); then
    printf '[prueba] %s\n%s\n\n' "$1" "$2"
    return
  fi
  (cd "$raiz/BackEnd" && printf '%s\n' "$2" | DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}" \
    .venv/bin/python manage.py avisar_servidor --asunto "$1" --stdin) || true
}

# revisar <clave> <hay_problema 0|1> <asunto> <mensaje>
revisar() {
  local marca="$marcas/recurso-$1"
  if [[ "$2" == 1 ]]; then
    if [[ -f "$marca" && -n "$(find "$marca" -mmin "-$minutos" 2>/dev/null)" ]]; then
      return
    fi
    touch "$marca"
    enviar "$3" "$4

Servidor: $(hostname) · $(date '+%Y-%m-%d %H:%M:%S %Z')
Siguiente aviso de este tipo, como pronto, en $minutos minutos."
  elif [[ -f "$marca" ]]; then
    rm -f "$marca"
    enviar "Normalizado: $3" "Ya está en rango: $4"
  fi
}

# Disco
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
max="${NUCLEO_DISCO_MAX:-85}"
revisar disco $((uso > max)) "Disco al ${uso} %" \
  "El disco del servidor (/) está al ${uso} % (límite ${max} %). Revisa ~/respaldos y los logs de Docker."

# Memoria disponible
total=$(awk '/^MemTotal/ {print $2}' /proc/meminfo)
libre=$(awk '/^MemAvailable/ {print $2}' /proc/meminfo)
pct=$((libre * 100 / total))
min="${NUCLEO_MEMORIA_MIN:-10}"
revisar memoria $((pct < min)) "Memoria disponible al ${pct} %" \
  "Quedan $((libre / 1024)) MB disponibles de $((total / 1024)) MB (límite ${min} %).
Procesos que más usan:
$(ps -eo rss,comm --sort=-rss | head -6 | awk 'NR>1 {printf "  %5d MB  %s\n", $1/1024, $2}')"

# Temperatura (la zona más caliente)
temp=0
for z in /sys/class/thermal/thermal_zone*/temp; do
  [[ -r "$z" ]] || continue
  t=$(($(cat "$z") / 1000))
  ((t > temp)) && temp=$t
done
tmax="${NUCLEO_TEMPERATURA_MAX:-85}"
revisar temperatura $((temp > tmax)) "Temperatura a ${temp} °C" \
  "El procesador está a ${temp} °C (límite ${tmax} °C). Revisa la ventilación de la laptop."

# Corriente y batería
for ac in /sys/class/power_supply/A*/online; do
  [[ -r "$ac" ]] || continue
  bateria=$(cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1)
  revisar corriente $(($(cat "$ac") == 0)) "El servidor está sin corriente" \
    "La laptop funciona con batería (${bateria:-?} %). Si no vuelve la luz, se apagará al agotarse."
  break
done

# Contenedores de Núcleo
mal=$(docker ps -a --filter name=nucleo_ --format '{{.Names}} {{.Status}}' 2>/dev/null \
  | grep -E 'Exited|unhealthy|Restarting' | grep -v nucleo_prueba || true)
revisar contenedores $([[ -n "$mal" ]] && echo 1 || echo 0) "Contenedores de Núcleo con problemas" \
  "Contenedores detenidos o con mala salud:
${mal:-ninguno}"

exit 0
