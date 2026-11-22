# Funciones comunes de los respaldos remotos de asus (se carga con «source»; no se ejecuta sola).
# Se instala en /usr/local/lib/respaldo-remoto/comun.sh (copia de referencia en deploy/dos-equipos/).
# asus saca los datos de lenovo por SSH (Tailscale) y los guarda/sube desde aquí.
LENOVO="${LENOVO:-${NUCLEO_SERVIDOR:-adminlenovo@100.107.247.90}}"
# Una sola conexión TCP reutilizada (ControlMaster) para todas las órdenes de una ejecución: menos
# conexiones nuevas sobre un Wi-Fi que a veces tarda en abrirlas.
SSH_CTL="${XDG_RUNTIME_DIR:-/tmp}/respaldo-remoto-%C"
SSH_OPC=(-o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=8
         -o ControlMaster=auto -o "ControlPath=$SSH_CTL" -o ControlPersist=120)

en_lenovo() { ssh "${SSH_OPC[@]}" "$LENOVO" "$@"; }

# traer <archivo destino> <orden remota>: guarda la salida de la orden en un temporal y lo renombra
# solo si terminó bien. Reintenta (el Wi-Fi entre laptops es variable y Tailscale
# a veces tarda en rehacer la conexión directa): 5 intentos, 60 s entre uno y otro.
traer() {
  local archivo="$1" orden="$2" intento
  for intento in 1 2 3 4 5; do
    if en_lenovo "$orden" > "$archivo.parcial" && [[ -s "$archivo.parcial" ]]; then
      mv "$archivo.parcial" "$archivo"; return 0
    fi
    echo "Falló la descarga de $(basename "$archivo") (intento $intento/5)"; (( intento < 5 )) && sleep 60
  done
  rm -f "$archivo.parcial"; echo "No se pudo obtener $(basename "$archivo") de lenovo"; return 1
}

# volcado <contenedor en lenovo> <archivo destino>: pg_dump -Fc con nice del lado de lenovo.
volcado() {
  traer "$2" "nice -n 10 docker exec $1 sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'"
  revisar_dump "$2"
}

# revisar_dump <archivo>: comprueba que pg_restore pueda leer el índice (asus no tiene cliente de
# PostgreSQL instalado: usa la imagen postgres:17 sin red).
revisar_dump() {
  local n
  n="$(docker run --rm -i --network none postgres:17 pg_restore -l < "$1" | grep -vc '^;')" \
    || { echo "FALLA: $(basename "$1") no es un volcado válido"; return 1; }
  echo "$(basename "$1"): $(du -h "$1" | cut -f1), $n objetos en el índice"
}

# tar_trae <archivo> <entrada>: ¿el tar.gz contiene esa entrada exacta?
tar_trae() { tar -tzf "$1" | grep -cx "$2" >/dev/null; }

# revisar_tar <archivo>
revisar_tar() {
  local n
  n="$(tar -tzf "$1" | wc -l)" || { echo "FALLA: $(basename "$1") está dañado"; return 1; }
  echo "$(basename "$1"): $(du -h "$1" | cut -f1), $n entradas"
}

# revisar_zip_semanal <zip>: comprueba el CRC de cada entrada (python -m zipfile -t), que traiga CONTENIDO.txt y que
# cada nota «<tipo> - igual que <día>.txt» (tar que no cambió y no se volvió a meter) apunte con su línea
# «Archivo en el zip: <día>/<archivo>» a un archivo que sí está en el zip. Lo usan respaldo-semanal y las pruebas
# de restauración.
revisar_zip_semanal() {
  python3 -I -m zipfile -t "$1" >/dev/null || { echo "FALLA: $(basename "$1") no pasó la comprobación de CRC"; return 1; }
  python3 -I - "$1" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    nombres = set(z.namelist())
    notas = sorted(n for n in nombres if ' - igual que ' in n and n.endswith('.txt'))
    malas = [] if 'CONTENIDO.txt' in nombres else ['CONTENIDO.txt (falta)']
    for n in notas:
        ref = [l.split(':', 1)[1].strip() for l in z.read(n).decode().splitlines() if l.startswith('Archivo en el zip:')]
        if not ref or ref[0] not in nombres:
            malas.append(f'{n} -> {ref[0] if ref else "?"}')
if malas:
    print('FALLA: notas que apuntan a un archivo que no está en el zip: ' + '; '.join(malas))
    sys.exit(1)
print(f'{len(notas)} notas «igual que», todas apuntan a un archivo del zip')
PY
}

# subir <archivo> <remoto:carpeta>: sube un archivo (el zip semanal) a Google Drive y comprueba que llegó
# completo. asus sale a internet por un Wi-Fi débil y rclone usa el cliente compartido de Google (límite de
# peticiones por minuto entre todos sus usuarios): se limitan las peticiones (--tpslimit), una subida
# atorada se corta a los 2 min sin avance (--timeout) y se reintenta, con un tope de 40 min en total.
# La comprobación compara el hash del archivo local con el de Drive (en un remoto cifrado, «cryptcheck»
# cifra el local con la misma llave y lo compara con lo que hay allá).
RCLONE_RED=(--tpslimit 4 --tpslimit-burst 4 --timeout 2m --contimeout 30s --low-level-retries 20)
RCLONE_OPC=("${RCLONE_RED[@]}" --retries 3 --retries-sleep 30s --stats 2m --stats-one-line -v)
# los errores de Google traen un JSON largo: solo se dejan las líneas útiles
filtrar_rclone() { grep -vE '^\s*$|^\s*[][{}]|"@type"|"(reason|domain|metadata|quota_|consumer|service)|^Details:' "$1" || true; }
subir() {
  local archivo="$1" destino="$2" intento ok salida fin=$(( SECONDS + 2400 )) revisar=check
  salida="$(mktemp)"
  [[ "$(rclone listremotes --long | awk -v r="${destino%%:*}:" '$1 == r {print $2}')" == crypt ]] && revisar=cryptcheck
  for intento in $(seq 10); do
    ok=0; rclone copy "$archivo" "$destino" "${RCLONE_OPC[@]}" > "$salida" 2>&1 || ok=$?
    filtrar_rclone "$salida"
    if (( ok == 0 )); then
      rclone "$revisar" "$(dirname "$archivo")" "$destino" --one-way --include "/$(basename "$archivo")" \
        "${RCLONE_RED[@]}" > "$salida" 2>&1 || ok=$?
      (( ok == 0 )) && break
      filtrar_rclone "$salida"; echo "La copia en Drive no coincide con la local ($revisar)"
    fi
    if (( intento == 10 || SECONDS + 60 >= fin )); then
      rm -f "$salida"; echo "No se pudo subir a Google Drive (queda en el equipo; se puede volver a correr a mano)"; return 1
    fi
    echo "Sin acceso a Google Drive; reintento en 60 s ($intento/10)"; sleep 60
  done
  rm -f "$salida"
  echo "Copiado a Google Drive: $destino/$(basename "$archivo") (verificado con $revisar)"
}

# limpiar_drive <remoto:carpeta> <edad> [opciones de rclone]: borra allá lo más viejo que <edad> (p. ej. 33d).
limpiar_drive() {
  local destino="$1" edad="$2"; shift 2
  rclone delete "$destino" --min-age "$edad" "${RCLONE_RED[@]}" "$@" 2>&1 | grep -v '^\s*$' || true
}

# datos_contenedor <nombre>: "imagen usuario base" del contenedor de producción en lenovo; si lenovo no
# contesta, del contenedor viejo del mismo nombre en asus (detenido, mismas imágenes y usuarios).
datos_contenedor() {
  local d
  d="$(en_lenovo "docker inspect $1 --format '{{.Config.Image}}' && docker exec $1 sh -c 'echo \$POSTGRES_USER; echo \$POSTGRES_DB'" 2>/dev/null | paste -sd' ')" || d=""
  if [[ $(wc -w <<<"$d") -ne 3 ]]; then
    d="$(docker inspect "$1" --format '{{.Config.Image}}{{range .Config.Env}} {{.}}{{end}}' 2>/dev/null \
      | awk '{u=d=""; for(i=2;i<=NF;i++){ if($i~/^POSTGRES_USER=/)u=substr($i,15); if($i~/^POSTGRES_DB=/)d=substr($i,13)} print $1, u, d}')" || d=""
    [[ $(wc -w <<<"$d") -ne 3 ]] || echo "(lenovo no contesta: imagen y usuario tomados del contenedor $1 de asus)" >&2
  fi
  echo "$d"
}
