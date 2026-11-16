#!/usr/bin/env bash
# Firewall del servidor con nftables (deploy/firewall.nft). Pide sudo.
#
#   bash deploy/firewall.sh aplicar    carga las reglas y programa quitarlas en 3 minutos
#   bash deploy/firewall.sh confirmar  (desde OTRA sesión SSH) cancela la vuelta atrás y las deja
#                                      fijas al arrancar (nucleo-firewall.service)
#   bash deploy/firewall.sh quitar     las quita y desactiva el servicio
#   bash deploy/firewall.sh estado     muestra las reglas y cuántas conexiones se rechazaron
#
# La vuelta atrás evita quedarse sin SSH: si después de «aplicar» no se puede abrir una sesión
# nueva para «confirmar», a los 3 minutos las reglas se quitan solas.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
reglas="$raiz/deploy/firewall.nft"
fijo=/etc/nucleo/firewall.nft
revertir=nucleo-firewall-revertir

quitar_tabla() { sudo nft delete table inet nucleo_filtro 2>/dev/null || true; }

case "${1:-}" in
  aplicar)
    command -v nft >/dev/null || sudo apt-get install -y nftables
    for otro in ufw firewalld; do
      if systemctl is-active --quiet "$otro" 2>/dev/null; then
        echo "$otro está activo: desactívalo antes para no tener dos firewalls."; exit 1
      fi
    done
    sudo nft -c -f "$reglas"
    sudo systemctl stop "$revertir.timer" 2>/dev/null || true
    sudo nft -f "$reglas"
    sudo systemd-run --quiet --unit "$revertir" --on-active=180 \
      /usr/sbin/nft delete table inet nucleo_filtro
    echo "Reglas cargadas. Se quitan solas en 3 minutos."
    echo "Abre OTRA sesión SSH y, si entra, corre:  bash deploy/firewall.sh confirmar"
    ;;
  confirmar)
    sudo systemctl stop "$revertir.timer" 2>/dev/null || true
    sudo nft list table inet nucleo_filtro >/dev/null 2>&1 || {
      echo "Las reglas no están cargadas (¿pasaron los 3 minutos?). Corre de nuevo «aplicar»."; exit 1; }
    sudo install -d /etc/nucleo
    sudo install -m 644 "$reglas" "$fijo"
    sed "s#__REGLAS__#$fijo#g" "$raiz/deploy/nucleo-firewall.service" \
      | sudo tee /etc/systemd/system/nucleo-firewall.service >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable nucleo-firewall.service >/dev/null
    sudo systemctl start nucleo-firewall.service
    echo "Firewall confirmado: se carga al arrancar (nucleo-firewall.service)."
    ;;
  quitar)
    sudo systemctl disable --now nucleo-firewall.service 2>/dev/null || true
    sudo systemctl stop "$revertir.timer" 2>/dev/null || true
    quitar_tabla
    echo "Firewall quitado."
    ;;
  estado)
    sudo nft list table inet nucleo_filtro 2>/dev/null || echo "Firewall sin cargar."
    systemctl is-enabled nucleo-firewall.service 2>/dev/null || true
    ;;
  *)
    sed -n '2,13p' "$0"; exit 1 ;;
esac
