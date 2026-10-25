# Broker MQTT (Eclipse Mosquitto)

## Servicio

Mosquitto 2.x corre en Docker (`nucleo_mosquitto`, imagen `eclipse-mosquitto:2`)
y solo escucha MQTT sobre TLS en el puerto 8883 (`MQTT_BIND`, por defecto
`127.0.0.1`). No hay listener sin cifrar ni acceso anónimo.

```text
Mosquitto/
├── config/
│   ├── mosquitto.conf   Listener 8883 con TLS 1.2, usuarios y ACL
│   ├── acl              Permisos: el backend y un patrón por usuario de dispositivo
│   └── passwd           Usuarios (generado, no se versiona)
├── certs/               CA y certificado del servidor (generados, no se versionan)
├── preparar.sh          Genera certificados de desarrollo y los usuarios iniciales
└── dispositivo.sh       Crea el usuario MQTT de un dispositivo
```

## Puesta en marcha

1. Definir `MQTT_BACKEND_PASSWORD` y `MQTT_DEVICE_PASSWORD` en el `.env` raíz.
2. `bash Mosquitto/preparar.sh` crea la CA, el certificado del servidor (válido
   para `localhost`, `127.0.0.1` y los nombres de `MQTT_SERVER_NAMES`) y
   `Mosquitto/config/passwd` con los usuarios `nucleo_backend` y `NUC-001`. Al volver a
   ejecutarlo conserva la CA y reemite solo el certificado del servidor.
3. `docker compose up -d --wait mosquitto`.
4. En `BackEnd/.env`: `MQTT_USERNAME=nucleo_backend`, `MQTT_PASSWORD` con el valor
   de `MQTT_BACKEND_PASSWORD` y `MQTT_CA_CERT=../Mosquitto/certs/ca.crt`.
5. `cd BackEnd && .venv/bin/python manage.py escuchar_mqtt`.

Los clientes deben validar el certificado con `Mosquitto/certs/ca.crt`; la
validación no se desactiva.

## Alta de un dispositivo y acceso desde la red

- `bash Mosquitto/dispositivo.sh NUC-002` crea el usuario MQTT del dispositivo
  (su `codigo_mqtt`), imprime una contraseña aleatoria una sola vez y recarga el broker.
  Esa contraseña va en el `secrets.py` del dispositivo.
- Para que un ESP32 alcance el broker desde la red, en el `.env` raíz se define
  `MQTT_BIND=0.0.0.0` y `MQTT_SERVER_NAMES` con la IP o el nombre del equipo (por ejemplo
  `192.168.1.20,nucleo.local`); luego `bash Mosquitto/preparar.sh` reemite el certificado
  con esos nombres y `docker compose up -d mosquitto`. El firmware valida el certificado
  contra la CA, así que `MQTT_HOST` del dispositivo debe ser uno de esos nombres.

## Usuarios y permisos

```text
nucleo_backend   Lee nucleo/devices/+/measurements y escribe nucleo/devices/+/config
<codigo_mqtt>    Escribe nucleo/devices/<codigo_mqtt>/measurements y lee
                 nucleo/devices/<codigo_mqtt>/config
```

Cada dispositivo tiene su propio usuario, igual a su `codigo_mqtt`. La ACL usa el patrón
`%u` (el usuario autenticado) y no el client ID, que cada cliente elige: un dispositivo
solo puede publicar y leer en su propio tópico aunque cambie su client ID.

## Mensaje de lecturas

Tópico `nucleo/devices/<codigo_mqtt>/measurements`:

```json
{
  "dispositivo": "NUC-001",
  "fecha_hora": "2026-10-23T15:20:00-07:00",
  "bateria": 87,
  "aire_estabilizado": true,
  "lecturas": [
    {"sensor": "DHT22", "variable": "TEMP", "valor": 26.4},
    {"sensor": "DHT22", "variable": "HUM", "valor": 48.0},
    {"sensor": "CCS811", "variable": "AIRE", "valor": 412}
  ]
}
```

- `dispositivo` es el `codigo_mqtt` registrado; si no existe o está dado de baja,
  el mensaje se descarta.
- `sensor` es el `modelo` de un sensor registrado en ese dispositivo y
  `variable` un código del catálogo (`TEMP`, `HUM`, `AIRE`).
- `valor` debe ser numérico y estar dentro del rango físico de la variable
  (TEMP −40 a 80, HUM 0 a 100, AIRE 0 a 10000).
- `fecha_hora`, `bateria` y `aire_estabilizado` son opcionales; sin `fecha_hora` se
  usa la hora de recepción (el firmware envía la hora UTC con `Z`).
- `aire_estabilizado: false` indica que el CCS811 sigue en sus 20 minutos de
  calentamiento tras el arranque: sus lecturas se guardan con `estabilizada = false`,
  el dispositivo queda en estado `CALENT` y no se generan alertas por ellas. Sin el
  campo se asume `true`.
- Una lectura inválida se descarta y el resto del mensaje se guarda.

## Mensaje de configuración

Tópico `nucleo/devices/<codigo_mqtt>/config`, retenido, publicado por el backend
cuando cambian el intervalo de muestreo o los umbrales (con
`MQTT_PUBLICAR_CONFIG=True`):

```json
{
  "dispositivo": "NUC-001",
  "intervalo_muestreo_seg": 30,
  "umbrales": [
    {"variable": "TEMP", "peligro_min": 15.0, "advertencia_min": 18.0,
     "advertencia_max": 25.0, "peligro_max": 28.0}
  ]
}
```

El dispositivo lo recibe al conectarse aunque haya estado apagado y lo usa para
clasificar cada lectura (normal, advertencia o peligro) y alertar localmente, con el LED
RGB y el buzzer, cuando pierde la conexión.

## Flujo

```text
ESP32 ──MQTT TLS :8883──▶ Mosquitto ──▶ escuchar_mqtt (backend)
                                          ├─ valida y guarda las lecturas (TimescaleDB)
                                          ├─ actualiza el dispositivo
                                          ├─ clasifica con el umbral
                                          ├─ alerta + notificaciones (una transacción)
                                          └─ evento en vivo (Redis → WebSocket)
```
