#!/usr/bin/env bash
# Crea BackEnd/.env de producción a partir de deploy/backend.env.ejemplo y del .env raíz:
# arma DATABASE_URL, IOT_DATABASE_URL, REDIS_URL y MQTT_PASSWORD con las contraseñas del
# .env raíz, genera DJANGO_SECRET_KEY y pide la contraseña de aplicación de Gmail
# (y la URL de Tailscale y el Gmail si la plantilla aún no los trae).
# Uso, desde la carpeta del proyecto (después de deploy/restaurar.sh):  bash deploy/configurar_env.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plantilla="$raiz/deploy/backend.env.ejemplo"
destino="$raiz/BackEnd/.env"
[[ -f "$raiz/.env" ]] || { echo "Falta el .env raíz: corre antes bash deploy/restaurar.sh ~/traspaso"; exit 1; }
[[ -f "$destino" ]] && { echo "Ya existe BackEnd/.env; bórralo si quieres generarlo de nuevo."; exit 1; }

set -a
# shellcheck disable=SC1091
source "$raiz/.env"
set +a
: "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}" "${IOT_PASSWORD:?Falta IOT_PASSWORD en .env}"
: "${REDIS_PASSWORD:?Falta REDIS_PASSWORD en .env}" "${MQTT_BACKEND_PASSWORD:?Falta MQTT_BACKEND_PASSWORD en .env}"
q() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

url="" gmail=""
if grep -q 'TU-TAILNET.ts.net' "$plantilla"; then
  read -rp "Nombre del tailnet (ej. tail1234ab.ts.net): " url
fi
if grep -q 'tu_cuenta@gmail.com' "$plantilla"; then
  read -rp "Cuenta de Gmail que envía los correos: " gmail
fi
read -rsp "Contraseña de aplicación de Gmail (16 letras): " app; echo
app="${app// /}"
[[ ${#app} -eq 16 ]] || echo "Aviso: la contraseña de aplicación suele tener 16 letras (tiene ${#app})."

db="postgres://${POSTGRES_USER:-nucleo_app}:$(q "$POSTGRES_PASSWORD")@127.0.0.1:${POSTGRES_PORT:-55432}/${POSTGRES_DB:-nucleo_db}"
iot="postgres://${IOT_USER:-nucleo_iot}:$(q "$IOT_PASSWORD")@127.0.0.1:${IOT_PORT:-55433}/${IOT_DB:-nucleo_iot}"
redis="redis://:$(q "$REDIS_PASSWORD")@127.0.0.1:${REDIS_PORT:-56379}/0"
secreto="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"

umask 077
DB="$db" IOT="$iot" REDIS="$redis" SECRETO="$secreto" APP="$app" MQTT="$MQTT_BACKEND_PASSWORD" \
URL="${url:-TU-TAILNET.ts.net}" GMAIL="${gmail:-tu_cuenta@gmail.com}" \
python3 - "$plantilla" "$destino" <<'EOF'
import os, sys
e = os.environ
lineas = {
    'DATABASE_URL': e['DB'], 'IOT_DATABASE_URL': e['IOT'], 'REDIS_URL': e['REDIS'],
    'DJANGO_SECRET_KEY': e['SECRETO'], 'EMAIL_HOST_PASSWORD': e['APP'], 'MQTT_PASSWORD': e['MQTT'],
}
salida = []
for linea in open(sys.argv[1], encoding='utf-8'):
    clave = linea.split('=', 1)[0]
    if clave in lineas:
        linea = f'{clave}={lineas[clave]}\n'
    linea = linea.replace('TU-TAILNET.ts.net', e['URL']).replace('tu_cuenta@gmail.com', e['GMAIL'])
    salida.append(linea)
open(sys.argv[2], 'w', encoding='utf-8').writelines(salida)
EOF
echo "BackEnd/.env creado. Revísalo con: grep -v -e PASSWORD -e _URL BackEnd/.env"
