# Servidor de Núcleo

Núcleo corre en una laptop con Debian 13 (`homelab`, 4 GB de RAM) junto con TMO. Se publica
en internet con Tailscale Funnel, sin dominio ni puertos abiertos en el router, así que se
llega desde cualquier red.

| Qué | Dirección |
| --- | --- |
| Web | https://nucleo.tailb3f7d8.ts.net |
| API (la usa la app) | https://nucleo.tailb3f7d8.ts.net/api/v1 |
| Admin de Django | https://nucleo.tailb3f7d8.ts.net/admin/ |
| TMO (misma laptop) | https://tmo.tailb3f7d8.ts.net |

## Acceso

Las contraseñas (cuentas demo, usuario de la laptop) no van en el repositorio: pídeselas al
administrador del servidor.

### 1. Usar la web o la app (cualquier persona, cualquier red)

No hace falta instalar nada: abre la URL desde el navegador de cualquier equipo o con datos
móviles. La app (APK del perfil `piloto` de `Mobile/eas.json`) ya apunta a la API del servidor.

### 2. Administrar el servidor por SSH (desde cualquier red)

El SSH no está expuesto a internet: se entra por la red privada de Tailscale (la *tailnet*),
que funciona igual en casa, en la escuela o con datos del celular.

1. **Que te den acceso a la tailnet.** El administrador, en
   https://login.tailscale.com/admin/users → **Invite users**, invita tu correo (o comparte
   solo la laptop: https://login.tailscale.com/admin/machines → fila `tmo` → **…** → **Share**).
   Acepta la invitación desde el correo.
2. **Instala Tailscale e inicia sesión** con la cuenta invitada:
   - Linux: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`
   - Windows y macOS: https://tailscale.com/download
   - Android e iOS: app **Tailscale** de la tienda.
3. **Entra a la laptop:**

   ```bash
   ssh userhomelab@tmo          # por nombre (MagicDNS)
   ssh userhomelab@100.65.53.53 # por IP de Tailscale, si el nombre no resuelve
   ```

   Pide la contraseña del usuario `userhomelab` al administrador. Desde el celular sirve una app
   SSH (por ejemplo Termius) con el mismo usuario y nombre.

Opcional, para entrar con la cuenta de Tailscale en vez de la contraseña de la laptop: el
administrador corre `sudo tailscale set --ssh` en la laptop.

### 3. Sin Tailscale (solo en la misma red de la casa)

`ssh userhomelab@<IP>`. La IP la da el router por DHCP y puede cambiar: se ve en la laptop con
`ip -br a` (línea `enp…` si está por cable, `wlp…` por Wi-Fi). Úsalo solo si Tailscale falla.

## Cómo está armado

- La laptop está en la tailnet como `tmo` (publica TMO). Núcleo usa una segunda máquina de
  Tailscale, `nucleo`: el contenedor `nucleo_tailscale` (perfil `servidor` de
  `docker-compose.yml`) que publica Caddy (`127.0.0.1:8081`) con Funnel según
  `tailscale-serve.json`. Se conecta la primera vez con `TS_AUTHKEY` en el `.env` raíz.
- Caddy sirve la web compilada y pasa `/api`, `/admin` y `/ws` a Daphne (`127.0.0.1:8001`).
- systemd: `nucleo-daphne` (API y WebSocket), `nucleo-mqtt` (lecturas del broker),
  `nucleo-sin-conexion`, `nucleo-reportes.timer` (cada 15 min) y `nucleo-respaldo.timer` (diario).
- El puerto 10000 de Funnel queda reservado para que los ESP32 lleguen al broker MQTT desde
  cualquier red.
- La laptop no se suspende con la tapa cerrada ni por inactividad, y NetworkManager usa el cable
  si está conectado y el Wi-Fi como respaldo.

## Operación

Todos desde la laptop, en `/var/www/html/Nucleo`:

- `bash deploy/desplegar.sh` — "trae los cambios de `dev` y reinstala; se puede repetir."
- `systemctl status nucleo-daphne nucleo-mqtt caddy --no-pager` — "estado de los servicios."
- `journalctl -u nucleo-daphne -n 50 --no-pager` — "últimos mensajes de la API."
- `docker ps` — "contenedores: postgres, timescaledb, redis, mosquitto y tailscale."
- `docker exec nucleo_tailscale tailscale --socket=/tmp/tailscaled.sock funnel status` — "qué publica la máquina `nucleo`."
- `bash deploy/respaldar.sh` — "respaldo inmediato en `~/respaldos/nucleo` y en Drive (`gdrive-nucleo:servidor/nucleo`)."

## Instalación desde cero

1. Copia los respaldos a `~/traspaso` y corre `bash deploy/restaurar.sh ~/traspaso`.
2. `bash deploy/configurar_env.sh` — "crea `BackEnd/.env`; pide la contraseña de aplicación de Gmail."
3. Agrega `TS_AUTHKEY=tskey-auth-…` al `.env` raíz (clave *Reusable* de
   https://login.tailscale.com/admin/settings/keys).
4. `bash deploy/instalar.sh` — "dependencias, migraciones, build de la web, Caddy, servicios y Funnel."
5. Para respaldar en Drive: `rclone config create gdrive-nucleo drive scope=drive.file`.

| Archivo | Para qué |
| --- | --- |
| `instalar.sh`, `desplegar.sh` | Instalar o actualizar |
| `restaurar.sh`, `respaldar.sh` | Restaurar desde respaldos y respaldar |
| `configurar_env.sh`, `backend.env.ejemplo` | Generar `BackEnd/.env` de producción |
| `nucleo.caddy`, `tailscale-serve.json` | Caddy y la publicación con Funnel |
| `*.service`, `*.timer` | Servicios y tareas de systemd |
