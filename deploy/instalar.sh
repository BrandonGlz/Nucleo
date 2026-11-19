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

# URL pública de la API (primer origen de CORS_ALLOWED_ORIGINS): absoluta, para que el canal
# en vivo se abra en wss://bynucleo.com/ws/panel/.
origen="$(sed -n 's/^CORS_ALLOWED_ORIGINS=\([^,]*\).*/\1/p' "$raiz/BackEnd/.env")"
[[ "$origen" == https://* ]] || { echo "CORS_ALLOWED_ORIGINS no trae la URL https del servidor"; exit 1; }

paso "Backend: variables de seguridad de BackEnd/.env"
# Se agregan solo si faltan (un .env de una versión anterior). La llave de cifrado se crea ANTES
# de migrar: la migración cifra los datos personales con ella.
agregar_env() {  # VARIABLE valor comentario
  grep -q "^$1=" "$raiz/BackEnd/.env" || printf '\n# %s\n%s=%s\n' "$3" "$1" "$2" >> "$raiz/BackEnd/.env"
}
if ! grep -q '^NUCLEO_CLAVE_CIFRADO=.' "$raiz/BackEnd/.env"; then
  sed -i '/^NUCLEO_CLAVE_CIFRADO=$/d' "$raiz/BackEnd/.env"
  agregar_env NUCLEO_CLAVE_CIFRADO "$(python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')" \
    "Llave de los datos cifrados en la base. GUARDA UNA COPIA FUERA DEL SERVIDOR: sin ella no se leen."
  echo "Se creó NUCLEO_CLAVE_CIFRADO en BackEnd/.env: guarda una copia en tu gestor de contraseñas."
fi
agregar_env NUCLEO_CONFIAR_CF_CONNECTING_IP True "IP real del visitante detrás de Cloudflare Tunnel (límites y bitácora)"
agregar_env NUCLEO_URL_WEB "$origen" "Web para el enlace de recuperación de contraseña"
chmod 600 "$raiz/BackEnd/.env"

paso "Backend: entorno de Python 3.12 y dependencias"
cd "$raiz/BackEnd"
[[ -x .venv/bin/python ]] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
# Modelo de Whisper para el dictado por voz de respaldo: se descarga aquí y no en la primera petición.
.venv/bin/python -c "from faster_whisper.utils import download_model; download_model('${NUCLEO_WHISPER_MODELO:-base}')" >/dev/null
# Voz de Nico (Piper, es_MX-ald-medium, masculina). Su .json trae "PhonemeType.ESPEAK" y Piper 1.8
# espera "espeak": se corrige al descargarla.
voces="$HOME/.local/share/nucleo/voces"
if [[ ! -s "$voces/es_MX-ald-medium.onnx" ]]; then
  mkdir -p "$voces"
  base_voz="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_MX/ald/medium/es_MX-ald-medium"
  curl -fsSL -o "$voces/es_MX-ald-medium.onnx.json" "$base_voz.onnx.json"
  curl -fsSL -o "$voces/es_MX-ald-medium.onnx" "$base_voz.onnx"
  sed -i 's/"PhonemeType.ESPEAK"/"espeak"/' "$voces/es_MX-ald-medium.onnx.json"
fi
.venv/bin/python manage.py check
.venv/bin/python manage.py migrate --noinput
.venv/bin/python manage.py migrate --database=iot --noinput
.venv/bin/python manage.py retencion_lecturas
.venv/bin/python manage.py collectstatic --noinput
mkdir -p media

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
# Clave del puente de Nico AI: con ella corre Ollama (la IA la llama el backend).
puente="$(sed -n 's/^IA_PUENTE_CLAVE=//p' "$raiz/BackEnd/.env")"
plantilla() { sed -e "s#__RAIZ__#$raiz#g" -e "s#__USUARIO__#$usuario#g" "$raiz/deploy/$1" | sudo tee "$2" >/dev/null; }
sudo install -d /etc/caddy/sitios
if ! grep -q 'import /etc/caddy/sitios/\*.caddy' /etc/caddy/Caddyfile 2>/dev/null; then
  printf '{\n\tauto_https off\n}\n\nimport /etc/caddy/sitios/*.caddy\n' | sudo tee /etc/caddy/Caddyfile >/dev/null
fi
plantilla nucleo.caddy /etc/caddy/sitios/nucleo.caddy
servicios=(nucleo-daphne nucleo-mqtt nucleo-sin-conexion)
temporizados=(nucleo-reportes nucleo-respaldo nucleo-prueba-restauracion nucleo-recursos)
for unidad in "${servicios[@]}" "${temporizados[@]}" nucleo-aviso@; do
  plantilla "$unidad.service" "/etc/systemd/system/$unidad.service"
done
for unidad in "${temporizados[@]}"; do
  plantilla "$unidad.timer" "/etc/systemd/system/$unidad.timer"
done
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
timers=("${temporizados[@]/%/.timer}")
sudo systemctl enable "${servicios[@]}" "${timers[@]}" caddy
sudo systemctl restart "${servicios[@]}"
sudo systemctl restart "${timers[@]}"
sudo systemctl reload-or-restart caddy
# Página de descarga del APK (app.bynucleo.com): se regenera por si cambió la plantilla deploy/descarga.html
if compgen -G "$raiz/deploy/descargas/nucleo-*.apk" >/dev/null; then
  bash "$raiz/deploy/compilar_apk.sh" --indice || true
fi

if [[ -n "$puente" ]]; then
  paso "IA local de Nico AI (Ollama, $(sed -n 's/^IA_MODELO_LOCAL=//p' "$raiz/BackEnd/.env" | grep . || echo qwen2.5:1.5b))"
  cd "$raiz"
  docker compose --profile ia up -d ollama
  modelo="$(sed -n 's/^IA_MODELO_LOCAL=//p' "$raiz/BackEnd/.env")"
  for _ in 1 2 3 4 5; do docker exec nucleo_ollama ollama list >/dev/null 2>&1 && break; sleep 2; done
  docker exec nucleo_ollama ollama pull "${modelo:-qwen2.5:1.5b}"
else
  # Sin clave el puente está apagado: Ollama no corre ni ocupa memoria.
  (cd "$raiz" && docker compose --profile ia stop ollama >/dev/null 2>&1 || true)
fi

paso "Comprobación"
sleep 3
curl -fsS -o /dev/null http://127.0.0.1:8081/ && echo "Web: OK"
curl -fsS http://127.0.0.1:8081/api/v1/health/ && echo
systemctl --no-pager --lines=0 status nucleo-mqtt | head -3
# Dominio propio con Cloudflare Tunnel (https://bynucleo.com): con CLOUDFLARE_TUNEL (ID del túnel)
# en el .env raíz y sus credenciales en /etc/cloudflared/<ID>.json (ver deploy/README.md).
tunel="$(sed -n 's/^CLOUDFLARE_TUNEL=//p' "$raiz/.env")"
if [[ -n "$tunel" ]] && command -v cloudflared >/dev/null; then
  paso "Cloudflare Tunnel de Núcleo (https://bynucleo.com)"
  sed "s#__TUNEL__#$tunel#g" "$raiz/deploy/cloudflared.yml" | sudo tee /etc/cloudflared/config.yml >/dev/null
  [[ -f /etc/systemd/system/cloudflared.service ]] || sudo cloudflared service install
  sudo systemctl enable cloudflared >/dev/null
  sudo systemctl restart cloudflared
fi
echo "Núcleo listo en http://127.0.0.1:8081"
