#!/usr/bin/env bash
# Respaldo de Núcleo: pg_dump de nucleo_db y nucleo_iot (TimescaleDB) + usuarios y
# certificados del broker, y la llave de firma de la app (~/nucleo-app). Guarda 7 días en ~/respaldos/nucleo y lo
# sube a Google Drive con rclone, borrando allá lo de más de 30 días:
# - "gdrive-nucleo-cifrado" (remoto crypt sobre gdrive-nucleo:servidor/nucleo-cifrado): Drive solo recibe archivos
#   cifrados, con nombres cifrados. Es el que se usa si existe (ver deploy/README.md, «Respaldos cifrados»).
# - Si no, "gdrive-nucleo" (o "gdrive") en claro, en servidor/nucleo.
# Lo ejecuta el timer nucleo-respaldo.timer; a mano:  bash deploy/respaldar.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
destino="$HOME/respaldos/nucleo"
fecha="$(date +%F_%H%M)"
mkdir -p "$destino"

volcar() {  # contenedor archivo
  docker exec "$1" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$destino/$2_$fecha.dump"
}
volcar nucleo_postgres nucleo_db
volcar nucleo_timescaledb nucleo_iot
tar -czf "$destino/nucleo_broker_media_$fecha.tar.gz" -C "$raiz" \
  Mosquitto/certs Mosquitto/config/passwd BackEnd/media
# Sin la llave de firma no se puede publicar una actualización de la app instalada
if [[ -d "$HOME/nucleo-app" ]]; then
  tar -czf "$destino/nucleo_firma_app_$fecha.tar.gz" -C "$HOME" nucleo-app
fi
chmod 600 "$destino"/*"$fecha"*
find "$destino" -type f -mtime +7 -delete
echo "Respaldo local: $destino ($fecha)"

# Cada proyecto usa su propia cuenta de Drive (remoto gdrive-nucleo); si no existe, el común gdrive.
remoto=""
carpeta=""
if command -v rclone >/dev/null; then
  remotos="$(rclone listremotes)"
  if grep -qx "gdrive-nucleo-cifrado:" <<<"$remotos"; then
    remoto="gdrive-nucleo-cifrado"; carpeta=""  # la carpeta ya la fija el remoto crypt
  else
    for r in gdrive-nucleo gdrive; do grep -qx "$r:" <<<"$remotos" && { remoto="$r"; carpeta="servidor/nucleo"; break; }; done
    [[ -z "$remoto" ]] || echo "Aviso: el respaldo sube a Drive SIN cifrar (falta el remoto gdrive-nucleo-cifrado)."
  fi
fi
if [[ -n "$remoto" ]]; then
  # Al arrancar sin red (o con un corte), reintenta durante unos 10 minutos.
  for intento in $(seq 10); do
    rclone copy "$destino" "$remoto:$carpeta" --max-age 2d && break
    (( intento < 10 )) || { echo "No se pudo subir a Google Drive"; exit 1; }
    echo "Sin acceso a Google Drive; reintento en 60 s ($intento/10)"; sleep 60
  done
  rclone delete "$remoto:$carpeta" --min-age 30d || true
  # Los respaldos en claro de antes del cifrado se van borrando solos al cumplir 30 días.
  if [[ "$remoto" == gdrive-nucleo-cifrado ]] && grep -qx "gdrive-nucleo:" <<<"$remotos"; then
    rclone delete "gdrive-nucleo:servidor/nucleo" --min-age 30d 2>/dev/null || true
  fi
  echo "Copiado a Google Drive: $remoto:$carpeta"
fi
