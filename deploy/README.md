# Servidor de Núcleo

Núcleo corre en dos laptops con Debian 13, unidas por Tailscale:

| Equipo | Hardware | Papel |
| --- | --- | --- |
| **Servidor** (`lenovo`) | Intel Core i5-12450H, 8 GB de RAM, NVMe de 512 GB | Atiende todo: web, API, bases, broker, Ollama y el túnel |
| **Equipo de compilación y respaldo** (`asus`) | Intel Core i5-3230M, 8 GB de RAM, HDD de 750 GB | Compila la web y el APK, despliega, respalda, prueba las restauraciones y vigila |

Se publica en internet con un Cloudflare Tunnel en el dominio `bynucleo.com`, sin puertos abiertos
en el router, así que se llega desde cualquier red. Núcleo no usa Tailscale para las visitas; el
Tailscale de los equipos solo sirve para entrar por SSH y para que el equipo de compilación hable
con el servidor. Los dos equipos están unidos además por un cable Ethernet directo (en el servidor, un
adaptador USB de 10/100; `10.77.77.1/30` y `10.77.77.2/30`, sin ruta por defecto ni DNS, perfiles de
NetworkManager `enlace-asus` y `enlace-lenovo`): Tailscale lo descubre solo y su tráfico entre ellos
va por ahí (~2 ms y ~84 Mbit/s, contra ~13 ms y ~30 Mbit/s por el Wi-Fi). Cada uno sigue saliendo a
internet por su Wi-Fi, y el firewall solo deja entrar por Tailscale, también por el cable.

| Qué | Dirección |
| --- | --- |
| Web | https://bynucleo.com (`www.` redirige aquí) |
| API (la usa la app) | https://bynucleo.com/api/v1 |
| Admin de Django | https://bynucleo.com/admin/ |
| Descarga de la app | https://app.bynucleo.com (`bynucleo.com/app/…` redirige aquí) |
| Landing (información y planes) | https://info.bynucleo.com |
| Consola de Nico AI | https://nicoai.bynucleo.com (solo superusuario) |
| Consola de administración | https://admin.bynucleo.com (solo superusuario: seguridad, accesos, equipos) |
| ESP32 (MQTT en WebSocket) | `wss://dispositivos.bynucleo.com/mqtt` |

## Acceso

### Web (cualquier red)

Abre la URL desde cualquier navegador; no hace falta instalar nada.

### SSH (cualquier red)

1. Instala Tailscale e inicia sesión en la tailnet del servidor:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
   ```

   En Windows y macOS: https://tailscale.com/download. En Android e iOS: app **Tailscale**.
2. Entra al equipo que necesites:

   ```bash
   ssh adminlenovo@100.107.247.90   # servidor (producción)
   ssh adminasus@100.65.53.53       # equipo de compilación y respaldo
   ```

SSH entra con llave o contraseña y **solo por Tailscale**: el firewall de los dos equipos cierra
todo lo que llega de la red de la casa ([Firewall](#firewall)). `root` no puede entrar por SSH.
El equipo de compilación tiene su llave autorizada en el servidor, así que sus scripts entran sin
contraseña (`BatchMode`).

## Cómo está armado

### Reparto entre los dos equipos

Regla de diseño: los equipos se hablan por Tailscale (por el cable directo, ~2 ms; si se desconecta,
por el Wi-Fi, con latencias que van de unos milisegundos a casi un segundo). Por eso **todo lo que se consulta muchas veces por petición vive
en el servidor** (API, bases, Redis, broker, Ollama) y entre los equipos solo viajan órdenes,
volcados, la web compilada y el APK.

| Pieza | Servidor | Equipo de compilación |
| --- | :---: | :---: |
| Túnel `cloudflared`, Caddy, web compilada y APK publicado | ✅ | |
| Daphne, `nucleo-mqtt`, `nucleo-sin-conexion`, reportes, `vigilar_recursos.sh` | ✅ | |
| PostgreSQL, TimescaleDB, Redis, Mosquitto y Ollama (Docker) | ✅ | |
| Compilación de la web y del APK, llave de firma de la app (`~/nucleo-app`) | | ✅ |
| Despliegue (`desplegar-nucleo`) y build (`compilar-apk-nucleo`) | | ✅ |
| Respaldos a Drive y prueba de restauración mensual | | ✅ |
| Vigilante externo (`vigia`) | | ✅ |

Si el equipo de compilación se apaga, los usuarios no lo notan: solo se pausan los despliegues,
las builds, los respaldos y el vigilante (el vigía de GitHub sigue avisando). Si el servidor se
cae, se cae Núcleo y el vigilante avisa por correo; no hay conmutación automática.

### Servidor

- Todo llega por el Cloudflare Tunnel `nucleo` (servicio `cloudflared`, configuración
  `deploy/cloudflared.yml` → `/etc/cloudflared/config.yml`). Usa `protocol: http2` (TCP) en lugar
  de QUIC porque el servidor va por Wi-Fi y QUIC se corta cuando baja la señal:
  - `bynucleo.com` y `www.` → Caddy (`127.0.0.1:8081`), que manda `http://` a `https://` y `www`
    al dominio principal.
  - `app.bynucleo.com` → Caddy, que entrega `deploy/descargas/` (la raíz lleva a `nucleo-<versión>.apk`).
  - `info.bynucleo.com` → Caddy, que entrega la landing estática de `Landing/` (sin build; se publica
    con el mismo deploy).
  - `nicoai.bynucleo.com` → Caddy, igual que `bynucleo.com`: es la misma web compilada, que al ver ese
    host abre la consola de Nico AI (solo el superusuario, rol administrador de plataforma).
  - `admin.bynucleo.com` → Caddy, igual: la misma web abre la consola de administración (seguridad,
    usuarios, sesiones, equipos ESP32, bitácora, integraciones y política; solo el superusuario).
  - `dispositivos.bynucleo.com/mqtt` → directo al listener WebSocket de Mosquitto
    (`127.0.0.1:51884`). El resto de ese subdominio pasa por Caddy, que solo deja el respaldo
    HTTPS de Nico, la actualización del firmware y la hora (`/api/v1/puente/`, `/api/v1/health/`)
    y lo demás lo manda a la web.
- Los DNS son CNAME del túnel en Cloudflare: `cloudflared tunnel route dns nucleo <host>` por cada
  nombre (`bynucleo.com`, `www`, `app`, `info`, `nicoai`, `admin`, `dispositivos`).
- Caddy sirve la web compilada y pasa `/api`, `/admin` y `/ws` a Daphne (`127.0.0.1:8001`).
- systemd: `nucleo-daphne` (API y WebSocket), `nucleo-mqtt` (lecturas del broker),
  `nucleo-sin-conexion`, `nucleo-reportes.timer` (cada 15 min) y `nucleo-recursos.timer` (cada
  10 min, `vigilar_recursos.sh`). Si cualquiera falla, `nucleo-aviso@.service` manda un correo con
  sus últimas líneas de bitácora. `nucleo-respaldo.timer` y `nucleo-prueba-restauracion.timer` se
  instalan pero quedan **deshabilitados** en el servidor: los respaldos los hace el equipo de
  compilación ([Respaldos desde el equipo de compilación](#respaldos-desde-el-equipo-de-compilación)).
- Firewall `ufw`: todo lo entrante cerrado salvo Tailscale ([Firewall](#firewall)).

- **Descanso diario de 06:00 a 12:00** (archivos en [`deploy/descanso-servidor/`](descanso-servidor/),
  instalados en `/usr/local/sbin` y `/etc/systemd/system`): a las 06:00 `descanso-lenovo.timer`
  corre `apt update` y `apt upgrade` (incluye Docker, Tailscale y cloudflared); si instaló algo,
  reinicia y `descanso-lenovo-arranque.service` espera a que todo levante antes de seguir. Luego
  pausa `nucleo-sin-conexion` (para no marcar sin conexión a los ESP32 por las horas dormidas),
  suspende el equipo (s2idle, con `rtcwake`) y el reloj lo despierta a las 12:00; cinco minutos
  después reanuda `nucleo-sin-conexion`. Durante el descanso Núcleo no responde ni guarda lecturas.
  No se suspende si hay un despliegue o una build en curso, ni si tras el reinicio algo no levantó
  (para que el vigilante lo vea). Para saltárselo: `sudo touch /etc/descanso-lenovo.desactivado`
  (se borra para reactivarlo). Para despertarlo antes: el botón de encendido o, desde el equipo de
  compilación, `despertar-lenovo` (*magic packet* por el Wi-Fi de la casa; Wake-on-WLAN activado en
  las dos redes con `802-11-wireless.wake-on-wlan magic`). Registro: `/var/log/descanso-lenovo.log`.
  Con el procesador en reposo gasta unos 2.2 W y suspendido 0.06 W.
- Temperatura: `termica-servidor.service` (fuera del repo, `/usr/local/sbin/termica-servidor`) deja
  el perfil de energía en bajo consumo, EPP `balance_performance` y `max_perf_pct` 65 (tope de
  2.9 GHz). Evita los arranques bruscos del ventilador con poca carga (de 97 °C a ~52 °C de
  máximo; Ollama pierde ~4 %). Se quita con `sudo systemctl disable --now termica-servidor`.
- `pantalla-apagada.service` apaga la retroiluminación de la pantalla interna (~3 W);
  `sudo systemctl stop pantalla-apagada` la vuelve a encender.
- Fuera del descanso el servidor no se suspende con la tapa cerrada ni por inactividad
  (`sleep.target` y `suspend.target` siguen enmascarados; `rtcwake` suspende directo por el kernel). La red la maneja NetworkManager
  con IP fija (Wi-Fi principal y otra red de respaldo con menor prioridad), sin ahorro de energía
  en el Wi-Fi. La batería tiene tope de carga (conservation mode) y, sin corriente y con poca
  batería, un timer detiene servicios y bases en orden y apaga el equipo.

### Equipo de compilación

- Tiene una copia del repositorio en `/var/www/html/Nucleo` (rama `main`), Node (nvm), el SDK de
  Android, ccache y la llave de firma de la app en `~/nucleo-app`.
- Sus scripts viven en `/usr/local/bin`, fuera del repositorio. Hay copia en el equipo de
  administración y, sin secretos, copia de referencia en [`deploy/dos-equipos/`](dos-equipos/)
  (salvo `vigia`, que también vigila otros servicios del servidor). Hablan con el servidor por SSH
  con llave:

  | Script | Qué hace |
  | --- | --- |
  | `desplegar-nucleo` | «Lanza el deploy»: compila la web y hace que el servidor instale |
  | `compilar-apk-nucleo` | «Lanza la build»: compila el APK y lo publica en el servidor |
  | `respaldo-nucleo-remoto` (timer diario 23:30) | Respaldo diario de las bases y la aplicación (se queda en el equipo) |
  | `respaldo-semanal` (`respaldo-nucleo-semanal.timer`, lunes 00:30) | Zip semanal de los respaldos diarios, cifrado a Drive |
  | `prueba-restauracion-nucleo` (timer, 1er domingo 04:30) | Prueba de restauración con contenedores temporales |
  | `respaldo-aviso` (`respaldo-aviso@.service`) | Correo si un respaldo o una prueba falla |
  | `vigia` (timer cada 60 s) | Vigilante externo del servidor (sitios, servicios, equipo, accesos) |
  | `despertar-lenovo` | Despierta al servidor durante su descanso (*magic packet*) |
  | `mantenimiento-asus` (a mano) | `apt update` y `apt upgrade` del propio equipo, reinicio si hace falta y correo con el resultado |

- Los despliegues y las builds usan candado (`flock`): si otra sesión ya está desplegando o
  compilando, el script se niega y lo dice. Nunca corren dos builds del APK a la vez.
- La build del APK se lanza solo cuando se pide expresamente («lanza la build»); un despliegue
  («lanza el deploy») no compila el APK. Cada cambio de `Mobile/` sube `version` y
  `android.versionCode` de `Mobile/app.json` en el mismo commit.
- Ni despliegues ni builds durante el descanso del servidor (06:00 a 12:00), salvo que se haya
  despertado antes con `despertar-lenovo`.
- Los registros quedan en `~/despliegues/` (`nucleo-<fecha>.log`, `apk-<fecha>.log`).
- Mismas medidas que el servidor: ufw solo Tailscale y apagado ordenado por batería, pero **nunca
  se suspende** (es el vigilante y el que despierta al servidor).
- Sus actualizaciones son **a mano**: `sudo systemctl start --no-block mantenimiento-asus`
  (más o menos una vez al mes, lejos de los respaldos de las 23:00-00:45). Espera hasta
  2 h a que terminen respaldos, zips semanales, pruebas de restauración, builds o deploys; actualiza; reinicia solo
  si instaló algo o el sistema lo pide; y manda a la cuenta de avisos un correo «listo», «sin
  cambios», «no se actualizó» o «revisar» (`mantenimiento-asus-arranque.service` lo manda tras el
  reinicio). Registro: `/var/log/mantenimiento-asus.log`. Entre tanto, `unattended-upgrades`
  instala solo los parches de seguridad de Debian.

## Operación

Producción solo corre `main`; `dev` es para probar en local y se une a `main` (avance rápido)
cuando está lista.

En el **equipo de compilación** (`ssh adminasus@100.65.53.53`), mejor dentro de `tmux`:

- `desplegar-nucleo` — despliegue completo en unos 2 minutos ([Despliegue en dos equipos](#despliegue-en-dos-equipos)).
- `compilar-apk-nucleo [--forzar|--limpio]` — compila el APK y lo publica en `app.bynucleo.com`
  ([App móvil](#app-móvil-apk)).
- `sudo systemctl start respaldo-nucleo-remoto` — respaldo inmediato (o `respaldo-nucleo-remoto`
  directo); `journalctl -u respaldo-nucleo-remoto -n 50 --no-pager` para ver el último.
- `respaldo-semanal nucleo gdrive-nucleo-cifrado: [fecha]` — arma y sube el zip de la semana que
  contiene esa fecha (sin fecha, la que terminó el domingo pasado); bitácora en `~/respaldos/nucleo-semanal`.
- `prueba-restauracion-nucleo` — prueba de restauración inmediata; el registro queda en
  `~/respaldos/nucleo-pruebas`.
- `vigia --prueba` — corre todas las revisiones del vigilante e imprime el resultado sin mandar correos.
- `systemctl list-timers --no-pager | grep -E 'respaldo|prueba|vigia'` — próximas ejecuciones.

En el **servidor** (`ssh adminlenovo@100.107.247.90`), en `/var/www/html/Nucleo`:

- `bash deploy/desplegar.sh` — trae `main`, compila la web en el propio servidor y reinstala; se
  puede repetir. Sirve si el equipo de compilación no está disponible.
- `systemctl status nucleo-daphne nucleo-mqtt caddy --no-pager` — estado de los servicios.
- `journalctl -u nucleo-daphne -n 50 --no-pager` — últimos mensajes de la API.
- `docker ps` — contenedores: postgres, timescaledb, redis, mosquitto y ollama.
- `systemctl status cloudflared --no-pager` — estado del túnel de Cloudflare.
- `sudo ufw status verbose` — reglas del firewall.
- `bash deploy/respaldar.sh` y `bash deploy/probar_restauracion.sh` siguen funcionando en el
  servidor (respaldo y prueba locales); se usan solo si el equipo de compilación no está. Guardan
  lo mismo que el respaldo remoto.

### Despliegue en dos equipos

La web se compila en el equipo de compilación y el servidor solo instala. `desplegar-nucleo` hace
estos pasos (con candado y registro en `~/despliegues/`):

1. En el equipo de compilación: trae `main`, compila `FrontEnd/` con las mismas variables que usa
   `deploy/instalar.sh` (la URL de la API sale de `CORS_ALLOWED_ORIGINS` de su `BackEnd/.env`) y
   copia `FrontEnd/dist/` al servidor (`rsync -a --delete --partial`).
2. En el servidor, dentro de una sesión `tmux` con `umask 022` (con un umask más cerrado la web
   queda en 403): `NUCLEO_SIN_WEB=1 bash deploy/desplegar.sh`. Hace todo lo demás (dependencias,
   migraciones, servicios, Caddy y túnel) y usa la web que ya está en `FrontEnd/dist/` en lugar de
   compilarla. La contraseña de `sudo` del servidor la lee de `~/.config/despliegue-lenovo`
   (permiso 600, fuera del repo).
3. Espera a que termine, muestra el final del registro del servidor y comprueba
   `https://bynucleo.com/` y `/api/v1/health/`.

`compilar-apk-nucleo` trae `main`, corre `deploy/compilar_apk.sh` con prioridad baja y copia
`deploy/descargas/` completo al servidor (`rsync`); el enlace de `app.bynucleo.com` no cambia. Una build
con cambios en `Mobile/` tarda unos 8 minutos en el equipo de compilación (0.2.9: 7 min 57 s, de la compilación
a la publicación).

Para instalar o actualizar los scripts en el equipo de compilación:

```bash
sudo install -m 755 deploy/dos-equipos/desplegar-nucleo deploy/dos-equipos/compilar-apk-nucleo /usr/local/bin/
```

Las direcciones del servidor se cambian con la variable `NUCLEO_SERVIDOR` (por defecto
`adminlenovo@100.107.247.90`).

## Seguridad y recuperación

### Respaldos desde el equipo de compilación

`instalar.sh` deja apagados `nucleo-respaldo.timer` y `nucleo-prueba-restauracion.timer` mientras exista
`/etc/nucleo-respaldo-remoto` en el servidor (`sudo touch /etc/nucleo-respaldo-remoto`); sin ese archivo los enciende,
para un servidor de un solo equipo.

`respaldo-nucleo-remoto.timer` (todos los días a las 23:30, para guardar lo que se hizo en el día)
corre en el equipo de compilación y saca los datos del servidor por SSH, sin compilar ni guardar
nada allá:

- `pg_dump -Fc` de `nucleo_db` y `nucleo_iot` (con `nice` del lado del servidor) y comprueba que
  `pg_restore` pueda leer cada volcado.
- La aplicación completa (`nucleo_aplicacion_*.tar.gz`: código desplegado con sus `.env`, la
  configuración y `VERSION_DESPLEGADA` con el commit), los certificados y usuarios del broker y
  los archivos subidos (`nucleo_broker_media_*.tar.gz`).
- La llave de firma de la app (`nucleo_firma_app_*.tar.gz`), que vive en el equipo de compilación.

Usa los mismos nombres que `respaldar.sh`, así que `restaurar.sh` sirve igual. El respaldo diario
se queda solo en el equipo de compilación (`~/respaldos/nucleo`, 10 días, lo justo para armar la
semana); cada descarga se reintenta 5 veces. Al terminar, en el servidor corre
`manage.py depurar_auditoria`.

**Zip semanal a Drive.** `respaldo-nucleo-semanal.timer` (lunes 00:30, después del respaldo del
domingo por la noche) corre `respaldo-semanal nucleo gdrive-nucleo-cifrado:`: junta los respaldos
diarios de la semana que acaba de terminar en `nucleo_semana_<lunes>_al_<domingo>.zip`, con una
carpeta por día (`lunes/`, `martes/`, …, `domingo/`) y un `CONTENIDO.txt`, sin repetir lo que no cambió:

- De cada día entra solo el **último** respaldo (si ese día hubo varios por pruebas o reintentos; si el
  último quedó a medias, el último completo).
- Los volcados de las bases (`nucleo_db`, `nucleo_iot`) entran completos todos los días.
- Cada tipo de tar (`aplicacion`, `broker_media`, `firma_app`, por separado) entra completo el primer
  día de la semana; los días siguientes se compara con el último que sí entró y, si es igual, no se
  mete: en la carpeta del día queda la nota `<tipo> - igual que <día>.txt` con el nombre del archivo y
  la carpeta donde está (sin «:» en el nombre, para que se pueda extraer en Windows). Si cambió, entra
  completo. «Igual» es el mismo sha256 del `.tar.gz` o, si los bytes difieren, la misma huella del
  contenido: la lista ordenada de ruta, tipo, permisos, destino de enlace, tamaño y sha256 de los datos
  de cada entrada, sin fechas, dueños ni orden. Los tar de `broker_media` y `firma_app` salen idénticos
  byte a byte si nada cambió (el gzip de una tubería no guarda fecha), pero el de `aplicacion` cambia
  siempre porque `VERSION_DESPLEGADA` se recrea en cada respaldo; la huella del contenido lo resuelve
  sin dar por igual un cambio real de cualquier archivo.
- `CONTENIDO.txt` trae una tabla (día | respaldo usado (hora) | base | cada tar: «incluido» o
  «en <día>»), los días que faltan y cómo restaurar un día.

Con esto la semana de prueba (16 al 22 de noviembre de 2026, seis días) bajó de 77 MB a 36 MB.
Si falta algún día el zip se arma igual y la bitácora y el correo lo dicen. Antes de subirlo comprueba
el zip (`revisar_zip_semanal` de `comun.sh`: CRC de cada archivo y que cada nota apunte a un archivo
que sí está en el zip); lo sube por el remoto cifrado (`gdrive-nucleo-cifrado:semanal`, nombre y contenido
cifrados) y comprueba la copia con `rclone cryptcheck`. Guarda unas 5 semanas en Drive y en
`~/respaldos/nucleo-semanal`. Los archivos sueltos que subían los respaldos diarios de antes se
borran solos al cumplir 30 días. La subida limita las peticiones a Google (`--tpslimit 4`: rclone
usa por defecto un cliente compartido con un límite de peticiones por minuto), corta a los 2 min una
transferencia atorada (`--timeout 2m`) y se reintenta hasta 10 veces con un tope de 40 min, porque
el equipo de compilación sale a internet por un Wi-Fi débil. Si el armado o la subida fallan,
avisa por correo; se puede repetir a mano (ver [Operación](#operación)). Si hay un respaldo o una
prueba de restauración en curso, espera a que termine (hasta 2 h).

`prueba-restauracion-nucleo-remoto.timer` (primer domingo del mes, 04:30) restaura el último
respaldo diario (el del sábado por la noche) en dos contenedores temporales sin red, compara los
conteos con producción (solo lectura, por SSH), revisa que el último zip semanal pase la comprobación
(CRC y notas) y esté en Drive con el mismo tamaño, y manda el resultado por correo. Si un respaldo o una prueba falla,
`respaldo-aviso@.service` manda las últimas líneas de su bitácora (como mucho uno por hora).
El SMTP y los destinatarios están en `~/.config/respaldo-remoto/nucleo.env` (600, fuera del repo).

### Respaldos cifrados

Drive solo recibe archivos cifrados (nombres incluidos) con un remoto `crypt` de rclone sobre el
remoto normal. Una sola vez, en el equipo que hace los respaldos (el de compilación):

```bash
rclone config create gdrive-nucleo-cifrado crypt \
  remote=gdrive-nucleo:servidor/nucleo-cifrado \
  password="$(rclone obscure 'CONTRASEÑA-LARGA')" \
  password2="$(rclone obscure 'OTRA-CONTRASEÑA-LARGA')"
```

Guarda las dos contraseñas fuera del servidor (gestor de contraseñas): sin ellas los respaldos
no se pueden leer. Desde ese momento `respaldar.sh` usa el remoto cifrado y los respaldos en claro
anteriores se borran solos a los 30 días. Para restaurar en otra máquina se crea el mismo remoto
con las mismas contraseñas y se baja el zip de la última semana (ver [Restaurar](#restaurar)).

**Únicos respaldos.** Los únicos respaldos son `respaldo-nucleo-remoto.timer` (diario 23:30, local en el
equipo de compilación) y `respaldo-nucleo-semanal.timer` (zip de los lunes a Drive). En el servidor,
`nucleo-respaldo.timer` queda deshabilitado (marca `/etc/nucleo-respaldo-remoto`), no hay crons con
`pg_dump` ni `rclone` en ninguno de los dos equipos y ya nada sube archivos sueltos a Drive (los
viejos de la raíz del remoto caducan a los 30 días). La prueba de restauración mensual no es un
respaldo y sigue activa; `dpkg-db-backup.timer` es de Debian (copia de la base de paquetes en
`/var/backups`) y no tiene que ver con estos.

### Restaurar

`bash deploy/restaurar.sh [opciones] <carpeta o zip>`, desde la carpeta del proyecto (un clon del
repositorio). El origen puede ser `~/respaldos/nucleo` del equipo de compilación (copiado a `~/traspaso`),
una carpeta con los archivos de un día o el zip semanal tal cual (lo extrae en un temporal y lo borra al
terminar). Desde Drive: `rclone copy gdrive-nucleo-cifrado:semanal ~/traspaso --max-age 8d`.

Usa cinco tipos de archivo, con la fecha en el nombre (`_AAAA-MM-DD_HHMM`):

| Archivo | Qué restaura | Dónde |
| --- | --- | --- |
| `nucleo_db_*.dump` | PostgreSQL (`nucleo_db`) | contenedor `nucleo_postgres` |
| `nucleo_iot_*.dump` | TimescaleDB (`nucleo_iot`) | contenedor `nucleo_timescaledb` |
| `nucleo_aplicacion_*.tar.gz` | código desplegado, `.env` raíz, `BackEnd/.env`, Caddy, systemd, Mosquitto y `VERSION_DESPLEGADA` | carpeta del proyecto |
| `nucleo_broker_media_*.tar.gz` | certificados y usuarios del broker y `BackEnd/media` (archivos subidos) | carpeta del proyecto |
| `nucleo_firma_app_*.tar.gz` | llave de firma del APK (`nucleo-app/`) | solo con `--firma <carpeta>` (en el equipo de compilación, `--firma ~`) |

Toma el `nucleo_db` más reciente (o el de `--fecha AAAA-MM-DD[_HHMM]`) y, de cada otro tipo, el más
reciente que no sea posterior. Así, con el zip semanal, un tar que no cambió y solo está en un día anterior
(«en <día>» en `CONTENIDO.txt`) se encuentra solo: `--fecha 2026-11-21` toma las bases del sábado, la
aplicación del viernes y la firma del lunes. `--lista` muestra qué hay de cada tipo y cuál usaría, sin tocar
nada. Primero muestra lo elegido y pregunta si sigue; luego extrae la aplicación y el broker (agrega lo que
falta y, si hay archivos que ya existen con otro contenido, como un `.env` distinto, los lista y solo los
reemplaza si se confirma o con `--sobrescribir`; sin terminal o con `-y` se conservan), levanta
`postgres`, `timescaledb` y `redis` con `docker compose` y restaura las dos bases, que deben estar vacías
(si no, se detiene: para empezar de cero, `docker compose down -v`). Al final dice qué commit corría
(`VERSION_DESPLEGADA`) y, si el repositorio está en otro, el `git checkout` para igualarlo.

Para probarlo sin tocar nada: `--destino <carpeta vacía>` extrae ahí en vez del proyecto, y
`NUCLEO_PG`/`NUCLEO_TS` con `NUCLEO_SIN_COMPOSE=1` restauran en otros contenedores (sin red, creados a
mano con las mismas imágenes, usuarios y bases). `NUCLEO_SOLO_BASES=1` solo restaura las bases (lo usa
`probar_restauracion.sh`).

### Objetivos de recuperación

| Medida | Valor |
| --- | --- |
| RPO (datos que se pueden perder) | 24 h con el equipo de compilación (respaldo diario a las 23:30); hasta 8 días si se pierden el servidor y el equipo de compilación a la vez (Drive recibe el zip semanal el lunes) |
| RTO (tiempo para volver) | El que mide la prueba mensual (≈ 1 min para restaurar las bases; más la instalación si es otra máquina) |
| Prueba | `prueba-restauracion-nucleo-remoto.timer` (equipo de compilación) restaura, compara conteos y avisa por correo |

### Llave de cifrado de datos

`instalar.sh` agrega a `BackEnd/.env` una `NUCLEO_CLAVE_CIFRADO` (Fernet) si no existe; con ella se
cifran el teléfono de los usuarios y los secretos de la verificación en dos pasos y de los
webhooks. Guarda una copia fuera del servidor: si se pierde, esos campos no se pueden leer (los
respaldos de la base los traen cifrados).

### Firewall

Los dos equipos usan **ufw** con la misma política: niega todo lo entrante (también desde la red
de la casa) salvo la interfaz de Tailscale y el puerto UDP de sus conexiones directas. SSH, las
bases y lo que el equipo de compilación consulta del servidor solo pasan por Tailscale. Las
visitas de Núcleo no necesitan puertos abiertos porque llegan por el túnel de Cloudflare, que sale
desde el servidor.

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow in on tailscale0 comment tailscale
sudo ufw allow 41641/udp comment tailscale-directo
sudo ufw enable
sudo ufw status verbose
```

Antes de activar ufw o quitar una regla de SSH, comprueba que entras por Tailscale, programa una
vuelta atrás y cancélala cuando una sesión SSH nueva funcione:

```bash
sudo systemd-run --unit=ufw-vuelta-atras --on-active=180 /usr/sbin/ufw disable
# ...cambios y prueba desde otra sesión...
sudo systemctl stop ufw-vuelta-atras.timer
```

Además, en los dos equipos: `sshd` con un drop-in (`/etc/ssh/sshd_config.d/`) que deja llave y
contraseña pero no `root` (`PermitRootLogin no`, `MaxAuthTries 4`), `fail2ban` para SSH,
`unattended-upgrades` solo de seguridad y de madrugada (sin reinicio automático; en el servidor, además, el [descanso diario](#servidor) actualiza todo y reinicia si hace falta) y `auditd` con
reglas sobre `/etc`, `/usr/local/bin`, systemd y `sudo`.

`deploy/firewall.sh` y `deploy/firewall.nft` quedan para un servidor de un solo equipo sin ufw:
hacen lo mismo con nftables (más SSH desde la red local). `bash deploy/firewall.sh aplicar` y,
desde **otra** sesión SSH, `bash deploy/firewall.sh confirmar` (sin confirmar se quita solo a los
3 minutos). El script se niega a cargarse si ufw está activo; en los dos equipos actuales no se usa.

### Reglas de Cloudflare (panel)

Ya creadas en `bynucleo.com` (plan Free) con la API de Cloudflare; se ven y editan en
**Security → WAF** (*Custom rules* y *Rate limiting rules*). Si se pierden, se recrean así:

| Regla | Expresión | Acción |
| --- | --- | --- |
| Escáneres | `starts_with(http.request.uri.path, "/wp-") or starts_with(http.request.uri.path, "/.env") or starts_with(http.request.uri.path, "/.git") or ends_with(http.request.uri.path, ".php")` | Block |
| Admin solo desde México | `starts_with(http.request.uri.path, "/admin") and ip.src.country ne "MX"` | Block |
| Límite de acceso (Rate limiting) | `http.request.uri.path in {"/api/v1/auth/login/" "/api/v1/auth/recuperar/" "/api/v1/auth/restablecer/"}`, 5 peticiones / 10 s por IP | Block 10 s |

No actives Bot Fight Mode: bloquearía a los ESP32, a la app y al vigía de GitHub.

**Correo del dominio.** Núcleo envía desde Gmail, no desde `@bynucleo.com`, así que el DNS declara
que el dominio no manda correo y los servidores rechazan cualquiera que lo suplante:

| Registro TXT | Valor |
| --- | --- |
| `bynucleo.com` | `v=spf1 -all` |
| `_dmarc.bynucleo.com` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` |
| `*._domainkey.bynucleo.com` | `v=DKIM1; p=` |

Si algún día se envía desde `@bynucleo.com`, primero hay que cambiar el SPF y publicar la llave DKIM
del proveedor de correo.

Tras un deploy que cambie encabezados, vacía la caché en **Caching → Configuration → Purge Everything**
(o por API con `purge_cache`).

### Avisos y vigilancia

- `nucleo-aviso@.service`: correo a `NUCLEO_CORREOS_AVISOS` (o a los administradores de
  plataforma) cuando un servicio falla, como mucho uno por hora por servicio
  (`NUCLEO_AVISO_MINUTOS`).
- En producción `NUCLEO_CORREOS_AVISOS` apunta a la cuenta de avisos del proyecto (la misma del
  SMTP), así que estos correos y los de `vigilar_recursos.sh` llegan a su bandeja.
- **Vigilante externo** (`vigia`, en el equipo de compilación, fuera del repo; timer cada 60 s):
  vigila el servidor desde otro equipo, así que avisa aunque el servidor esté caído o sin red.
  Revisa por HTTPS los sitios públicos y, con una sola conexión SSH por vuelta, los servicios,
  contenedores, Ollama, disco, memoria, temperatura, batería, la edad de los respaldos, los
  certificados de Mosquitto, el espacio en Drive y las entradas por SSH. Un fallo cuenta tras 2
  revisiones seguidas («el servidor no responde», tras 3). Manda «Falla», «Sigue fallando» cada
  hora mientras dure y «Resuelto»; a las 08:00, un resumen del día anterior (caídas, accesos,
  `sudo`, auditd). Una entrada por SSH desde una IP que no está en su lista de conocidas avisa al
  momento. Usa su propia copia del SMTP del proyecto (`~/.config/vigia-smtp-nucleo.env`, 600) y
  los destinatarios de `~/.config/vigia.conf` (los mismos de `NUCLEO_CORREOS_AVISOS`); si el
  correo no sale, lo deja en cola y lo reintenta hasta 3 días. `vigia --prueba` muestra lo que
  mandaría sin enviar nada. Vigila también otros servicios del servidor, con sus propios
  destinatarios. De 06:00 a 12:10, si el servidor no contesta al ping, da la vuelta por buena sin
  revisar ni avisar (es su descanso); a partir de las 12:10 avisa si no despertó. El resumen de
  las 08:00 sale en la primera vuelta tras el descanso.
- El vigilante del panel del host (`/usr/local/bin/hostpanel-avisos`, en el servidor, fuera del
  repo) corre tras cada actualización del panel y solo actúa cuando algo cambia de estado: manda «Caído»,
  «Aviso» o «Resuelto» con la explicación y las últimas líneas del registro a la cuenta de avisos
  de la plataforma afectada (túnel, dominios, Daphne o MQTT detenidos, ESP32 sin conexión,
  Nico AI, seguridad, respaldos, Caddy, Ollama, red). Usa el SMTP del `.env` y no repite lo que ya
  avisan `aviso_fallo.sh` y `vigilar_recursos.sh`.
- **Panel del servidor** (`https://hostprojects.bynucleo.com`, con usuario y contraseña; no es parte
  de Núcleo, solo usa su túnel: Caddy `127.0.0.1:8082`, archivos en `/var/www/hostprojects`,
  instalado fuera del repo). Se actualiza cada minuto (`hostpanel.timer`) y muestra, de Núcleo:
  túnel y subdominios, Daphne, MQTT y contenedores, personas conectadas y peticiones del día
  (de la bitácora JSON de Caddy), Nico AI (puente ESP, preguntas y tokens de `pregunta_agente`),
  Ollama, el estado del respaldo del día y del último zip semanal en Drive, los trabajos en curso
  (deploys, builds, respaldos, restauraciones) y el estado del equipo de compilación, que este
  envía cada minuto. En la terminal, `estadoServer.sh` (en los dos equipos) muestra lo mismo
  (`--resumen`, `--corto` al entrar por SSH, `--json` para el panel).
- `.github/workflows/vigia.yml`: cada 15 min revisa desde fuera la web, la API, la app y el
  subdominio de los ESP32. GitHub solo ejecuta los flujos programados de la rama principal, así
  que vigila desde `main`; las fallas llegan por correo de GitHub. De 06:00 a 12:10 (hora de
  Tijuana) termina sin revisar, por el descanso del servidor. Cambiar este archivo requiere un
  token con permiso `workflow`.
- Las *Dependabot alerts* están activas: avisan de dependencias vulnerables sin crear ramas ni
  pull requests. Las actualizaciones se aplican a mano en `dev` (con las pruebas) y pasan a
  `main` con el deploy. `seguridad.yml` corre CodeQL, ruff y `npm audit` en cada push.

### Verificación en dos pasos obligatoria

`NUCLEO_2FA_OBLIGATORIO=ADMINPLAT,ADMIN` en `BackEnd/.env` (y reiniciar `nucleo-daphne`) obliga a
esos roles a configurarla en Mi perfil antes de usar lo demás. Antes, configúrala en las cuentas
de demostración que usen esos roles.

### Firmware de los ESP32 (OTA)

1. Sube `FIRMWARE_VERSION` en `IoT/micropython/config.py`, haz commit y despliega.
2. `cd BackEnd && .venv/bin/python manage.py publicar_firmware` — copia la versión a
   `BackEnd/firmware/` (fuera de git).
3. `NUCLEO_FIRMWARE_DISPOSITIVOS=NUC-001` en `BackEnd/.env` (primero en una placa; `*` = todas) y
   reinicia `nucleo-daphne`. La placa la baja en ≤ 6 h, la instala al reiniciar y, si no vuelve a
   conectar tras 3 reinicios, regresa sola a la anterior.

Las placas necesitan la primera vez `actualizacion.py`, `boot.py` y `nucleo/ota.py` grabados por
cable, además de `PUENTE_HOST` y `PUENTE_CLAVE` en `secrets.py`.

### Servidor de reserva

Si el servidor se pierde, cualquier equipo con Debian y 8 GB sirve (también el equipo de
compilación, que ya tiene los respaldos en `~/respaldos/nucleo`, Docker y el repositorio):

1. Instala Docker, git, Caddy, rclone y cloudflared; clona el repositorio en `/var/www/html/Nucleo`
   (rama `main`).
2. Usa los respaldos locales del equipo de compilación o crea los remotos `gdrive-nucleo` y
   `gdrive-nucleo-cifrado` (mismas contraseñas) y baja el último respaldo (si no hay acceso a
   GitHub, `nucleo_aplicacion_*.tar.gz` trae el código y los `.env`:
   `tar -xzf … -C /var/www/html/Nucleo`); sigue [Instalación desde cero](#instalación-desde-cero).
   Pon en `BackEnd/.env` la misma `NUCLEO_CLAVE_CIFRADO`.
3. Copia `/etc/cloudflared/` y `~/.cloudflared/` (o crea el túnel de nuevo) y **apaga el
   `cloudflared` del servidor viejo** si sigue encendido: con dos conectores del mismo túnel,
   Cloudflare reparte las visitas entre ambos. Los dominios apuntan al túnel, no a una IP, así que
   el cambio es inmediato.
4. Un servidor de reserva no debe descansar: no instales `deploy/descanso-servidor/` en él y, si
   cambia la dirección, ajusta `DESCANSO_LENOVO` y la IP del ping en `vigia` (o quita la ventana
   de 06:00-12:10 de `vigia` y de `.github/workflows/vigia.yml`).
5. Si el servidor nuevo tiene otra dirección de Tailscale, cámbiala en los scripts del equipo de
   compilación (`NUCLEO_SERVIDOR`, `LENOVO` en `/usr/local/lib/respaldo-remoto/comun.sh` y en
   `~/.config/vigia.conf`).
6. Revisa con el vigía o `curl https://bynucleo.com/api/v1/health/`.

Si el que se pierde es el equipo de compilación, Núcleo sigue funcionando: instala otro según
[Instalación desde cero](#instalación-desde-cero) (paso del equipo de compilación) y recupera la
llave de firma de la app del respaldo (`nucleo_firma_app_*.tar.gz`). Mientras tanto se puede
desplegar con `bash deploy/desplegar.sh` en el servidor y respaldar con `bash deploy/respaldar.sh`
(habilitando `nucleo-respaldo.timer`).

### App móvil (APK)

El APK se descarga en `https://app.bynucleo.com`. Caddy entrega la carpeta
`deploy/descargas/` del proyecto (no va a git), donde queda un APK por versión (`nucleo-<versión>.apk`). La raíz
(`index.html`, sale de la plantilla `deploy/descarga.html`; el script y cada deploy la regeneran) lleva al de la versión publicada, así que se descarga con la versión en el
nombre; el enlace anterior `/nucleo.apk` lleva a la raíz. El login de la web tiene un botón a este enlace.
`bash deploy/compilar_apk.sh --indice` solo regenera esa página con el APK ya compilado de la versión de `Mobile/app.json` (o el más reciente, si esa aún no se compila).

Para publicar una versión nueva: subir `version` en `Mobile/app.json`, unir a `main` y correr
`compilar-apk-nucleo` en el equipo de compilación (mejor en tmux; por dentro corre
`bash deploy/compilar_apk.sh` y copia `deploy/descargas/` al servidor). Compila con la API del perfil `piloto` de
`Mobile/eas.json`, con prioridad baja y solo para arm64-v8a (todos los celulares actuales; otra arquitectura con
`NUCLEO_ABIS=arm64-v8a,armeabi-v7a`). El enlace no cambia y no hace falta reiniciar nada.

Es incremental: si `Mobile/` no cambió desde el último APK no compila; reinstala `node_modules` solo si cambió
`package-lock.json` y regenera `android/` (`expo prebuild --clean`) solo si cambió la configuración nativa
(dependencias, plugins, `eas.json` o cualquier parte de `app.json` que no sea la versión). Subir `expo.version` y
`expo.android.versionCode` no regenera nada: el script las escribe en `android/app/build.gradle` (`versionName` y
`versionCode`) y Gradle reutiliza lo ya compilado; si no encuentra esas líneas se detiene y pide `--limpio`. Un
cambio solo de pantallas o de versión tarda unos minutos (unos 2 GB de RAM, 2 tareas a la vez); desde cero va con
una tarea a la vez para cuidar la memoria y tarda más (`NUCLEO_HILOS=2` fuerza 2 para medir). La memoria se usa
solo mientras corre. Opciones: `--forzar` (compila aunque no haya cambios) y `--limpio` (borra `node_modules` y
`android/` y compila todo, por si algo sale raro).

Para que tarde menos en el equipo de compilación (CPU de 2 núcleos):

- El APK piloto va sin R8: el script pone `android.enableMinifyInReleaseBuilds=false` y
  `android.enableShrinkResourcesInReleaseBuilds=false` en `android/gradle.properties`. R8 era el paso más largo
  (~6 min); a cambio el APK pesa algo más y el código Java/Kotlin no va ofuscado.
- No corre `lintVitalRelease` (`-x lintVitalRelease`), que no cambia el APK.
- El C++ (la app y React Native) pasa por ccache si está instalado: `CCACHE_DIR=~/.cache/ccache`, tope 3 GB,
  `NDK_CCACHE` para lo que use ndk-build. Así una regeneración de `android/` reutiliza lo ya compilado. `ccache -s` muestra los aciertos.
- Crea una sola vez `~/.gradle/init.d/nucleo-cache-30-dias.gradle`, que guarda 30 días (en lugar de 7) lo
  que no se usó de la caché local de Gradle, para que una build tras semanas sin compilar no empiece de cero.
- Corre con `nice -n 19 ionice -c2 -n7`: prioridad baja, pero sin quedarse parada si el disco está ocupado.

#### Notificaciones push

Con la app abierta las alertas llegan por el canal en vivo (y la app oculta el push repetido);
con la app cerrada llegan por push: el backend las manda a Expo y Expo las entrega por Firebase.
Ya está configurado y probado en un teléfono:

| Pieza | Dónde |
| --- | --- |
| Proyecto de Expo | cuenta `nucleo-expo`, proyecto `-nucleo-mobile` (así quedó el nombre); su ID va en `Mobile/app.json` (`extra.eas.projectId`) y en `EXPO_PUBLIC_EAS_PROJECT_ID` de `Mobile/eas.json` |
| Firebase | proyecto `nucleo-firebase`, app Android `com.nucleo.mobile` |
| `google-services.json` | `Mobile/` del equipo de compilación, fuera de git; sin él el APK no recibe push |
| Clave FCM V1 | subida a Expo y asignada a `com.nucleo.mobile` (`npx eas-cli credentials -p android` con la sesión de `nucleo-expo`) |
| Backend | `NUCLEO_PUSH_HABILITADO=true` en `BackEnd/.env` |

Si se pierde `google-services.json`, se vuelve a descargar en Firebase → Configuración del
proyecto → General → Tus apps, se copia a `Mobile/` y se recompila el APK. Para probar un push,
la app debe estar cerrada.

Requisitos (una vez, en el equipo de compilación): `sudo apt install openjdk-21-jdk-headless unzip ccache` y las herramientas de línea de comandos
de Android en `~/android-sdk/cmdline-tools/latest` con las licencias aceptadas
(`yes | sdkmanager --licenses`); Gradle descarga el resto. La llave de firma vive en `~/nucleo-app`
(fuera de git, en el equipo de compilación) y entra en cada respaldo: sin ella no se puede actualizar la app ya instalada.

## Nico AI con IA local (Ollama) y el ESP32 puente

Nico AI responde primero con respuestas predefinidas y con las que aprendió de los 👍 de los
usuarios (tabla `respuesta_aprendida`). Solo cuando se le pide explicar, opinar o recomendar
(«¿es grave?», «¿por qué subió?», «¿qué recomiendas?») redacta con un modelo local chico
(`qwen3:4b-instruct`, la variante sin modo «thinking»; ~2.9 GB de RAM cargado, tope 3.5 GB;
4–11 s por respuesta con el modelo cargado, ~4 s más si estaba descargado) que corre en
el contenedor `nucleo_ollama`.

El ESP32 de cada dispositivo es la **llave** de su agente. Por MQTT dentro de WebSocket
(`wss://dispositivos.bynucleo.com/mqtt`, por el túnel hasta el listener interno 9001 de
Mosquitto) publica un latido
cada 20 s con su diagnóstico de red y firma cada petición: el backend publica `{id, reto}` en
`nucleo/devices/<c>/puente/peticion` y el ESP responde en `.../puente/autoriza` con
HMAC-SHA256(`IA_PUENTE_CLAVE`, `codigo:id:reto`). Solo con esa firma el backend llama a
Ollama (`IA_OLLAMA_URL`, local). Sin latido ni lecturas en 75 s, o con el último mensaje del
ESP (`{"estado":"offline"}`), el agente se deshabilita en la web y en la app. Si la red del ESP
no deja pasar el WebSocket, el ESP consulta `GET /api/v1/puente/tomar/` por HTTPS cada 10 s con la cabecera
`X-Puente-Clave` (respaldo). `.venv/bin/python manage.py puente_diagnostico` (en `BackEnd/`)
muestra el último diagnóstico de cada ESP para saber si un corte fue de la red o del ESP.

- Usuario MQTT del ESP: `bash Mosquitto/dispositivo.sh <codigo_mqtt>` (imprime la contraseña
  una vez; va solo al `secrets.py` de la placa).
- La firma tiene 12 s para llegar; si no llega, se responde con lo predefinido.
- En producción el servidor usa `IA_MODELO_LOCAL=qwen3:4b-instruct` con `IA_ESPERA_SEGUNDOS=40`
  (elegido con el banco del 2026-11-20 frente a qwen2.5:3b, llama3.2:3b, granite4.1:3b, phi4-mini y
  qwen3.5:4b: el único que no inventó causas ni cifras y clasificó bien todas las preguntas).
  Las peticiones mandan `think: false` (los modelos que «piensan» gastarían la espera) y
  siempre `num_ctx` 2048 y 3 hilos: si otra plataforma comparte el Ollama, debe usar los mismos
  valores o el modelo se recarga en cada cambio. Para equipos con menos memoria, `qwen2.5:1.5b`.
- Encender: poner `IA_PUENTE_CLAVE` (`openssl rand -hex 24`) en `BackEnd/.env` y correr
  `bash deploy/instalar.sh`; levanta Ollama y descarga el modelo. La misma clave va en el ESP.
- Apagar: dejar `IA_PUENTE_CLAVE` vacía y volver a instalar; Ollama se detiene y el agente
  responde solo con lo predefinido, sin depender de ningún ESP.
- Si la IA tarda más de `IA_ESPERA_SEGUNDOS` (40 s), hay 2 peticiones en cola o pone una cifra
  que no viene de los datos, se responde con la predefinida.
- `deploy/compilar_apk.sh` apaga el Ollama del equipo donde compila y lo vuelve a encender al final;
  con la build en el equipo de compilación, el Ollama del servidor no se toca.
- Protección por carga: con menos de 1200 MB libres el agente deja de usar la IA (responde con
  reglas y herramientas) y limita las preguntas por usuario (30 por minuto normal, 10 con carga
  alta, 4 por debajo de 500 MB). Si TimescaleDB no responde, avisa que está en mantenimiento.
- Mantenimiento manual mientras se estabiliza el servidor:
  `cd BackEnd && .venv/bin/python manage.py agente_mantenimiento on` (`off` lo regresa; sin
  argumento muestra el nivel y la memoria libre). El monitoreo y las alertas siguen funcionando.
- Un solo modelo cargado (`OLLAMA_MAX_LOADED_MODELS=1`) que puede compartir otra plataforma del
  servidor si usa el mismo `IA_MODELO_LOCAL`: dos peticiones en paralelo, cola de 8 y se queda
  cargado 30 min. Las respuestas redactadas se guardan 15 min: la misma petición no vuelve a
  ocupar el modelo.
- Preguntas y reacciones: tablas `pregunta_agente` (cómo se resolvió cada una) y
  `respuesta_aprendida` (banco), visibles en el admin de Django.

## Instalación desde cero

Son dos equipos con Debian 13 sin escritorio en la misma tailnet. Primero se prepara el sistema de
los dos, luego el servidor y al final el equipo de compilación.

### Sistema (los dos equipos)

1. Usuario administrador con `sudo` (en producción `adminlenovo` en el servidor y `adminasus` en el
   equipo de compilación), en los grupos `docker` y `systemd-journal`. Zona horaria
   `America/Tijuana` (`sudo timedatectl set-timezone America/Tijuana`): los timers usan hora local.
2. Red con **NetworkManager** e IP fija. Si el instalador de Debian dejó el Wi-Fi en
   `/etc/network/interfaces` con su propio cliente DHCP, quita ahí la interfaz Wi-Fi y enmascara ese
   cliente (`sudo systemctl mask dhcpcd`, o el que haya): si sigue corriendo añade una segunda IP
   y, al detenerlo, la tarjeta se queda sin configurar. Luego, por cada red:

   ```bash
   sudo nmcli con add type wifi ifname <interfaz> con-name casa ssid '<red>' \
     wifi-sec.key-mgmt wpa-psk wifi-sec.psk '<clave>' \
     ipv4.method manual ipv4.addresses <IP>/24 ipv4.gateway <router> ipv4.dns '1.1.1.1 8.8.8.8' \
     802-11-wireless.powersave 2 connection.autoconnect-priority 20
   ```

   La red de respaldo, igual con `autoconnect-priority 10`. Reserva también la IP en el router.
   Si un rfkill deja el Wi-Fi bloqueado: `sudo rfkill unblock wifi`.
3. Sin suspensión:
   `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target` y
   `HandleLidSwitch=ignore` (y `HandleLidSwitchExternalPower=ignore`) en
   `/etc/systemd/logind.conf`. Si la pantalla queda negra al arrancar, agrega `nomodeset` a
   `GRUB_CMDLINE_LINUX_DEFAULT` y `GRUB_TERMINAL=console` en `/etc/default/grub` (`sudo update-grub`).
4. Batería: tope de carga si el equipo lo permite. En Lenovo IdeaPad, un archivo en
   `/etc/tmpfiles.d/` con
   `w /sys/bus/platform/devices/VPC2004:00/conservation_mode - - - - 1` lo deja fijo en cada arranque.
5. Paquetes: `openssh-server git curl tmux rsync jq lm-sensors rclone docker.io docker-compose ufw
   fail2ban auditd unattended-upgrades` (o Docker desde su repositorio), `uv` (Python 3.12) y Node 22
   con nvm. `uv` se instala en `~/.local/bin`, que las sesiones de tmux abiertas por SSH no cargan: enlázalo
   con `sudo ln -sf ~/.local/bin/uv ~/.local/bin/uvx /usr/local/bin/` o los despliegues fallan con
   «uv: orden no encontrada».
6. Tailscale (`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`), llaves SSH
   de los equipos de administración en `~/.ssh/authorized_keys` y la llave del equipo de
   compilación en el servidor. Prueba el SSH por Tailscale **antes** del siguiente paso.
7. Seguridad: [ufw solo Tailscale, sshd, fail2ban, unattended-upgrades y auditd](#firewall).

### Servidor

1. Clona el repositorio en `/var/www/html/Nucleo` (rama `main`). Copia los respaldos a
   `~/traspaso` (o el zip semanal) y corre `bash deploy/restaurar.sh ~/traspaso`: trae la aplicación
   (`.env` incluidos), el broker y las bases ([Restaurar](#restaurar)).
2. `bash deploy/configurar_env.sh` — crea `BackEnd/.env`; pide la contraseña de aplicación de Gmail.
3. Cloudflare Tunnel: `sudo apt install cloudflared` (repositorio `pkg.cloudflare.com`),
   `cloudflared tunnel login` (se autoriza `bynucleo.com` en el navegador), luego
   `cloudflared tunnel create nucleo` y `cloudflared tunnel route dns nucleo <host>` para
   `bynucleo.com`, `www.bynucleo.com`, `app.bynucleo.com`, `info.bynucleo.com`, `nicoai.bynucleo.com`, `admin.bynucleo.com` y `dispositivos.bynucleo.com`. Copia `~/.cloudflared/<ID>.json` a `/etc/cloudflared/` (permiso 600)
   y pon `CLOUDFLARE_TUNEL=<ID>` en el `.env` raíz. Si `tunnel create` falla con 524, activa
   Zero Trust (plan Free) en la cuenta del dominio. Para mudar de servidor basta con copiar
   `/etc/cloudflared/` y `~/.cloudflared/` (y apagar el `cloudflared` del equipo anterior).
4. `bash deploy/instalar.sh` — dependencias, migraciones, build de la web, Caddy, servicios y
   túnel. Corre con `umask 022` (dentro de `tmux` si es largo).
5. Deshabilita los respaldos locales, que hará el equipo de compilación:
   `sudo systemctl disable --now nucleo-respaldo.timer nucleo-prueba-restauracion.timer`.
6. Descanso diario (opcional): `sudo apt install util-linux-extra` (trae `rtcwake`),
   `sudo install -m 755 deploy/descanso-servidor/descanso-lenovo /usr/local/sbin/`,
   `sudo install -m 644 deploy/descanso-servidor/*.service deploy/descanso-servidor/*.timer /etc/systemd/system/`,
   `sudo systemctl enable --now descanso-lenovo.timer && sudo systemctl enable descanso-lenovo-arranque.service`
   y Wake-on-WLAN en cada red: `sudo nmcli con modify <red> 802-11-wireless.wake-on-wlan magic`.

### Equipo de compilación

1. Clona el repositorio en `/var/www/html/Nucleo` (rama `main`) y copia el `BackEnd/.env` del
   servidor (de ahí sale la URL de la API para compilar la web). Instala los requisitos del APK
   ([App móvil](#app-móvil-apk)), copia `Mobile/google-services.json` y la llave de firma a
   `~/nucleo-app` (o recupérala de `nucleo_firma_app_*.tar.gz`).
2. Guarda la contraseña de `sudo` del servidor en `~/.config/despliegue-lenovo` (`chmod 600`) e
   instala los scripts:

   ```bash
   cd deploy/dos-equipos
   sudo install -m 755 desplegar-nucleo compilar-apk-nucleo respaldo-nucleo-remoto respaldo-semanal \
     prueba-restauracion-nucleo respaldo-aviso despertar-lenovo mantenimiento-asus-correo /usr/local/bin/
   sudo install -m 755 mantenimiento-asus /usr/local/sbin/
   sudo install -D -m 644 respaldo-comun.sh /usr/local/lib/respaldo-remoto/comun.sh
   sudo install -m 644 *.service *.timer /etc/systemd/system/
   ```

   Si el usuario no es `adminasus` o el servidor tiene otra dirección, ajusta `User=` y las
   direcciones de las unidades antes de instalarlas.
3. Remotos de Drive: `rclone config create gdrive-nucleo drive scope=drive.file` y después el
   remoto cifrado ([Respaldos cifrados](#respaldos-cifrados)). Crea
   `~/.config/respaldo-remoto/nucleo.env` (600) con `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`,
   `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` y `AVISOS_A`.
4. `sudo systemctl daemon-reload && sudo systemctl enable --now respaldo-nucleo-remoto.timer
   respaldo-nucleo-semanal.timer prueba-restauracion-nucleo-remoto.timer`. Prueba con
   `respaldo-nucleo-remoto`, `respaldo-semanal nucleo gdrive-nucleo-cifrado: $(date +%F)` y
   `prueba-restauracion-nucleo`.
5. Vigilante (`vigia`): se instala desde la copia del equipo de administración en
   `/usr/local/bin/vigia` con `vigia.service`/`vigia.timer`, su `~/.config/vigia.conf` y la copia del
   SMTP en `~/.config/vigia-smtp-nucleo.env`. Prueba con `vigia --prueba` antes de habilitar el timer.
6. Prueba un despliegue con `desplegar-nucleo`.

| Archivo | Para qué |
| --- | --- |
| `instalar.sh`, `desplegar.sh` | Instalar o actualizar |
| `restaurar.sh`, `respaldar.sh` | Restaurar desde respaldos y respaldar |
| `probar_restauracion.sh` | Prueba mensual de restauración (RTO) |
| `aviso_fallo.sh`, `nucleo-aviso@.service` | Correo cuando falla un servicio |
| `firewall.sh`, `firewall.nft`, `nucleo-firewall.service` | Firewall nftables para un servidor de un solo equipo (sin ufw) |
| `configurar_env.sh`, `backend.env.ejemplo` | Generar `BackEnd/.env` de producción |
| `nucleo.caddy`, `cloudflared.yml` | Caddy y Cloudflare Tunnel |
| `*.service`, `*.timer` | Servicios y tareas de systemd |
| `dos-equipos/` | Copias de referencia de los scripts y unidades del equipo de compilación |
