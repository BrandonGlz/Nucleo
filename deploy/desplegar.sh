#!/usr/bin/env bash
# Trae los cambios de GitHub y vuelve a instalar Núcleo.
# Uso:  bash deploy/desplegar.sh          (rama actual, normalmente dev)
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"
git pull --ff-only
exec bash "$raiz/deploy/instalar.sh"
