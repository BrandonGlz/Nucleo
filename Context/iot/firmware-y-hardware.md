# Firmware y hardware IoT

## Lenguaje y plataforma

El nodo se programa en **Python con MicroPython** sobre un **ESP32-S3 con PSRAM octal**
(antes se planeó un ESP32-WROOM DevKit). Se eligió por prototipado rápido y familiaridad del equipo
con Python, aceptando menor rendimiento y menos bibliotecas que una solución en C.

- Firmware: MicroPython **v1.29.0**, build `ESP32_GENERIC_S3-SPIRAM_OCT`
  (`IoT/micropython/firmware/ESP32_GENERIC_S3-SPIRAM_OCT-20260824-v1.29.0.bin`,
  SHA-256 `ab24eadfe3ef0e6ee38834d730e648def7cd82f3fa51ee0bbc59c29a6e1bd176`).
  Fuente: <https://micropython.org/download/ESP32_GENERIC_S3/>. Para un ESP32 normal queda
  `ESP32_GENERIC-20260824-v1.29.0.bin`.
- Edición y carga: extensión de VS Code **Pymakr** (`pycom.pymakr`, v2.22.5) o
  `mpremote` 1.29.0.
- Autocompletado: `micropython-esp32-stubs==1.29.0.post1`.
- `IoT/micropython/pymakr.conf` define el proyecto `nucleo-esp32` y excluye
  `firmware/` del *sync* a la placa.
- Grabado del firmware: `esptool` 5.6.0 (Pymakr no graba firmware).
- Las herramientas están fijadas en `IoT/requirements.txt` y se instalan en
  `IoT/.venv`.

Estructura en la placa (`IoT/micropython/`):

- `boot.py`: arranque mínimo (apaga mensajes de depuración y libera memoria).
- `main.py`: inicia `nucleo.aplicacion.ejecutar()` y reinicia la placa si ocurre un
  error inesperado.
- `config.py`: pines, intervalos, rangos físicos, tópicos y opciones.
- `secrets.py` (no se versiona; plantilla en `secrets.example.py`): Wi-Fi, `CODIGO_MQTT`
  y datos del broker.
- `certs/ca.der` (no se versiona): CA del broker en formato DER.
- `nucleo/`: `aplicacion` (ciclo principal), `sensores`, `umbrales`, `cola`, `indicadores`,
  `pantalla`, `bateria`, `red` (Wi-Fi y hora), `comunicacion` (MQTT, latido y firma) y
  `respaldo` (HTTPS si la red bloquea el broker) y `websocket` (MQTT dentro de WebSocket para el
  túnel de Cloudflare); `raices.pem` (Let's Encrypt y Google) valida el servidor por internet.
- `baseline.json` y `ajustes.json` los crea el firmware en la placa (calibración del
  CCS811 y última configuración recibida).

Las pruebas de la lógica están en `IoT/tests/` (módulos de MicroPython simulados en
`stubs.py`) y se ejecutan en la computadora.
- `lib/`: bibliotecas importables.

## Hardware

- **ESP32-S3:** controlador y conectividad. Wi-Fi 2.4 GHz.
- **DHT22:** temperatura y humedad, en placa de 3 pines. Pull-up (el de la placa o el
  interno del ESP) y mínimo 2 s entre lecturas.
- **CCS811:** eCO2 (ppm) y TVOC (ppb). I2C 0x5A (0x5B si ADDR en alto); pin
  nWAKE a GND; 48 h de acondicionamiento previo y 20 min de estabilización tras cada
  arranque.
- **OLED SSD1306 0.96":** visualización local. I2C 128×64, dirección 0x3C.
- **LED RGB:** nivel de la lectura. Verde normal, amarillo advertencia, rojo peligro.
- **LED de Wi-Fi:** encendido con la conexión Wi-Fi.
- **Buzzer activo:** suena a pulsos en peligro. Verificar corriente y nivel lógico.
- **Batería LiPo 3.7 V 1000 mAh (con protección) + placa de carga:** TP4056 (carga USB),
  MT3608 (eleva a 5 V para el pin 5V del ESP) y MAX17048 (medidor de carga por I2C, 0x36).

## Llave de Nico AI

Un solo ciclo (sin hilos) con los sensores primero. Por la misma conexión MQTT el ESP publica
un latido cada 20 s con su diagnóstico de red (último mensaje `{"estado": "offline"}`) y firma
con HMAC-SHA256 cada petición de Nico (`puente/peticion` → `puente/autoriza`); el servidor
solo usa la IA con esa firma. Si la red bloquea el broker, un respaldo HTTPS cada 10 s mantiene
a Nico activo. `MODO = "puente"`: sin sensores, solo la llave.

## Pines (ESP32-S3)

```text
ESP32-S3
├── GPIO4    DHT22 datos              Pull-up interno activado
├── GPIO8    I2C SDA                  Bus compartido: OLED, CCS811 y MAX17048
├── GPIO9    I2C SCL                  Bus compartido: OLED, CCS811 y MAX17048
├── GPIO5    LED RGB rojo
├── GPIO6    LED RGB verde
├── GPIO7    LED RGB azul
├── GPIO15   LED de Wi-Fi
└── GPIO16   Buzzer activo
```

Están en `IoT/micropython/config.py` y coinciden con los de `IoT/README.md`. Se evitan los
pines de arranque (0, 3, 45, 46), USB (19, 20), flash y PSRAM octal (26 a 37), la consola
(43, 44) y el LED integrado (48). Falta confirmarlos con el montaje real.

## Bibliotecas

Todas están en `IoT/micropython/lib/` y se copian a `/lib` de la placa.

- **`dht`** (integrado en MicroPython) — DHT22: `dht.DHT22(Pin(4))`.
- **`machine.Pin`** (integrado en MicroPython) — LEDs y buzzer. Buzzer activo:
  `on()`/`off()`.
- **`ssd1306.py`** — OLED. Origen: `micropython/micropython-lib` (master).
  `SSD1306_I2C(128, 64, i2c)`.
- **`umqtt/simple.py`, `umqtt/robust.py`** — MQTT. Origen:
  `micropython/micropython-lib` (master). `robust` reconecta solo; soporta TLS
  con `ssl`.
- **`ccs811.py`** — CCS811. Origen: `Notthemarsian/CCS811` (dominio público).
  Clase `CCS811(i2c, addr=0x5A)`; `data_ready()`, `put_envdata(hum, temp)`,
  baseline. Cambios locales: se quitó el ejemplo comentado y se corrigió
  `__str__`.
- **`mq135.py`** — MQ-135. Origen: `rubfi/MQ135` (sin licencia declarada).
  Adaptado al ESP32 con `ADC.read_u16()`; el firmware no lo usa porque el dispositivo
  mide la calidad del aire con el CCS811.

Los valores de temperatura y humedad del DHT22 se envían al CCS811 con
`put_envdata()` para compensar su cálculo.

## Puesta en marcha

Desde `IoT/`:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/esptool --port /dev/ttyUSB0 erase-flash
.venv/bin/esptool --port /dev/ttyUSB0 --baud 460800 write-flash 0x1000 \
  micropython/firmware/ESP32_GENERIC-20260824-v1.29.0.bin
```

Desde `IoT/micropython/`:

```bash
cp secrets.example.py secrets.py        # completar Wi-Fi, CODIGO_MQTT y broker
mkdir -p certs
openssl x509 -in ../../Mosquitto/certs/ca.crt -outform DER -out certs/ca.der
../.venv/bin/mpremote connect /dev/ttyUSB0 fs cp -r lib certs nucleo config.py secrets.py boot.py main.py :
```

El offset `0x1000` es el correcto para el ESP32 clásico. La lógica (umbrales, calentamiento,
baseline, cola y forma del mensaje) tiene 16 pruebas en `IoT/tests/`; el firmware todavía no
se ha probado en hardware real.

```bash
IoT/.venv/bin/python -m unittest discover -s IoT/tests -t IoT
```

## Funcionamiento del firmware

- **Ciclo** (`nucleo/aplicacion.py`): cada intervalo de muestreo (30 s por defecto, de
  5 a 120 s) lee los sensores, clasifica los valores, actualiza LED, pantalla y
  buzzer, y publica. Entre muestras atiende Wi-Fi, MQTT y el buzzer cada 100 ms.
- **Un sensor que falla** no impide leer ni publicar los demás; las lecturas fuera del
  rango físico no se publican. Si el CCS811 no responde se reintenta en la siguiente
  lectura.
- **Calentamiento:** durante los primeros 20 minutos tras el arranque el mensaje lleva
  `aire_estabilizado: false`, la pantalla muestra "Calentando" y el aire no activa el LED
  ni el buzzer.
- **Alertas locales:** con la última configuración recibida (se guarda en `ajustes.json`
  de la placa) el LED RGB y el buzzer funcionan aunque no haya Wi-Fi ni broker. Sin
  configuración, todo se considera normal.
- **Reconexión:** Wi-Fi cada 15 s y MQTT cada 10 s, sin bloquear las lecturas.
- **Lecturas sin conexión:** los mensajes con hora válida se guardan en una cola en memoria
  (hasta 20, `COLA_MAX_MENSAJES`; al llenarse se descarta el más antiguo) y se envían del más
  antiguo al más nuevo, 5 por ciclo (`COLA_ENVIOS_POR_CICLO`), al volver el broker. Un
  mensaje sin hora no se encola: la plataforma lo fecharía al recibirlo y falsearía la serie.
  La cola se pierde si la placa se reinicia.
- **Baseline del CCS811:** una vez estabilizado el aire, el firmware guarda el baseline en
  `baseline.json` cada hora y lo restaura al arrancar, para que el sensor se estabilice antes.
- **Hora:** NTP al conectar el Wi-Fi; hace falta antes de conectar al broker para validar
  el certificado. Sin hora, el mensaje omite `fecha_hora`.
- **Batería:** `BATERIA = "MAX17048"` lee el porcentaje real por I2C; si el medidor no
  responde, el campo `bateria` se omite. `"ADC"` usa un divisor 1:2 y `None` lo desactiva.

## Conectividad y secretos

Wi-Fi + MQTT sobre TLS en el puerto **8883**, validando siempre el certificado del
broker (`ssl.CERT_REQUIRED` con la CA de `certs/ca.der`). Los secretos están en
`secrets.py`, que queda fuera de Git junto con el certificado. El `client_id` y el usuario
MQTT son el `CODIGO_MQTT`, y la ACL del broker liga el tópico al usuario autenticado, así
que el dispositivo solo puede usar su propio tópico. La contraseña la genera
`Mosquitto/dispositivo.sh <codigo_mqtt>`.

El broker de desarrollo escucha solo en `127.0.0.1` y su certificado cubre `localhost`,
`nucleo_mosquitto` y `127.0.0.1`. Para conectar la placa se define `MQTT_BIND=0.0.0.0` y
`MQTT_SERVER_NAMES=<ip o nombre>` en el `.env` raíz, se ejecuta `bash Mosquitto/preparar.sh`
y se reinicia el broker; `MQTT_HOST` del dispositivo debe ser ese nombre o IP.

## Mensaje MQTT

Tópico `nucleo/devices/<codigo_mqtt>/measurements`; el formato completo está en
`Context/mqtt/broker-mosquitto.md`.

```json
{
  "dispositivo": "NUC-001",
  "aire_estabilizado": true,
  "fecha_hora": "2026-10-24T15:30:00Z",
  "bateria": 87,
  "lecturas": [
    {"sensor": "DHT22", "variable": "TEMP", "valor": 23.4},
    {"sensor": "DHT22", "variable": "HUM", "valor": 48.0},
    {"sensor": "CCS811", "variable": "AIRE", "valor": 412}
  ]
}
```

No se generan lecturas simuladas.

## Calibración

**CCS811:** entrega eCO2 estimado, no CO2 medido. Tras el acondicionamiento inicial de
48 h el firmware guarda el baseline (`get_baseline()`) cada hora, ya estabilizado, y lo
restaura al arrancar (`put_baseline()`). Falta validarlo con el sensor real.

El broker Mosquitto corre en el Compose (`nucleo_mosquitto`); ver
`Context/mqtt/broker-mosquitto.md`.
