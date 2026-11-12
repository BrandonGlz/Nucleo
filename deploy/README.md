# Servidor de Núcleo

Núcleo corre en una laptop ASUS X75A con Debian 13 (`homelab`: Intel Core i5-3230M, 8 GB de RAM y disco duro HDD de 750 GB). Se publica
en internet con un Cloudflare Tunnel en el dominio `bynucleo.com`, sin puertos abiertos en el
router, así que se llega desde cualquier red. Tailscale Funnel (`nucleo.<tailnet>.ts.net`) sigue
activo para los ESP32 (MQTT en el 8443) y para las apps instaladas con la dirección anterior.

| Qué | Dirección |
| --- | --- |
| Web | https://bynucleo.com (`www.` redirige aquí) |
| API (la usa la app) | https://bynucleo.com/api/v1 |
| Admin de Django | https://bynucleo.com/admin/ |
| MQTT de los ESP32 | `nucleo.tailb3f7d8.ts.net:8443` (TLS) |
| Dirección anterior | https://nucleo.tailb3f7d8.ts.net (sigue funcionando) |

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

- `bynucleo.com` y `www.bynucleo.com` llegan por el Cloudflare Tunnel `nucleo` (servicio
  `cloudflared`, configuración `deploy/cloudflared.yml` → `/etc/cloudflared/config.yml`) a Caddy
  (`127.0.0.1:8081`); Caddy redirige `www` al dominio principal. Los DNS son CNAME del túnel en
  Cloudflare (`cloudflared tunnel route dns nucleo <host>`). El Tailscale del host es solo de TMO.
- Núcleo conserva además su propia máquina de Tailscale, `nucleo`: el contenedor
  `nucleo_tailscale` (perfil `servidor` de `docker-compose.yml`) que publica Caddy (`127.0.0.1:8081`) con Funnel según
  `tailscale-serve.json`. Se conecta la primera vez con `TS_AUTHKEY` en el `.env` raíz.
- Caddy sirve la web compilada y pasa `/api`, `/admin` y `/ws` a Daphne (`127.0.0.1:8001`).
- systemd: `nucleo-daphne` (API y WebSocket), `nucleo-mqtt` (lecturas del broker),
  `nucleo-sin-conexion`, `nucleo-reportes.timer` (cada 15 min) y `nucleo-respaldo.timer` (diario).
- La laptop no se suspende con la tapa cerrada ni por inactividad, y NetworkManager usa el cable
  si está conectado y el Wi-Fi como respaldo.

## Operación

Todos desde la laptop, en `/var/www/html/Nucleo`:

- `bash deploy/desplegar.sh` — trae los cambios de `dev` y reinstala; se puede repetir.
- `systemctl status nucleo-daphne nucleo-mqtt caddy --no-pager` — estado de los servicios.
- `journalctl -u nucleo-daphne -n 50 --no-pager` — últimos mensajes de la API.
- `docker ps` — contenedores: postgres, timescaledb, redis, mosquitto y tailscale.
- `docker exec nucleo_tailscale tailscale --socket=/tmp/tailscaled.sock funnel status` — qué publica la máquina `nucleo`.
- `bash deploy/respaldar.sh` — respaldo inmediato en `~/respaldos/nucleo` y en Drive (`gdrive-nucleo:servidor/nucleo`).

### App móvil (APK)

El APK se descarga en `https://bynucleo.com/app/nucleo.apk`. Caddy entrega la carpeta
`deploy/descargas/` del proyecto (no va a git), donde también queda una copia por versión (`nucleo-<versión>.apk`).

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

El ESP32 de cada dispositivo es la **llave** de su agente. Por MQTT (Funnel en el puerto
**8443**, TLS de Let's Encrypt hacia el listener interno 1883 de Mosquitto) publica un latido
cada 20 s con su diagnóstico de red y firma cada petición: el backend publica `{id, reto}` en
`nucleo/devices/<c>/puente/peticion` y el ESP responde en `.../puente/autoriza` con
HMAC-SHA256(`IA_PUENTE_CLAVE`, `codigo:id:reto`). Solo con esa firma el backend llama a
Ollama (`IA_OLLAMA_URL`, local). Sin latido ni lecturas en 75 s, o con el último mensaje del
ESP (`{"estado":"offline"}`), el agente se deshabilita en la web y en la app. Si la red del ESP
bloquea el 8443, el ESP consulta `GET /api/v1/puente/tomar/` por HTTPS cada 10 s con la cabecera
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
3. Agrega `TS_AUTHKEY=tskey-auth-…` al `.env` raíz (clave *Reusable* de
   https://login.tailscale.com/admin/settings/keys).
4. Cloudflare Tunnel: `sudo apt install cloudflared` (repositorio `pkg.cloudflare.com`),
   `cloudflared tunnel login` (se autoriza `bynucleo.com` en el navegador), luego
   `cloudflared tunnel create nucleo`, `cloudflared tunnel route dns nucleo bynucleo.com` y
   `... www.bynucleo.com`. Copia `~/.cloudflared/<ID>.json` a `/etc/cloudflared/` (permiso 600)
   y pon `CLOUDFLARE_TUNEL=<ID>` en el `.env` raíz. Si `tunnel create` falla con 524, activa
   Zero Trust (plan Free) en la cuenta del dominio. Para mudar de servidor basta con copiar
   `/etc/cloudflared/` y `~/.cloudflared/`.
5. `bash deploy/instalar.sh` — dependencias, migraciones, build de la web, Caddy, servicios, Funnel y túnel.
6. Para respaldar en Drive: `rclone config create gdrive-nucleo drive scope=drive.file`.

| Archivo | Para qué |
| --- | --- |
| `instalar.sh`, `desplegar.sh` | Instalar o actualizar |
| `restaurar.sh`, `respaldar.sh` | Restaurar desde respaldos y respaldar |
| `configurar_env.sh`, `backend.env.ejemplo` | Generar `BackEnd/.env` de producción |
| `nucleo.caddy`, `tailscale-serve.json`, `cloudflared.yml` | Caddy, Funnel y Cloudflare Tunnel |
| `*.service`, `*.timer` | Servicios y tareas de systemd |
