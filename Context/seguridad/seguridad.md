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

## Red

- PostgreSQL, TimescaleDB, Redis y Mosquitto solo escuchan en `127.0.0.1`.
- En producción todo entra por un Cloudflare Tunnel: no hay puertos abiertos en el router
  ([servidor](../servidor/produccion.md)). Django usa HTTPS obligatorio, cookies seguras,
  HSTS y `nosniff` (`config/settings/production.py`).
- El subdominio de los ESP32 (`dispositivos.bynucleo.com`) solo expone MQTT en WebSocket, el
  respaldo HTTPS de Nico y la hora; lo demás lo manda a la web.

## API y usuarios

- La API exige token salvo en el inicio de sesión, la salud y las rutas del ESP32 puente
  (`/api/v1/puente/`), que piden la clave `X-Puente-Clave` comparada en tiempo constante. El token caduca a los 7 días sin uso
  (`NUCLEO_TOKEN_DIAS_SIN_USO`) y el inicio de sesión admite como máximo 10 intentos por minuto.
- Las contraseñas de los usuarios se guardan cifradas con el hasher de Django y pasan sus
  validadores de contraseña.
- Autorización = rol + organización: cada vista declara qué roles leen, escriben o ejecutan
  acciones (`common/permissions.PermisoPorRol`) y cada consulta se limita a la organización, el
  área y el dispositivo del usuario (`common/scoping.py`). El canal en vivo aplica el mismo
  alcance. Detalle en [estructura del backend](../backend/estructura-backend.md) y en el
  [contrato de la API](../api/contrato-api.md).

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

## Respaldos

- `nucleo-respaldo.timer` respalda a diario las dos bases y la configuración del broker: 7 días
  en el servidor y 30 en Google Drive.
