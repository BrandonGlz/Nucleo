# Servidor de Núcleo

Núcleo corre en una laptop con Debian 13 (`homelab`, 4 GB de RAM). Se publica
en internet con Tailscale Funnel, sin dominio ni puertos abiertos en el router, así que se
llega desde cualquier red.

| Qué | Dirección |
| --- | --- |
| Web | https://nucleo.tailb3f7d8.ts.net |
| API (la usa la app) | https://nucleo.tailb3f7d8.ts.net/api/v1 |
| Admin de Django | https://nucleo.tailb3f7d8.ts.net/admin/ |

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

- Núcleo se publica con su propia máquina de Tailscale, `nucleo`: el contenedor
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

El APK se descarga en `https://nucleo.<tailnet>.ts.net/app/nucleo.apk`. Caddy entrega la carpeta
`deploy/descargas/` del proyecto (no va a git), donde también queda una copia por versión (`nucleo-<versión>.apk`).

Para publicar una versión nueva, en la laptop: subir `version` en `Mobile/app.json` y correr
`bash deploy/compilar_apk.sh` (mejor en tmux y en horario de poco uso). Compila en la laptop con la API del
perfil `piloto` de `Mobile/eas.json`, con prioridad baja; tarda 15-25 min y usa 3-4 GB de RAM solo mientras
corre. El enlace no cambia y no hace falta reiniciar nada.

Requisitos (una vez): `sudo apt install openjdk-21-jdk-headless unzip` y las herramientas de línea de comandos
de Android en `~/android-sdk/cmdline-tools/latest` con las licencias aceptadas
(`yes | sdkmanager --licenses`); Gradle descarga el resto. La llave de firma vive en `~/nucleo-app`
(fuera de git) y entra en el respaldo diario: sin ella no se puede actualizar la app ya instalada.

## Instalación desde cero

1. Copia los respaldos a `~/traspaso` y corre `bash deploy/restaurar.sh ~/traspaso`.
2. `bash deploy/configurar_env.sh` — crea `BackEnd/.env`; pide la contraseña de aplicación de Gmail.
3. Agrega `TS_AUTHKEY=tskey-auth-…` al `.env` raíz (clave *Reusable* de
   https://login.tailscale.com/admin/settings/keys).
4. `bash deploy/instalar.sh` — dependencias, migraciones, build de la web, Caddy, servicios y Funnel.
5. Para respaldar en Drive: `rclone config create gdrive-nucleo drive scope=drive.file`.

| Archivo | Para qué |
| --- | --- |
| `instalar.sh`, `desplegar.sh` | Instalar o actualizar |
| `restaurar.sh`, `respaldar.sh` | Restaurar desde respaldos y respaldar |
| `configurar_env.sh`, `backend.env.ejemplo` | Generar `BackEnd/.env` de producción |
| `nucleo.caddy`, `tailscale-serve.json` | Caddy y la publicación con Funnel |
| `*.service`, `*.timer` | Servicios y tareas de systemd |
