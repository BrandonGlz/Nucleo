#!/usr/bin/env bash
# Crea (o cambia la contraseña de) el usuario MQTT de un dispositivo.
#
# El usuario es el codigo_mqtt del dispositivo; la ACL le permite publicar y leer solo en
# su propio tópico (pattern %u), así que dos dispositivos no pueden suplantarse.
# Genera una contraseña aleatoria, la imprime una sola vez y recarga el broker.
# Uso, desde la carpeta principal:  bash Mosquitto/dispositivo.sh NUC-002
set -euo pipefail

codigo="${1:?Uso: bash Mosquitto/dispositivo.sh <codigo_mqtt>}"
if [[ ! "$codigo" =~ ^[A-Za-z0-9_-]{1,40}$ ]]; then
  echo "El código solo admite letras, números, guion y guion bajo (máximo 40)." >&2
  exit 1
fi
if [[ "$codigo" == "nucleo_backend" ]]; then
  echo "Ese nombre está reservado para el backend." >&2
  exit 1
fi

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config="$raiz/Mosquitto/config"
clave="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-24)"

docker run --rm -v "$config:/work" eclipse-mosquitto:2 sh -c \
  "mosquitto_passwd -b /work/passwd '$codigo' '$clave' && chmod 644 /work/passwd"
docker kill -s HUP nucleo_mosquitto > /dev/null 2>&1 || \
  echo "El broker no está encendido; el usuario quedó creado y se leerá al iniciarlo."
echo "Usuario MQTT: $codigo"
echo "Contraseña (se muestra una sola vez): $clave"
