#!/usr/bin/env bash
# Genera el APK de la app móvil en la laptop y lo publica en deploy/descargas/ (lo entrega Caddy en /app/).
# Usa la configuración del perfil "piloto" de Mobile/eas.json (API de producción) y firma con la llave
# de ~/nucleo-app, que no va a git y entra en el respaldo diario. La primera vez crea la llave.
# Solo consume memoria mientras compila (unos 3-4 GB, 15-25 min); al terminar no queda nada corriendo.
#   bash deploy/compilar_apk.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
firma="${NUCLEO_FIRMA:-$HOME/nucleo-app}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}" ANDROID_SDK_ROOT="${ANDROID_HOME:-$HOME/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export NVM_DIR="$HOME/.nvm"; [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
bajo() { nice -n 19 ionice -c3 "$@"; }  # prioridad baja: la web y la API siguen atendiendo primero

# Llave de firma: Android solo actualiza la app si cada versión viene firmada con la misma.
if [[ ! -f "$firma/nucleo.keystore" ]]; then
  install -d -m 700 "$firma"
  clave="$(openssl rand -hex 24)"
  keytool -genkeypair -v -keystore "$firma/nucleo.keystore" -alias nucleo -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$clave" -keypass "$clave" -dname "CN=Nucleo, O=Nucleo, C=MX" >/dev/null
  printf 'FIRMA_CLAVE=%s\n' "$clave" > "$firma/firma.env"
  chmod 600 "$firma/nucleo.keystore" "$firma/firma.env"
  echo "Llave de firma creada en $firma (respáldala: sin ella no se puede actualizar la app instalada)"
fi
# shellcheck disable=SC1091
. "$firma/firma.env"

cd "$raiz/Mobile"
bajo npm ci --no-audit --no-fund
# Variables EXPO_PUBLIC_* del perfil piloto (URL de la API de producción, sin datos simulados)
eval "$(node -e 'const e = require("./eas.json").build.piloto.env; for (const [k, v] of Object.entries(e)) console.log(`export ${k}=${JSON.stringify(v)}`)')"
version="$(node -p 'require("./app.json").expo.version')"
echo "Compilando Núcleo $version contra $EXPO_PUBLIC_API_BASE_URL"

CI=1 NODE_ENV=production bajo npx expo prebuild --platform android --clean --no-install
git -C "$raiz" checkout -- Mobile/package.json  # prebuild cambia los scripts de npm; no es parte del proyecto

cd android
bajo ./gradlew assembleRelease --no-daemon -Dorg.gradle.workers.max=2 \
  -Pandroid.injected.signing.store.file="$firma/nucleo.keystore" \
  -Pandroid.injected.signing.store.password="$FIRMA_CLAVE" \
  -Pandroid.injected.signing.key.alias=nucleo \
  -Pandroid.injected.signing.key.password="$FIRMA_CLAVE"
pkill -u "$(id -u)" -f KotlinCompileDaemon || true  # que no quede memoria ocupada después

# Se publica con nombre fijo (enlace que no cambia) y se guarda una copia por versión
install -d "$raiz/deploy/descargas"
cp app/build/outputs/apk/release/app-release.apk "$raiz/deploy/descargas/nucleo-$version.apk"
cp "$raiz/deploy/descargas/nucleo-$version.apk" "$raiz/deploy/descargas/.nucleo.apk.tmp"
mv -f "$raiz/deploy/descargas/.nucleo.apk.tmp" "$raiz/deploy/descargas/nucleo.apk"
ls -lh "$raiz/deploy/descargas"
echo "Listo: versión $version publicada en /app/nucleo.apk y guardada como deploy/descargas/nucleo-$version.apk"
