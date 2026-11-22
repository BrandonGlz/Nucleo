# Seguridad

Reúne en un solo lugar las medidas de seguridad de Núcleo. El detalle de cada una vive en el
documento de su componente, enlazado en cada sección.

## Secretos

- Los `.env` (raíz, `BackEnd/`, `FrontEnd/`, `Mobile/`) y `IoT/micropython/secrets.py` no se
  versionan; se protegen con `chmod 600`. Las plantillas `.env.example` y `secrets.example.py`
  no llevan valores reales.
- No se guardan contraseñas ni claves en el código, en la documentación ni en los commits.
- Las contraseñas de las bases, de Redis y del broker se generan con `openssl rand -hex 24`, y la
  clave de Django con `secrets.token_urlsafe(64)` ([guía local](../instalacion/guia-desarrollo-local.md)).
- `Mobile/google-services.json` (push con Firebase) y las claves privadas de los certificados
  (`Mosquitto/certs/*.key`) quedan fuera de git.
- Las credenciales del Wi-Fi y del broker del ESP32 solo viven en `secrets.py` y en la placa.
- `NUCLEO_CLAVE_CIFRADO` (llave Fernet de los campos cifrados) y la contraseña del remoto cifrado
  de rclone se guardan también fuera del servidor: sin ellas no se pueden leer los respaldos.

## Red

- PostgreSQL, TimescaleDB, Redis y Mosquitto solo escuchan en `127.0.0.1`.
- En producción todo entra por un Cloudflare Tunnel: no hay puertos abiertos en el router
  ([servidor](../servidor/produccion.md)). Django usa HTTPS obligatorio, cookies seguras,
  HSTS y `nosniff` (`config/settings/production.py`).
- El subdominio de los ESP32 (`dispositivos.bynucleo.com`) solo expone MQTT en WebSocket, el
  respaldo HTTPS de Nico, la actualización del firmware y la hora; lo demás lo manda a la web.
- Firewall ufw en el servidor y en el equipo de compilación: niega todo lo entrante, también
  desde la red de la casa, salvo Tailscale (SSH solo entra por ahí, con llave o contraseña y sin
  `root`). Además `fail2ban` para SSH, actualizaciones de seguridad automáticas (el servidor instala
  todas las actualizaciones cada día en su descanso de las 06:00; el equipo de compilación, a mano)
  y `auditd`. En un
  servidor de un solo equipo sin ufw, `deploy/firewall.nft` hace algo parecido con nftables, con
  vuelta atrás automática si no se confirma desde otra sesión SSH.
- Cloudflare (panel, sin API): reglas WAF que bloquean rutas de escáneres (`/wp-`, `/.env`,
  `/.git`, `.php`), `/admin` solo desde México y un límite de 5 peticiones cada 10 s por IP en
  inicio de sesión, recuperación y restablecimiento de contraseña. Bot Fight Mode queda apagado
  porque bloquearía a los ESP32, la app y el vigía.
- Detrás del túnel la IP real llega en `CF-Connecting-IP`; con
  `NUCLEO_CONFIAR_CF_CONNECTING_IP=True` los límites por IP y la auditoría la usan
  (`common/red.py`). Sin eso, todas las visitas parecerían venir de `127.0.0.1`.

## API y usuarios

- La API exige token salvo en el inicio de sesión, la salud y las rutas del ESP32 puente
  (`/api/v1/puente/`), que piden la clave `X-Puente-Clave` comparada en tiempo constante.
- **Sesiones por dispositivo**: cada inicio de sesión es una sesión aparte (navegador o teléfono,
  IP, último uso) y solo se guarda el SHA-256 de su clave. Caducan por inactividad y se pueden
  cerrar una por una desde la consola de administración.
- **Política de seguridad** (tabla `politica_seguridad`, editable en la consola de
  administración; al instalar toma los valores del `.env`): días sin uso para que caduque una
  sesión (7), intentos de inicio de sesión por minuto por IP (10), roles con verificación en dos
  pasos obligatoria, días que se guarda la bitácora (365) y si la actualización del firmware
  llega a todos los equipos. Los cambios aplican en menos de 15 segundos sin reiniciar.
- **Consola de administración** (https://admin.bynucleo.com, solo el administrador de
  plataforma): panel en gráficas (accesos, fallidos, horario, sesiones web/app, cuentas y
  equipos), alertas de seguridad (ver abajo), usuarios y roles de todas las
  organizaciones (alta, cambio de rol, desbloqueo, baja, restablecer contraseña, quitar la 2FA,
  cerrar sesiones), sesiones abiertas, equipos ESP32 (mantenimiento, baja, OTA), bitácora,
  integraciones y política.
- **Alertas de seguridad** (tabla `alerta_seguridad`, sección «Alertas» de la consola): se abren
  al ocurrir el evento, desde las señales de la bitácora y del usuario (`apps/consola/alertas.py`):
  ≥5 inicios de sesión fallidos desde una IP o ≥3 en una cuenta en 24 h (críticas desde 10),
  acceso desde una IP no usada en los 30 días previos y cuenta bloqueada (se cierra sola al
  desbloquearla). No se duplica la misma alerta abierta; se marca revisada o descartada con una
  nota y queda en la bitácora. Las cuentas sin la 2FA obligatoria se muestran calculadas al vuelo.
  Cada alerta nueva o que sube a crítica avisa a los superusuarios en la campana de la consola y
  por correo según sus preferencias (por omisión, correo solo con las críticas); no hay push.
- **Verificación en dos pasos (TOTP, RFC 6238)** en Mi perfil: QR para la app de autenticación,
  10 códigos de recuperación de un solo uso (se guarda solo su SHA-256) y el secreto cifrado. Un
  código ya usado no vale dos veces. La política de seguridad la vuelve obligatoria por rol:
  mientras no la configuren, esas cuentas solo pueden abrir su perfil.
- **Recuperación de contraseña** por correo: enlace de un solo uso que caduca en una hora; la
  respuesta es la misma exista o no el correo y se limita a 5 pedidos por hora por IP. Al
  restablecerla se cierran todas las sesiones.
- **Solicitud de acceso** sin cuenta (`/auth/solicitar-acceso/`, web y app): responde 204 siempre
  que los datos sean válidos, exista o no la cuenta (no revela correos registrados), tiene un campo
  trampa (`sitio`) para bots y se limita a 5 por hora por IP. Solo un ADMIN de esa organización (o
  el administrador de plataforma) la ve y la aprueba; la cuenta nace con contraseña temporal que se
  cambia al entrar.
- **Foto de perfil**: solo su dueño la cambia; se valida el contenido con Pillow (JPEG, PNG o WebP,
  ≤ 5 MB y ≤ 40 Mpx), se recodifica a WebP 256×256 con nombre aleatorio y se entrega por
  `/api/v1/fotos/` solo con sesión (`/media` no se publica).
- Las contraseñas de los usuarios se guardan cifradas con el hasher de Django y pasan sus
  validadores de contraseña.
- Autorización = rol + organización: cada vista declara qué roles leen, escriben o ejecutan
  acciones (`common/permissions.PermisoPorRol`) y cada consulta se limita a la organización, el
  área y el dispositivo del usuario (`common/scoping.py`). El canal en vivo aplica el mismo
  alcance. Detalle en [estructura del backend](../backend/estructura-backend.md) y en el
  [contrato de la API](../api/contrato-api.md).
- **Integraciones** (solo el administrador de plataforma, desde la consola): tokens de API de solo lectura (`Authorization: ApiKey …`, se guarda solo su
  SHA-256, con caducidad opcional y revocables) y webhooks de alertas firmados con HMAC-SHA256,
  solo hacia direcciones HTTPS públicas (sin redirecciones; protección contra SSRF), que se
  pausan solos tras 10 fallas seguidas.

## Datos (DLP)

- Campos sensibles cifrados en la base con Fernet (`common/cifrado.py`): teléfono de los
  usuarios, secreto de la verificación en dos pasos y secreto de los webhooks.
- **Bitácora de auditoría** (`apps/auditoria`, tabla `registro_auditoria`): inicios de sesión
  (también fallidos), cierres, recuperación de contraseña, cambios en la verificación en dos
  pasos, altas, cambios y bajas hechos por personas (con antes y después; las contraseñas y los
  secretos salen como «(oculto)»), integraciones y exportaciones, con la IP. Solo la ve el administrador de plataforma, en la consola de
  administración (filtra por organización); se depura a los días de la política de seguridad
  (365 al instalar).
- Exportación CSV de lecturas y alertas limitada al alcance del usuario y a
  `NUCLEO_EXPORTAR_MAX_FILAS`; cada exportación queda en la bitácora.

## Broker MQTT

- El broker exige TLS y usuario; hay un usuario por dispositivo, igual a su `codigo_mqtt`.
- La ACL (`Mosquitto/config/acl`) liga los tópicos al usuario autenticado (`%u`), no al client
  ID: un dispositivo solo publica sus lecturas, su latido y sus firmas, y solo lee su
  configuración y sus peticiones de firma. Detalle en [broker MQTT](../mqtt/broker-mosquitto.md).
- El ESP32 valida el certificado del servidor con las raíces de Let's Encrypt y Google que lleva
  el firmware, con la hora ya sincronizada.

## Nico AI

- El agente es de solo lectura y las cifras salen del backend; la IA solo redacta.
- La IA local solo se usa con la firma HMAC-SHA256 del ESP32 de Núcleo A-01 sobre un reto de un
  solo uso; la firma se compara en tiempo constante (`hmac.compare_digest`). Sin firma, el agente
  contesta solo con reglas ([Nico AI](../agente/nico-ai.md)).
- Supervisores, analistas y operadores solo usan a Nico con el ESP del dispositivo conectado; el
  administrador de la organización (y el superusuario en la consola) tiene un **modo de pruebas**
  sin ESP. La regla vive en el servidor (`puente.exige_puente`), no en los clientes.

## Firmware del ESP32 (OTA)

- La placa solo instala versiones con la firma HMAC-SHA256 de la clave del puente sobre el
  manifiesto, y comprueba el SHA-256 y el tamaño de cada archivo. Nunca se actualizan a distancia
  `secrets.py`, `boot.py` ni `actualizacion.py`.
- Si la versión nueva no llega a la plataforma tras 3 reinicios, vuelve sola a la anterior y no
  la repite. Detalle en [firmware](../iot/firmware-y-hardware.md#actualización-remota-ota).

## Respaldos y recuperación (DRP)

- El equipo de compilación (`respaldo-nucleo-remoto.timer`) respalda por SSH todos los días a las
  23:30 (RPO de 24 h) las dos bases y la configuración del servidor, y los guarda 10 días.
- Cada lunes a las 00:30 (`respaldo-nucleo-semanal.timer`) junta la semana en
  `nucleo_semana_<lunes>_al_<domingo>.zip` (una carpeta por día, solo el último respaldo de cada día;
  las bases completas a diario y cada tar —aplicación, broker y archivos subidos, llave de firma— solo
  el primer día y cuando cambió, con una nota `<tipo> - igual que <día>.txt` y una tabla en
  `CONTENIDO.txt` que dice de qué carpeta sale cada archivo), lo comprueba (CRC y que cada nota apunte
  a un archivo del zip) y lo sube a Google
  Drive por el remoto `crypt` de rclone (`gdrive-nucleo-cifrado:semanal`: nombre y contenido cifrados),
  verificado con `rclone cryptcheck`; se guardan unas 5 semanas. Fuera del equipo de compilación,
  el atraso puede ser de hasta una semana (RPO de 8 días si se pierden los dos equipos).
- Esos dos timers son los únicos respaldos: el del servidor (`nucleo-respaldo.timer`) está
  deshabilitado, no hay crons de respaldo y nada más sube a Drive.
- `prueba-restauracion-nucleo-remoto.timer` (en el equipo de compilación, primer domingo de cada
  mes) restaura el último respaldo en
  contenedores temporales, compara los conteos con producción, mide el tiempo (RTO), revisa que el
  último zip semanal pase la comprobación y esté en Drive, y manda el resultado por correo.
- Si un servicio falla, `nucleo-aviso@.service` manda por correo las últimas líneas de su
  bitácora (como mucho una vez por hora por servicio). El vigía de GitHub Actions
  (`.github/workflows/vigia.yml`) revisa cada 15 minutos la web, la API, la app y el subdominio
  de los ESP32 desde fuera, y el vigilante del equipo de compilación revisa sitios, servicios,
  equipo y accesos cada minuto. Ninguno revisa de 06:00 a 12:10, el descanso diario del servidor.
- Guía del servidor de reserva en [deploy/README.md](../../deploy/README.md).

## Dependencias y código

- Dependabot avisa de dependencias vulnerables (solo alertas, sin ramas ni pull requests); las
  actualizaciones se aplican en `dev` con las pruebas pasando. Django se mantiene en la serie
  LTS (5.2, con soporte hasta abril de 2028).
- `.github/workflows/seguridad.yml`: CodeQL (Python y JavaScript), ruff con las reglas de
  seguridad `S` (bandit) y `npm audit` de la web y la app.
