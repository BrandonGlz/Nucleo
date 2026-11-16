#!/usr/bin/env bash
# Trae main de GitHub y vuelve a instalar Núcleo. Producción siempre corre main; dev es para
# probar en local y pasa a main cuando está lista (ver Context/equipo/flujo-de-trabajo.md).
# Uso:  bash deploy/desplegar.sh
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Hay cambios sin commit en el servidor; no se despliega." >&2
  exit 1
fi
git fetch origin main
git checkout -q main
git merge --ff-only origin/main
exec bash "$raiz/deploy/instalar.sh"
