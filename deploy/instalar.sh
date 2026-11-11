#!/usr/bin/env bash
# Instala o actualiza Núcleo en el servidor. Se puede repetir sin romper nada.
# Requisitos: Docker, uv, nvm (Node 22), Caddy, .env raíz, BackEnd/.env
# (ver deploy/backend.env.ejemplo) y Mosquitto/certs + Mosquitto/config/passwd.
# Uso, desde la carpeta del proyecto:  bash deploy/instalar.sh
# La web se compila contra la API real; para volver a los datos simulados:
#   WEB_USE_MOCKS=true bash deploy/instalar.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
usuario="$(id -un)"
paso() { printf '\n== %s\n' "$1"; }
export DJANGO_SETTINGS_MODULE=config.settings.production

[[ -f "$raiz/.env" ]] || { echo "Falta .env en la raíz: corre bash deploy/restaurar.sh ~/traspaso"; exit 1; }
[[ -f "$raiz/BackEnd/.env" ]] || { echo "Falta BackEnd/.env: corre bash deploy/configurar_env.sh"; exit 1; }
if [[ ! -f "$raiz/Mosquitto/certs/ca.crt" || ! -f "$raiz/Mosquitto/config/passwd" ]]; then
  echo "Faltan los certificados o usuarios del broker: cópialos de tu PC o corre bash Mosquitto/preparar.sh"; exit 1
fi

paso "Contenedores: PostgreSQL, TimescaleDB, Redis y Mosquitto"
cd "$raiz"
docker compose up -d --wait postgres timescaledb redis
docker compose up -d mosquitto

paso "Backend: entorno de Python 3.12 y dependencias"
cd "$raiz/BackEnd"
[[ -x .venv/bin/python ]] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py migrate --database=iot --noinput
.venv/bin/python manage.py collectstatic --noinput
mkdir -p media

# URL pública de la API (primer origen de CORS_ALLOWED_ORIGINS): absoluta, para que el canal
# en vivo se abra en wss://nucleo.<tailnet>.ts.net/ws/panel/.
origen="$(sed -n 's/^CORS_ALLOWED_ORIGINS=\([^,]*\).*/\1/p' "$raiz/BackEnd/.env")"
[[ "$origen" == https://* ]] || { echo "CORS_ALLOWED_ORIGINS no trae la URL https del servidor"; exit 1; }

paso "Web: build de producción (mocks: ${WEB_USE_MOCKS:-false}, API: $origen/api/v1)"
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
cd "$raiz/FrontEnd"
npm ci --no-audit --no-fund
# Las variables del proceso tienen prioridad sobre FrontEnd/.env.
# VITE_DEMO_PASSWORD vacía: la pantalla de acceso no muestra las cuentas demo en internet.
VITE_API_BASE_URL="$origen/api/v1" VITE_USE_MOCKS="${WEB_USE_MOCKS:-false}" \
  VITE_MOCK_ROL="${WEB_MOCK_ROL:-SUPER}" VITE_DEMO_PASSWORD= \
  NODE_OPTIONS=--max-old-space-size=1536 npm run build

paso "Caddy y servicios de systemd (pide sudo)"
# Clave del puente de Nico AI; sin ella la ruta /puente-ia/ queda cerrada con una clave al azar.
puente="$(sed -n 's/^IA_PUENTE_CLAVE=//p' "$raiz/BackEnd/.env")"
clave_caddy="${puente:-$(openssl rand -hex 24)}"
plantilla() { sed -e "s#__RAIZ__#$raiz#g" -e "s#__USUARIO__#$usuario#g" -e "s#__PUENTE_CLAVE__#$clave_caddy#g" "$raiz/deploy/$1" | sudo tee "$2" >/dev/null; }
sudo install -d /etc/caddy/sitios
if ! grep -q 'import /etc/caddy/sitios/\*.caddy' /etc/caddy/Caddyfile 2>/dev/null; then
  printf '{\n\tauto_https off\n}\n\nimport /etc/caddy/sitios/*.caddy\n' | sudo tee /etc/caddy/Caddyfile >/dev/null
fi
plantilla nucleo.caddy /etc/caddy/sitios/nucleo.caddy
servicios=(nucleo-daphne nucleo-mqtt nucleo-sin-conexion)
for unidad in "${servicios[@]}" nucleo-reportes nucleo-respaldo; do
  plantilla "$unidad.service" "/etc/systemd/system/$unidad.service"
done
for unidad in nucleo-reportes nucleo-respaldo; do
  plantilla "$unidad.timer" "/etc/systemd/system/$unidad.timer"
done
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable "${servicios[@]}" nucleo-reportes.timer nucleo-respaldo.timer caddy
sudo systemctl restart "${servicios[@]}"
sudo systemctl start nucleo-reportes.timer nucleo-respaldo.timer
sudo systemctl reload-or-restart caddy

if [[ -n "$puente" ]]; then
  paso "IA local de Nico AI (Ollama, $(sed -n 's/^IA_MODELO_LOCAL=//p' "$raiz/BackEnd/.env" | grep . || echo qwen2.5:0.5b))"
  cd "$raiz"
  docker compose --profile ia up -d ollama
  modelo="$(sed -n 's/^IA_MODELO_LOCAL=//p' "$raiz/BackEnd/.env")"
  for _ in 1 2 3 4 5; do docker exec nucleo_ollama ollama list >/dev/null 2>&1 && break; sleep 2; done
  docker exec nucleo_ollama ollama pull "${modelo:-qwen2.5:0.5b}"
else
  # Sin clave el puente está apagado: Ollama no corre ni ocupa memoria.
  (cd "$raiz" && docker compose --profile ia stop ollama >/dev/null 2>&1 || true)
fi

paso "Comprobación"
sleep 3
curl -fsS -o /dev/null http://127.0.0.1:8081/ && echo "Web: OK"
curl -fsS http://127.0.0.1:8081/api/v1/health/ && echo
systemctl --no-pager --lines=0 status nucleo-mqtt | head -3
# Segunda máquina de Tailscale («nucleo») que publica Caddy :8081 con Funnel en el 443.
# La primera vez necesita TS_AUTHKEY en el .env raíz; después usa el estado guardado.
if grep -q '^TS_AUTHKEY=tskey-' "$raiz/.env" || docker volume inspect nucleo_tailscale_state >/dev/null 2>&1; then
  paso "Tailscale de Núcleo (Funnel en https://nucleo.<tailnet>.ts.net)"
  (cd "$raiz" && docker compose --profile servidor up -d tailscale)
else
  echo "Aviso: sin TS_AUTHKEY en .env no se publica Núcleo en internet."
fi
echo "Núcleo listo en http://127.0.0.1:8081"
