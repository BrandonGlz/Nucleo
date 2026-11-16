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
- Firewall del host (`deploy/firewall.nft`, tabla propia `inet nucleo_filtro`): por defecto
  descarta lo entrante y solo deja pasar loopback, conexiones ya establecidas, Tailscale, Docker,
  SSH desde la red local, ICMP y DHCP. `deploy/firewall.sh aplicar` lo carga con vuelta atrás
  automática a los 3 minutos si no se confirma desde otra sesión SSH.
- Cloudflare (panel, sin API): reglas WAF que bloquean rutas de escáneres (`/wp-`, `/.env`,
  `/.git`, `.php`), `/admin` solo desde México y un límite de 5 peticiones cada 10 s por IP en
  inicio de sesión, recuperación y restablecimiento de contraseña. Bot Fight Mode queda apagado
  porque bloquearía a los ESP32, la app y el vigía.
- Detrás del túnel la IP real llega en `CF-Connecting-IP`; con
  `NUCLEO_CONFIAR_CF_CONNECTING_IP=True` los límites por IP y la auditoría la usan
  (`common/red.py`). Sin eso, todas las visitas parecerían venir de `127.0.0.1`.

## API y usuarios

- La API exige token salvo en el inicio de sesión, la salud y las rutas del ESP32 puente
  (`/api/v1/puente/`), que piden la clave `X-Puente-Clave` comparada en tiempo constante. El token caduca a los 7 días sin uso
  (`NUCLEO_TOKEN_DIAS_SIN_USO`) y el inicio de sesión admite como máximo 10 intentos por minuto
  por IP.
- **Verificación en dos pasos (TOTP, RFC 6238)** en Mi perfil: QR para la app de autenticación,
  10 códigos de recuperación de un solo uso (se guarda solo su SHA-256) y el secreto cifrado. Un
  código ya usado no vale dos veces. `NUCLEO_2FA_OBLIGATORIO` (p. ej. `ADMINPLAT,ADMIN`) la vuelve
  obligatoria: mientras no la configuren, esas cuentas solo pueden abrir su perfil.
- **Recuperación de contraseña** por correo: enlace de un solo uso que caduca en una hora; la
  respuesta es la misma exista o no el correo y se limita a 5 pedidos por hora por IP. Al
  restablecerla se cierran todas las sesiones.
- Las contraseñas de los usuarios se guardan cifradas con el hasher de Django y pasan sus
  validadores de contraseña.
- Autorización = rol + organización: cada vista declara qué roles leen, escriben o ejecutan
  acciones (`common/permissions.PermisoPorRol`) y cada consulta se limita a la organización, el
  área y el dispositivo del usuario (`common/scoping.py`). El canal en vivo aplica el mismo
  alcance. Detalle en [estructura del backend](../backend/estructura-backend.md) y en el
  [contrato de la API](../api/contrato-api.md).
- **Integraciones**: tokens de API de solo lectura (`Authorization: ApiKey …`, se guarda solo su
  SHA-256, con caducidad opcional y revocables) y webhooks de alertas firmados con HMAC-SHA256,
  solo hacia direcciones HTTPS públicas (sin redirecciones; protección contra SSRF), que se
  pausan solos tras 10 fallas seguidas.

## Datos (DLP)

- Campos sensibles cifrados en la base con Fernet (`common/cifrado.py`): teléfono de los
  usuarios, secreto de la verificación en dos pasos y secreto de los webhooks.
- **Bitácora de auditoría** (`apps/auditoria`, tabla `registro_auditoria`): inicios de sesión
  (también fallidos), cierres, recuperación de contraseña, cambios en la verificación en dos
  pasos, altas, cambios y bajas hechos por personas (con antes y después; las contraseñas y los
  secretos salen como «(oculto)»), integraciones y exportaciones, con la IP. La ven ADMIN (su
  organización) y ADMINPLAT (todo) en **Auditoría**; se depura a los `NUCLEO_AUDITORIA_DIAS`
  (365).
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

## Firmware del ESP32 (OTA)

- La placa solo instala versiones con la firma HMAC-SHA256 de la clave del puente sobre el
  manifiesto, y comprueba el SHA-256 y el tamaño de cada archivo. Nunca se actualizan a distancia
  `secrets.py`, `boot.py` ni `actualizacion.py`.
- Si la versión nueva no llega a la plataforma tras 3 reinicios, vuelve sola a la anterior y no
  la repite. Detalle en [firmware](../iot/firmware-y-hardware.md#actualización-remota-ota).

## Respaldos y recuperación (DRP)

- `nucleo-respaldo.timer` respalda dos veces al día (03:45 y 15:45, RPO de 12 h) las dos bases y
  la configuración: 7 días en el servidor y 30 en Google Drive, cifrados con un remoto `crypt` de
  rclone (`gdrive-nucleo-cifrado:`).
- `nucleo-prueba-restauracion.timer` (primer domingo de cada mes) restaura el último respaldo en
  contenedores temporales, compara los conteos con producción, mide el tiempo (RTO) y manda el
  resultado por correo.
- Si un servicio falla, `nucleo-aviso@.service` manda por correo las últimas líneas de su
  bitácora (como mucho una vez por hora por servicio). El vigía de GitHub Actions
  (`.github/workflows/vigia.yml`) revisa cada 15 minutos la web, la API, la app y el subdominio
  de los ESP32 desde fuera.
- Guía del servidor de reserva en [deploy/README.md](../../deploy/README.md).

## Dependencias y código

- Dependabot (`.github/dependabot.yml`) propone actualizaciones de pip, npm y Actions sobre `dev`.
- `.github/workflows/seguridad.yml`: CodeQL (Python y JavaScript), ruff con las reglas de
  seguridad `S` (bandit) y `npm audit` de la web y la app.
