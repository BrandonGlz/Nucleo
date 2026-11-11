#!/usr/bin/env bash
# Genera el APK de la app móvil en la laptop y lo publica en deploy/descargas/ (lo entrega Caddy en /app/).
# Usa la configuración del perfil "piloto" de Mobile/eas.json (API de producción) y firma con la llave
# de ~/nucleo-app, que no va a git y entra en el respaldo diario. La primera vez crea la llave.
# Solo consume memoria mientras compila; al terminar no queda nada corriendo.
# Es incremental: reinstala dependencias y regenera android/ solo si cambiaron, y Gradle reutiliza lo ya
# compilado. Un cambio solo de pantallas tarda ~1 min; la primera vez o con --limpio, bastante más.
#   bash deploy/compilar_apk.sh            compila si Mobile/ cambió desde el último APK publicado
#   bash deploy/compilar_apk.sh --forzar   compila aunque no haya cambios
#   bash deploy/compilar_apk.sh --limpio   borra node_modules y android/ y compila todo desde cero
set -euo pipefail

forzar=0; limpio=0
for a in "$@"; do
  case $a in
    --forzar) forzar=1 ;;
    --limpio) limpio=1; forzar=1 ;;
    *) echo "Opción desconocida: $a (usa --forzar o --limpio)" >&2; exit 2 ;;
  esac
done

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
abis="${NUCLEO_ABIS:-arm64-v8a}"
huella() { sha256sum | cut -c1-16; }
# Huellas: dependencias (lock), parte nativa (todo Mobile/ menos el código JS) y el APK completo
h_npm=$(huella < package-lock.json)
h_nativo=$({ git ls-files -s -- . ':!src' ':!App.js' ':!index.js' ':!README.md' ':!package.json'; sha256sum google-services.json 2>/dev/null; } | huella)
h_apk=$({ git rev-parse HEAD:Mobile; git status --porcelain -- .; echo "$abis"; sha256sum "$raiz/deploy/compilar_apk.sh"; sha256sum google-services.json 2>/dev/null; } | huella)
ultima="$raiz/deploy/descargas/.huella"

if (( ! forzar )) && [[ -f "$raiz/deploy/descargas/nucleo.apk" && "$(cat "$ultima" 2>/dev/null)" == "$h_apk" ]]; then
  echo "Sin cambios en Mobile/ desde el último APK publicado; no se compila (usa --forzar para compilar igual)."
  exit 0
fi
# Mientras compila se apaga la IA de Nico AI (Ollama) para dejarle la memoria a Gradle; al
# terminar (bien o mal) se vuelve a encender si estaba corriendo.
if docker ps --format '{{.Names}}' | grep -qx nucleo_ollama; then
  echo "Se apaga la IA de Nico AI mientras compila"
  docker stop nucleo_ollama >/dev/null
  trap 'echo "Se enciende de nuevo la IA de Nico AI"; docker start nucleo_ollama >/dev/null' EXIT
fi
if (( limpio )); then
  echo "Compilación desde cero: se borran node_modules y android/"
  rm -rf node_modules android
fi

if [[ "$(cat node_modules/.huella 2>/dev/null)" != "$h_npm" ]]; then
  bajo npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000  # reintenta si la red se corta
  echo "$h_npm" > node_modules/.huella
else
  echo "Dependencias sin cambios: se reutiliza node_modules"
fi
# Variables EXPO_PUBLIC_* del perfil piloto (URL de la API de producción, sin datos simulados)
eval "$(node -e 'const e = require("./eas.json").build.piloto.env; for (const [k, v] of Object.entries(e)) console.log(`export ${k}=${JSON.stringify(v)}`)')"
version="$(node -p 'require("./app.json").expo.version')"
echo "Compilando Núcleo $version contra $EXPO_PUBLIC_API_BASE_URL"

# Compilación completa (android/ nuevo): 1 tarea a la vez para que el pico de RAM no se acerque al total
# del servidor (con 2 llegaba a ~7 GB de 7.6). La incremental usa poca memoria y va con 2.
hilos=2
if [[ "$(cat android/.huella 2>/dev/null)" != "$h_nativo" ]]; then
  hilos=1
  CI=1 NODE_ENV=production bajo npx expo prebuild --platform android --clean --no-install
  git -C "$raiz" checkout -- Mobile/package.json  # prebuild cambia los scripts de npm; no es parte del proyecto
  echo "$h_nativo" > android/.huella
else
  echo "Configuración nativa sin cambios: se reutiliza android/ (compilación incremental)"
fi
# Caché de Gradle (reutiliza tareas ya compiladas aunque android/ se regenere) y Kotlin dentro del
# proceso de Gradle, en lugar de un segundo proceso Java aparte: menos memoria en el pico
grep -q '^org.gradle.caching=' android/gradle.properties || printf '\norg.gradle.caching=true\nkotlin.compiler.execution.strategy=in-process\n' >> android/gradle.properties
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m/' android/gradle.properties

cd android
# Solo arm64-v8a: la de todos los celulares Android actuales (A56, S24 Ultra, Redmi 10). Compilar las 4
# arquitecturas tarda el doble; para agregar otra: NUCLEO_ABIS=arm64-v8a,armeabi-v7a bash deploy/compilar_apk.sh
bajo ./gradlew assembleRelease --no-daemon --build-cache -Dorg.gradle.workers.max="$hilos" \
  -PreactNativeArchitectures="$abis" \
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
echo "$h_apk" > "$ultima"
ls -lh "$raiz/deploy/descargas"
echo "Listo: versión $version publicada en /app/nucleo.apk y guardada como deploy/descargas/nucleo-$version.apk"
