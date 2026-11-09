#!/usr/bin/env bash
# Respaldo de Núcleo: pg_dump de nucleo_db y nucleo_iot (TimescaleDB) + usuarios y
# certificados del broker. Guarda 7 días en ~/respaldos/nucleo y, si rclone tiene el
# remoto "gdrive", sube a Google Drive (gdrive:servidor/nucleo) y borra allá lo de más de 30 días.
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
chmod 600 "$destino"/*"$fecha"*
find "$destino" -type f -mtime +7 -delete
echo "Respaldo local: $destino ($fecha)"

if command -v rclone >/dev/null && rclone listremotes | grep -qx 'gdrive:'; then
  rclone copy "$destino" gdrive:servidor/nucleo --max-age 2d
  rclone delete gdrive:servidor/nucleo --min-age 30d
  echo "Copiado a Google Drive: gdrive:servidor/nucleo"
fi
