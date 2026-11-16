# Servidor de Núcleo

Núcleo corre en una laptop ASUS X75A con Debian 13 (`homelab`: Intel Core i5-3230M, 8 GB de RAM y disco duro HDD de 750 GB). Se publica
en internet con un Cloudflare Tunnel en el dominio `bynucleo.com`, sin puertos abiertos en el
router, así que se llega desde cualquier red. Núcleo no usa Tailscale; el Tailscale del host solo
sirve para entrar por SSH.

| Qué | Dirección |
| --- | --- |
| Web | https://bynucleo.com (`www.` redirige aquí) |
| API (la usa la app) | https://bynucleo.com/api/v1 |
| Admin de Django | https://bynucleo.com/admin/ |
| Descarga de la app | https://app.bynucleo.com (`bynucleo.com/app/…` redirige aquí) |
| Consola de Nico AI | https://nicoai.bynucleo.com (solo superusuario) |
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
2. Entra a la laptop:

   ```bash
   ssh userhomelab@100.65.53.53
   ```

En la misma red de la casa también sirve `ssh userhomelab@<IP local>` (se ve en la laptop con
`ip -br a`).

## Cómo está armado

- Todo llega por el Cloudflare Tunnel `nucleo` (servicio `cloudflared`, configuración
  `deploy/cloudflared.yml` → `/etc/cloudflared/config.yml`):
  - `bynucleo.com` y `www.` → Caddy (`127.0.0.1:8081`), que manda `http://` a `https://` y `www`
    al dominio principal.
  - `app.bynucleo.com` → Caddy, que entrega `deploy/descargas/` (la raíz lleva a `nucleo-<versión>.apk`).
  - `nicoai.bynucleo.com` → Caddy, igual que `bynucleo.com`: es la misma web compilada, que al ver ese
    host abre la consola de Nico AI (solo el superusuario, rol administrador de plataforma).
  - `dispositivos.bynucleo.com/mqtt` → directo al listener WebSocket de Mosquitto
    (`127.0.0.1:51884`). El resto de ese subdominio pasa por Caddy, que solo deja el respaldo
    HTTPS de Nico, la actualización del firmware y la hora (`/api/v1/puente/`, `/api/v1/health/`)
    y lo demás lo manda a la web.
- Los DNS son CNAME del túnel en Cloudflare: `cloudflared tunnel route dns nucleo <host>` por cada
  nombre (`bynucleo.com`, `www`, `app`, `nicoai`, `dispositivos`).
- Caddy sirve la web compilada y pasa `/api`, `/admin` y `/ws` a Daphne (`127.0.0.1:8001`).
- systemd: `nucleo-daphne` (API y WebSocket), `nucleo-mqtt` (lecturas del broker),
  `nucleo-sin-conexion`, `nucleo-reportes.timer` (cada 15 min), `nucleo-respaldo.timer` (03:45 y
  15:45) y `nucleo-prueba-restauracion.timer` (primer domingo del mes, 04:30). Si cualquiera
  falla, `nucleo-aviso@.service` manda un correo con sus últimas líneas de bitácora.
- La laptop no se suspende con la tapa cerrada ni por inactividad, y NetworkManager usa el cable
  si está conectado y el Wi-Fi como respaldo.

## Operación

Todos desde la laptop, en `/var/www/html/Nucleo`:

- `bash deploy/desplegar.sh` — trae `main` y reinstala; se puede repetir. Producción solo corre
  `main`; `dev` es para probar en local y se une a `main` cuando está lista.
- `systemctl status nucleo-daphne nucleo-mqtt caddy --no-pager` — estado de los servicios.
- `journalctl -u nucleo-daphne -n 50 --no-pager` — últimos mensajes de la API.
- `docker ps` — contenedores: postgres, timescaledb, redis, mosquitto y ollama.
- `systemctl status cloudflared --no-pager` — estado del túnel de Cloudflare.
- `bash deploy/respaldar.sh` — respaldo inmediato en `~/respaldos/nucleo` y en Drive (cifrado en
  `gdrive-nucleo-cifrado:`; sin ese remoto, en claro en `gdrive-nucleo:servidor/nucleo`).
- `bash deploy/probar_restauracion.sh` — prueba de restauración inmediata (contenedores
  temporales, no toca producción); el registro queda en `~/respaldos/nucleo-pruebas`.
- `bash deploy/firewall.sh estado` — reglas del firewall y conexiones rechazadas.

## Seguridad y recuperación

### Respaldos cifrados

Drive solo recibe archivos cifrados (nombres incluidos) con un remoto `crypt` de rclone sobre el
remoto normal. Una sola vez, en la laptop:

```bash
rclone config create gdrive-nucleo-cifrado crypt \
  remote=gdrive-nucleo:servidor/nucleo-cifrado \
  password="$(rclone obscure 'CONTRASEÑA-LARGA')" \
  password2="$(rclone obscure 'OTRA-CONTRASEÑA-LARGA')"
```

Guarda las dos contraseñas fuera del servidor (gestor de contraseñas): sin ellas los respaldos
no se pueden leer. Desde ese momento `respaldar.sh` usa el remoto cifrado y los respaldos en claro
anteriores se borran solos a los 30 días. Para restaurar en otra máquina se crea el mismo remoto
con las mismas contraseñas y `rclone copy gdrive-nucleo-cifrado: ~/traspaso --max-age 2d`.

### Objetivos de recuperación

| Medida | Valor |
| --- | --- |
| RPO (datos que se pueden perder) | 12 h: respaldo a las 03:45 y 15:45 |
| RTO (tiempo para volver) | El que mide la prueba mensual (≈ 1 min para restaurar las bases; más la instalación si es otra máquina) |
| Prueba | `nucleo-prueba-restauracion.timer` restaura, compara conteos y avisa por correo |

### Llave de cifrado de datos

`instalar.sh` agrega a `BackEnd/.env` una `NUCLEO_CLAVE_CIFRADO` (Fernet) si no existe; con ella se
cifran el teléfono de los usuarios y los secretos de la verificación en dos pasos y de los
webhooks. Guarda una copia fuera del servidor: si se pierde, esos campos no se pueden leer (los
respaldos de la base los traen cifrados).

### Firewall

El servidor usa **ufw**: niega todo lo entrante salvo Tailscale (`tailscale0`, por donde entran
SSH y TMO) y SSH desde la red local (`192.168.0.0/16` y `fe80::/10`). Las visitas de Núcleo no
necesitan puertos abiertos porque llegan por el túnel de Cloudflare, que sale desde el servidor.

```bash
sudo ufw status numbered
```

Antes de quitar una regla de SSH, programa una vuelta atrás y cancélala cuando una sesión SSH
nueva funcione:

```bash
sudo systemd-run --unit=ufw-vuelta-atras --on-active=180 /usr/sbin/ufw allow OpenSSH
# ...cambios y prueba desde otra sesión...
sudo systemctl stop ufw-vuelta-atras.timer
```

En un servidor sin ufw, `deploy/firewall.nft` hace lo mismo con nftables:
`bash deploy/firewall.sh aplicar` y, desde **otra** sesión SSH, `bash deploy/firewall.sh confirmar`
(sin confirmar se quita solo a los 3 minutos). El script se niega a cargarse si ufw está activo.

### Reglas de Cloudflare (panel)

Ya creadas en `bynucleo.com` (plan Free) con la API de Cloudflare; se ven y editan en
**Security → WAF** (*Custom rules* y *Rate limiting rules*). Si se pierden, se recrean así:

| Regla | Expresión | Acción |
| --- | --- | --- |
| Escáneres | `starts_with(http.request.uri.path, "/wp-") or starts_with(http.request.uri.path, "/.env") or starts_with(http.request.uri.path, "/.git") or ends_with(http.request.uri.path, ".php")` | Block |
| Admin solo desde México | `starts_with(http.request.uri.path, "/admin") and ip.src.country ne "MX"` | Block |
| Límite de acceso (Rate limiting) | `http.request.uri.path in {"/api/v1/auth/login/" "/api/v1/auth/recuperar/" "/api/v1/auth/restablecer/"}`, 5 peticiones / 10 s por IP | Block 10 s |

No actives Bot Fight Mode: bloquearía a los ESP32, a la app y al vigía de GitHub.

### Avisos y vigilancia

- `nucleo-aviso@.service`: correo a `NUCLEO_CORREOS_AVISOS` (o a los administradores de
  plataforma) cuando un servicio falla, como mucho uno por hora por servicio
  (`NUCLEO_AVISO_MINUTOS`).
- `.github/workflows/vigia.yml`: cada 15 min revisa desde fuera la web, la API, la app y el
  subdominio de los ESP32. GitHub solo ejecuta los flujos programados de la rama principal, así
  así que vigila desde `main`; las fallas llegan por correo de GitHub.
- En **Settings → Code security** del repositorio activa *Dependabot alerts* y *security
  updates*; `seguridad.yml` corre CodeQL, ruff y `npm audit` en cada push.

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

Si la laptop se pierde, cualquier equipo con Debian y 8 GB sirve:

1. Instala Docker, git, Caddy, rclone y cloudflared; clona el repositorio en `/var/www/html/Nucleo`
   (rama `main`).
2. Crea los remotos `gdrive-nucleo` y `gdrive-nucleo-cifrado` (mismas contraseñas), baja el último
   respaldo y sigue [Instalación desde cero](#instalación-desde-cero). Pon en `BackEnd/.env` la
   misma `NUCLEO_CLAVE_CIFRADO`.
3. Copia `/etc/cloudflared/` y `~/.cloudflared/` (o crea el túnel de nuevo): los dominios apuntan
   al túnel, no a una IP, así que el cambio es inmediato.
4. Revisa con el vigía o `curl https://bynucleo.com/api/v1/health/`.

### App móvil (APK)

El APK se descarga en `https://app.bynucleo.com`. Caddy entrega la carpeta
`deploy/descargas/` del proyecto (no va a git), donde queda un APK por versión (`nucleo-<versión>.apk`). La raíz
(`index.html`, sale de la plantilla `deploy/descarga.html`; el script y cada deploy la regeneran) lleva al de la versión publicada, así que se descarga con la versión en el
nombre; el enlace anterior `/nucleo.apk` lleva a la raíz. El login de la web tiene un botón a este enlace.
`bash deploy/compilar_apk.sh --indice` solo regenera esa página con el APK ya compilado de la versión de `Mobile/app.json` (o el más reciente, si esa aún no se compila).

Para publicar una versión nueva, en la laptop: subir `version` en `Mobile/app.json` y correr
`bash deploy/compilar_apk.sh` (mejor en tmux). Compila en la laptop con la API del perfil `piloto` de
`Mobile/eas.json`, con prioridad baja y solo para arm64-v8a (todos los celulares actuales; otra arquitectura con
`NUCLEO_ABIS=arm64-v8a,armeabi-v7a`). El enlace no cambia y no hace falta reiniciar nada.

Es incremental: si `Mobile/` no cambió desde el último APK no compila; reinstala `node_modules` solo si cambió
`package-lock.json` y regenera `android/` solo si cambió la configuración nativa (`app.json`, `eas.json`,
dependencias). Un cambio solo de pantallas tarda alrededor de 1 min (unos 2 GB de RAM); desde cero va con una
tarea a la vez para cuidar la memoria y tarda más. La memoria se usa solo mientras corre. Opciones: `--forzar` (compila aunque no haya cambios) y `--limpio` (borra `node_modules` y
`android/` y compila todo, por si algo sale raro).

#### Notificaciones push

Con la app abierta las alertas llegan por el canal en vivo (y la app oculta el push repetido);
con la app cerrada llegan por push: el backend las manda a Expo y Expo las entrega por Firebase.
Ya está configurado y probado en un teléfono:

| Pieza | Dónde |
| --- | --- |
| Proyecto de Expo | cuenta `nucleo-expo`, proyecto `-nucleo-mobile` (así quedó el nombre); su ID va en `Mobile/app.json` (`extra.eas.projectId`) y en `EXPO_PUBLIC_EAS_PROJECT_ID` de `Mobile/eas.json` |
| Firebase | proyecto `nucleo-firebase`, app Android `com.nucleo.mobile` |
| `google-services.json` | `Mobile/` de la laptop, fuera de git; sin él el APK no recibe push |
| Clave FCM V1 | subida a Expo y asignada a `com.nucleo.mobile` (`npx eas-cli credentials -p android` con la sesión de `nucleo-expo`) |
| Backend | `NUCLEO_PUSH_HABILITADO=true` en `BackEnd/.env` |

Si se pierde `google-services.json`, se vuelve a descargar en Firebase → Configuración del
proyecto → General → Tus apps, se copia a `Mobile/` y se recompila el APK. Para probar un push,
la app debe estar cerrada.

Requisitos (una vez): `sudo apt install openjdk-21-jdk-headless unzip` y las herramientas de línea de comandos
de Android en `~/android-sdk/cmdline-tools/latest` con las licencias aceptadas
(`yes | sdkmanager --licenses`); Gradle descarga el resto. La llave de firma vive en `~/nucleo-app`
(fuera de git) y entra en el respaldo diario: sin ella no se puede actualizar la app ya instalada.

## Nico AI con IA local (Ollama) y el ESP32 puente

Nico AI responde primero con respuestas predefinidas y con las que aprendió de los 👍 de los
usuarios (tabla `respuesta_aprendida`). Solo cuando se le pide explicar, opinar o recomendar
(«¿es grave?», «¿por qué subió?», «¿qué recomiendas?») redacta con un modelo local chico
(`qwen2.5:1.5b`, ~1.2 GB de RAM cargado, tope 3 GB; ~3 s por respuesta con el modelo cargado,
~6 s si estaba descargado y ~13 s con dos a la vez o con la firma del ESP incluida) que corre en
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
- Con todo encendido el servidor usa ~2.7 GB de los 8 GB (Ollama ~1.2 GB) y la carga ronda 0.5.
- Encender: poner `IA_PUENTE_CLAVE` (`openssl rand -hex 24`) en `BackEnd/.env` y correr
  `bash deploy/instalar.sh`; levanta Ollama y descarga el modelo. La misma clave va en el ESP.
- Apagar: dejar `IA_PUENTE_CLAVE` vacía y volver a instalar; Ollama se detiene y el agente
  responde solo con lo predefinido, sin depender de ningún ESP.
- Si la IA tarda más de `IA_ESPERA_SEGUNDOS` (20 s), hay 2 peticiones en cola o pone una cifra
  que no viene de los datos, se responde con la predefinida.
- `deploy/compilar_apk.sh` apaga Ollama mientras compila la app y lo vuelve a encender al final.
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

1. Copia los respaldos a `~/traspaso` y corre `bash deploy/restaurar.sh ~/traspaso`.
2. `bash deploy/configurar_env.sh` — crea `BackEnd/.env`; pide la contraseña de aplicación de Gmail.
3. Cloudflare Tunnel: `sudo apt install cloudflared` (repositorio `pkg.cloudflare.com`),
   `cloudflared tunnel login` (se autoriza `bynucleo.com` en el navegador), luego
   `cloudflared tunnel create nucleo` y `cloudflared tunnel route dns nucleo <host>` para
   `bynucleo.com`, `www.bynucleo.com`, `app.bynucleo.com`, `nicoai.bynucleo.com` y `dispositivos.bynucleo.com`. Copia `~/.cloudflared/<ID>.json` a `/etc/cloudflared/` (permiso 600)
   y pon `CLOUDFLARE_TUNEL=<ID>` en el `.env` raíz. Si `tunnel create` falla con 524, activa
   Zero Trust (plan Free) en la cuenta del dominio. Para mudar de servidor basta con copiar
   `/etc/cloudflared/` y `~/.cloudflared/`.
4. `bash deploy/instalar.sh` — dependencias, migraciones, build de la web, Caddy, servicios y túnel.
5. Para respaldar en Drive: `rclone config create gdrive-nucleo drive scope=drive.file` y después
   el remoto cifrado ([Respaldos cifrados](#respaldos-cifrados)).
6. Firewall: [ufw con SSH solo por Tailscale y la red local](#firewall).

| Archivo | Para qué |
| --- | --- |
| `instalar.sh`, `desplegar.sh` | Instalar o actualizar |
| `restaurar.sh`, `respaldar.sh` | Restaurar desde respaldos y respaldar |
| `probar_restauracion.sh` | Prueba mensual de restauración (RTO) |
| `aviso_fallo.sh`, `nucleo-aviso@.service` | Correo cuando falla un servicio |
| `firewall.sh`, `firewall.nft`, `nucleo-firewall.service` | Firewall del host |
| `configurar_env.sh`, `backend.env.ejemplo` | Generar `BackEnd/.env` de producción |
| `nucleo.caddy`, `cloudflared.yml` | Caddy y Cloudflare Tunnel |
| `*.service`, `*.timer` | Servicios y tareas de systemd |
