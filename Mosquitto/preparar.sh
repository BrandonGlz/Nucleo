#!/usr/bin/env bash
# Prepara el broker en local: certificados TLS de desarrollo y archivo de usuarios.
#
# Lee MQTT_BACKEND_PASSWORD y MQTT_DEVICE_PASSWORD del .env de la carpeta principal.
# MQTT_SERVER_NAMES (opcional) agrega al certificado del servidor los nombres o IP con los
# que se conectan los dispositivos, separados por comas, p. ej. 192.168.1.10,nucleo.local.
# La CA no cambia, así que los dispositivos conservan su copia de ca.der.
# Crea los usuarios nucleo_backend y NUC-001 (dispositivo de demostración); para más
# dispositivos usar Mosquitto/dispositivo.sh.
# Uso, desde la carpeta principal:  bash Mosquitto/preparar.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
certs="$raiz/Mosquitto/certs"
config="$raiz/Mosquitto/config"

set -a
# shellcheck disable=SC1091
source "$raiz/.env"
set +a
: "${MQTT_BACKEND_PASSWORD:?Defina MQTT_BACKEND_PASSWORD en .env}"
: "${MQTT_DEVICE_PASSWORD:?Defina MQTT_DEVICE_PASSWORD en .env}"

nombres_san() {
  local san="DNS:localhost,DNS:nucleo_mosquitto,IP:127.0.0.1" n
  IFS=',' read -ra extra <<< "${MQTT_SERVER_NAMES:-}"
  for n in "${extra[@]}"; do
    n="${n// /}"
    [[ -z "$n" ]] && continue
    if [[ "$n" =~ ^[0-9.]+$ || "$n" == *:* ]]; then san+=",IP:$n"; else san+=",DNS:$n"; fi
  done
  echo "$san"
}

# Verdadero si el certificado del servidor ya incluye todos los nombres pedidos.
san_completo() {
  [[ -f "$certs/server.crt" ]] || return 1
  local actual n
  actual="$(openssl x509 -in "$certs/server.crt" -noout -ext subjectAltName | tr -d ' ')"
  for n in $(nombres_san | tr ',' ' '); do
    [[ "$actual" == *"${n/IP:/IPAddress:}"* ]] || return 1
  done
}

emitir_servidor() {
  openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" \
    -keyout "$certs/server.key" -out "$certs/server.csr"
  printf 'subjectAltName=%s\n' "$(nombres_san)" > "$certs/san.ext"
  openssl x509 -req -in "$certs/server.csr" -CA "$certs/ca.crt" -CAkey "$certs/ca.key" \
    -CAcreateserial -days 825 -extfile "$certs/san.ext" -out "$certs/server.crt"
  rm -f "$certs/server.csr" "$certs/san.ext"
}

mkdir -p "$certs"
if [[ ! -f "$certs/ca.crt" ]]; then
  openssl req -x509 -newkey rsa:4096 -nodes -days 825 -subj "/CN=Nucleo Dev CA" \
    -keyout "$certs/ca.key" -out "$certs/ca.crt"
  emitir_servidor
  echo "Certificados creados en Mosquitto/certs/."
elif ! san_completo; then
  emitir_servidor
  echo "Certificado del servidor emitido de nuevo con: $(nombres_san)"
fi
# El contenedor corre como el usuario 1883 y debe poder leer la llave del servidor.
chmod 644 "$certs"/*.crt "$certs/server.key"
chmod 600 "$certs/ca.key"

rm -f "$config/passwd"
docker run --rm -v "$config:/work" eclipse-mosquitto:2 sh -c \
  "mosquitto_passwd -b -c /work/passwd nucleo_backend '$MQTT_BACKEND_PASSWORD' && \
   mosquitto_passwd -b /work/passwd NUC-001 '$MQTT_DEVICE_PASSWORD' && chmod 644 /work/passwd"
echo "Usuarios del broker creados en Mosquitto/config/passwd: nucleo_backend y NUC-001."
