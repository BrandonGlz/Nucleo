#!/usr/bin/env bash
# Aviso por correo cuando falla un servicio de Núcleo. Lo llama nucleo-aviso@<unidad>.service
# (OnFailure= de cada unidad) con el nombre de la unidad que falló; manda las últimas líneas de
# su journal con `manage.py avisar_servidor` (Gmail del proyecto).
# Un servicio que se reinicia en bucle fallaría cada pocos segundos: se manda como mucho un aviso
# por unidad cada NUCLEO_AVISO_MINUTOS (60).
# A mano:  bash deploy/aviso_fallo.sh nucleo-mqtt.service
set -euo pipefail

unidad="${1:?Uso: aviso_fallo.sh <unidad>}"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
marcas="$HOME/.cache/nucleo-avisos"
minutos="${NUCLEO_AVISO_MINUTOS:-60}"
mkdir -p "$marcas"
marca="$marcas/$unidad"
if [[ -f "$marca" && -n "$(find "$marca" -mmin "-$minutos" 2>/dev/null)" ]]; then
  echo "Aviso de $unidad omitido: ya se mandó uno en los últimos $minutos minutos."
  exit 0
fi
touch "$marca"

cd "$raiz/BackEnd"
{
  echo "La unidad $unidad falló en $(hostname) el $(date '+%Y-%m-%d %H:%M:%S %Z')."
  echo "Estado actual: $(systemctl is-active "$unidad" 2>/dev/null || true)"
  echo "Siguiente aviso de esta unidad, como pronto, en $minutos minutos."
  echo
  echo "Últimas líneas del journal:"
  journalctl -u "$unidad" -n 60 --no-pager 2>&1 || true
} | DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}" \
  .venv/bin/python manage.py avisar_servidor --asunto "Falló $unidad" --stdin
