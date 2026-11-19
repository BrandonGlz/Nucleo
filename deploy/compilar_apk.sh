#!/usr/bin/env bash
# Genera el APK de la app móvil en la laptop y lo publica en deploy/descargas/ (lo entrega Caddy en app.bynucleo.com).
# Usa la configuración del perfil "piloto" de Mobile/eas.json (API de producción) y firma con la llave
# de ~/nucleo-app, que no va a git y entra en el respaldo diario. La primera vez crea la llave.
# Solo consume memoria mientras compila; al terminar no queda nada corriendo.
# Es incremental: reinstala dependencias y regenera android/ solo si cambiaron, y Gradle reutiliza lo ya
# compilado. Subir la versión de app.json no regenera android/: se copia a android/app/build.gradle.
# Un cambio solo de pantallas o de versión tarda pocos minutos; la primera vez o con --limpio, bastante más.
# El APK piloto va sin R8 (más rápido de compilar, APK algo más grande) y el C++ usa ccache si está instalado.
#   bash deploy/compilar_apk.sh            compila si Mobile/ cambió desde el último APK publicado
#   bash deploy/compilar_apk.sh --forzar   compila aunque no haya cambios
#   bash deploy/compilar_apk.sh --limpio   borra node_modules y android/ y compila todo desde cero
#   bash deploy/compilar_apk.sh --indice   solo regenera la página de descarga con el APK ya compilado (sin compilar)
set -euo pipefail

forzar=0; limpio=0; solo_indice=0
for a in "$@"; do
  case $a in
    --forzar) forzar=1 ;;
    --limpio) limpio=1; forzar=1 ;;
    --indice) solo_indice=1 ;;
    *) echo "Opción desconocida: $a (usa --forzar, --limpio o --indice)" >&2; exit 2 ;;
  esac
done

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
descargas="$raiz/deploy/descargas"

# La raíz de app.bynucleo.com (index.html, desde la plantilla deploy/descarga.html) lleva al APK de la
# versión, que se descarga como nucleo-<versión>.apk
publicar_indice() {
  local v="$1" tamano
  tamano="$(du -m "$descargas/nucleo-$v.apk" | cut -f1) MB"
  install -d "$descargas/fuentes"
  cp "$raiz"/FrontEnd/src/design-system/fuentes/PlusJakartaSans-{400,600,700}.woff2 "$descargas/fuentes/"
  sed -e "s/__VERSION__/$v/g" -e "s/__TAMANO__/$tamano/g" "$raiz/deploy/descarga.html" > "$descargas/.index.html.tmp"
  mv -f "$descargas/.index.html.tmp" "$descargas/index.html"
}

if (( solo_indice )); then
  version="$(node -p 'require(process.argv[1]).expo.version' "$raiz/Mobile/app.json" 2>/dev/null \
    || python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["expo"]["version"])' "$raiz/Mobile/app.json")"
  # Si la versión de app.json aún no se compila, se queda la más reciente ya compilada
  if [[ ! -f "$descargas/nucleo-$version.apk" ]]; then
    version="$(find "$descargas" -maxdepth 1 -name 'nucleo-*.apk' -printf '%f\n' | sed 's/^nucleo-//; s/\.apk$//' | sort -V | tail -1)"
    [[ -n "$version" ]] || { echo "No hay ningún APK compilado en deploy/descargas" >&2; exit 1; }
  fi
  publicar_indice "$version"
  rm -f "$descargas/nucleo.apk"  # nombre fijo anterior: ahora /nucleo.apk lleva a la raíz
  echo "Descarga apuntada a nucleo-$version.apk"
  exit 0
fi
firma="${NUCLEO_FIRMA:-$HOME/nucleo-app}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}" ANDROID_SDK_ROOT="${ANDROID_HOME:-$HOME/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export NVM_DIR="$HOME/.nvm"; [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
bajo() { nice -n 19 ionice -c2 -n7 "$@"; }  # prioridad baja: la web y la API siguen atendiendo primero
# ccache guarda el C++ ya compilado (la app y React Native) entre builds, aunque android/ se regenere.
# Lo usa el CMake de la app (React Native lo busca en el PATH); NDK_CCACHE cubre lo que use ndk-build.
if ccache_bin="$(command -v ccache)"; then
  export NDK_CCACHE="$ccache_bin" CCACHE_DIR="$HOME/.cache/ccache" CCACHE_MAXSIZE=3G
fi
# La caché local de Gradle borra lo que no se usó en 7 días; con builds espaciadas se perdía. Se sube a 30.
init_gradle="$HOME/.gradle/init.d/nucleo-cache-30-dias.gradle"
if [[ ! -f "$init_gradle" ]]; then
  install -d "$(dirname "$init_gradle")"
  cat > "$init_gradle" <<'GRADLE'
// Creado por deploy/compilar_apk.sh de Núcleo: conserva 30 días lo que no se usa en las cachés de Gradle
beforeSettings { settings ->
    settings.caches {
        createdResources.removeUnusedEntriesAfterDays = 30
        buildCache.removeUnusedEntriesAfterDays = 30
    }
}
GRADLE
fi

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
# app.json sin expo.version ni expo.android.versionCode: cada cambio móvil las sube y no son configuración
# nativa (se copian a build.gradle sin regenerar android/)
app_json_sin_version() {
  node -e 'const a = require(require("path").resolve(process.argv[1])); delete a.expo.version; if (a.expo.android) delete a.expo.android.versionCode; console.log(JSON.stringify(a))' "${1:-app.json}"
}
# Huellas: dependencias (lock), parte nativa (todo Mobile/ menos el código JS y la versión) y el APK completo
h_npm=$(huella < package-lock.json)
h_nativo=$({ git ls-files -s -- . ':!src' ':!App.js' ':!index.js' ':!README.md' ':!package.json' ':!app.json'; app_json_sin_version; sha256sum google-services.json 2>/dev/null; } | huella)
h_apk=$({ git rev-parse HEAD:Mobile; git status --porcelain -- .; echo "$abis"; sha256sum "$raiz/deploy/compilar_apk.sh"; sha256sum google-services.json 2>/dev/null; } | huella)
ultima="$descargas/.huella"

if (( ! forzar )) && [[ -f "$descargas/index.html" && "$(cat "$ultima" 2>/dev/null)" == "$h_apk" ]]; then
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
codigo="$(node -p 'require("./app.json").expo.android.versionCode')"
echo "Compilando Núcleo $version contra $EXPO_PUBLIC_API_BASE_URL"

# Compilación completa (android/ nuevo): 1 tarea a la vez para que el pico de RAM no se acerque al total
# del servidor (con 2 llegaba a ~7 GB de 7.6). La incremental usa poca memoria y va con 2.
# NUCLEO_HILOS fuerza el número (para medir la memoria de una completa con 2 sin R8).
hilos=2
if [[ "$(cat android/.huella 2>/dev/null)" != "$h_nativo" ]]; then
  hilos=1
  # --clean solo con cambios nativos reales (dependencias, plugins, resto de app.json) o con --limpio
  CI=1 NODE_ENV=production bajo npx expo prebuild --platform android --clean --no-install
  git -C "$raiz" checkout -- Mobile/package.json  # prebuild cambia los scripts de npm; no es parte del proyecto
  echo "$h_nativo" > android/.huella
else
  echo "Configuración nativa sin cambios: se reutiliza android/ (compilación incremental)"
fi
hilos="${NUCLEO_HILOS:-$hilos}"
# La versión va directo a build.gradle (lo que hace prebuild con ella), así no se regenera android/
sed -i -E -e "s/^([[:space:]]*)versionCode [0-9]+\$/\1versionCode $codigo/" \
  -e "s/^([[:space:]]*)versionName \"[^\"]*\"\$/\1versionName \"$version\"/" android/app/build.gradle
grep -qE "^[[:space:]]*versionCode $codigo\$" android/app/build.gradle \
  && grep -qE "^[[:space:]]*versionName \"$version\"\$" android/app/build.gradle \
  || { echo "No se pudo poner la versión $version ($codigo) en android/app/build.gradle; usa --limpio" >&2; exit 1; }
# Caché de Gradle (reutiliza tareas ya compiladas aunque android/ se regenere) y Kotlin dentro del
# proceso de Gradle, en lugar de un segundo proceso Java aparte: menos memoria en el pico
grep -q '^org.gradle.caching=' android/gradle.properties || printf '\norg.gradle.caching=true\nkotlin.compiler.execution.strategy=in-process\n' >> android/gradle.properties
sed -i 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=768m/' android/gradle.properties
# Sin R8 en el APK piloto: era el paso más lento (~6 min). shrinkResources necesita minify, así que también se apaga.
for p in android.enableMinifyInReleaseBuilds android.enableShrinkResourcesInReleaseBuilds; do
  if grep -q "^$p=" android/gradle.properties; then
    sed -i "s/^$p=.*/$p=false/" android/gradle.properties
  else
    echo "$p=false" >> android/gradle.properties
  fi
done

cd android
# Solo arm64-v8a: la de todos los celulares Android actuales (A56, S24 Ultra, Redmi 10). Compilar las 4
# arquitecturas tarda el doble; para agregar otra: NUCLEO_ABIS=arm64-v8a,armeabi-v7a bash deploy/compilar_apk.sh
# Sin lintVitalRelease: revisa el código en cada build y no cambia el APK
bajo ./gradlew assembleRelease -x lintVitalRelease --no-daemon --build-cache -Dorg.gradle.workers.max="$hilos" \
  -PreactNativeArchitectures="$abis" \
  -Pandroid.injected.signing.store.file="$firma/nucleo.keystore" \
  -Pandroid.injected.signing.store.password="$FIRMA_CLAVE" \
  -Pandroid.injected.signing.key.alias=nucleo \
  -Pandroid.injected.signing.key.password="$FIRMA_CLAVE"
pkill -u "$(id -u)" -f KotlinCompileDaemon || true  # que no quede memoria ocupada después

# Se guarda con la versión en el nombre (así se descarga) y la raíz del subdominio pasa a apuntarle;
# el enlace https://app.bynucleo.com no cambia
install -d "$descargas"
cp app/build/outputs/apk/release/app-release.apk "$descargas/.nucleo-$version.apk.tmp"
mv -f "$descargas/.nucleo-$version.apk.tmp" "$descargas/nucleo-$version.apk"
publicar_indice "$version"
rm -f "$descargas/nucleo.apk"
echo "$h_apk" > "$ultima"
ls -lh "$descargas"
echo "Listo: versión $version publicada en https://app.bynucleo.com y guardada como deploy/descargas/nucleo-$version.apk"
