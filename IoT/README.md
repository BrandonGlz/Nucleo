# IoT — Núcleo

> **En simple:** aquí está todo lo necesario para programar el ESP32, el pequeño
> computador que medirá el ambiente. Lee sensores de temperatura, humedad y
> calidad del aire, muestra los datos en una pantalla y los envía por internet.

El lenguaje es **Python con MicroPython**. Se programa desde VS Code con la
extensión **Pymakr**. La placa ejecuta primero `boot.py` (inicio) y después
`main.py` (código principal).

## Qué hay

- **Firmware base:** `boot.py`, `main.py`, `config.py` y el paquete `nucleo/` leen el
  DHT22 y el CCS811, muestran los valores en la pantalla OLED, encienden el LED RGB y el
  buzzer según los umbrales, y publican por MQTT con TLS.
- **Biblioteca y herramientas:** MicroPython, las bibliotecas de cada componente y las
  herramientas para grabar la placa.
- **Broker:** Mosquitto con TLS en el puerto 8883, en Docker (ver
  [Broker MQTT](../Context/mqtt/broker-mosquitto.md)). El `client_id` y el usuario MQTT de
  la placa son su `codigo_mqtt`.
- **Pruebas de la lógica:** `tests/` ejecuta en la computadora 16 pruebas del firmware
  (umbrales, calentamiento, baseline, cola y mensaje) con módulos de MicroPython simulados.
- **Sin validar en hardware:** los pines, la batería y el TLS en la placa se confirman al
  montar el dispositivo.

## Hardware y bibliotecas

- **ESP32 normal (DevKit):** firmware MicroPython v1.29.0, en `micropython/firmware/`.
- **DHT22 (temperatura y humedad):** `dht`, ya viene dentro de MicroPython.
- **CCS811 (eCO2 y TVOC):** `ccs811`, en `micropython/lib/ccs811.py`.
- **Pantalla OLED 0.96" I2C:** `ssd1306`, en `micropython/lib/ssd1306.py`.
- **LED RGB, LED de Wi-Fi y buzzer activo:** `machine.Pin`, ya viene dentro de MicroPython.
- **Envío por internet (MQTT):** `umqtt.simple` y `umqtt.robust`, en `micropython/lib/umqtt/`.
- **MQ-135:** `mq135`, en `micropython/lib/mq135.py`; el firmware no lo usa.

## Carpetas

```text
IoT/
├── micropython/                 Proyecto que se abre con Pymakr
│   ├── boot.py                  Arranque mínimo
│   ├── main.py                  Inicia la aplicación y reinicia la placa ante un error
│   ├── config.py                Pines, intervalos, rangos, tópicos y opciones
│   ├── secrets.example.py       Plantilla de credenciales (copiar como secrets.py)
│   ├── secrets.py               Wi-Fi, código MQTT y broker; no se versiona
│   ├── certs/
│   │   └── ca.der               CA del broker en DER; no se versiona
│   ├── nucleo/                  Código del dispositivo
│   │   ├── aplicacion.py        Ciclo principal: leer, alertar, mostrar y publicar
│   │   ├── sensores.py          DHT22 y CCS811 con su calentamiento de 20 minutos
│   │   ├── umbrales.py          Configuración recibida y clasificación local
│   │   ├── cola.py              Lecturas tomadas sin conexión, para reenviarlas
│   │   ├── indicadores.py       LED RGB, LED de Wi-Fi y buzzer
│   │   ├── pantalla.py          Pantalla OLED
│   │   ├── bateria.py           Nivel de batería por ADC
│   │   ├── red.py               Wi-Fi y hora por NTP
│   │   └── comunicacion.py      Cliente MQTT con TLS
│   ├── firmware/
│   │   └── ESP32_GENERIC-20260824-v1.29.0.bin   Sistema que se graba en el ESP32
│   ├── lib/                     Bibliotecas que se copian a la placa
│   │   ├── ccs811.py
│   │   ├── mq135.py
│   │   ├── ssd1306.py
│   │   └── umqtt/
│   │       ├── simple.py
│   │       └── robust.py
│   └── pymakr.conf              Configuración de Pymakr; no sube firmware/
├── tests/                       Pruebas de la lógica del firmware (stubs.py, test_logica.py)
├── requirements.txt             Herramientas de la computadora
├── README.md                    Este documento
└── .venv/                       Herramientas instaladas, no se versiona
```

## Antes de empezar

Necesitas Python 3.12, VS Code y un cable USB **de datos**.

En VS Code instala la extensión **Pymakr** (`pycom.pymakr`):

- `code --install-extension pycom.pymakr` — "instala Pymakr en VS Code."

Si la placa no aparece, instala el driver USB de su chip (CP210x o CH340). En
Linux, agrega tu usuario al grupo `dialout` y vuelve a iniciar sesión:

- `sudo usermod -aG dialout $USER` — "da permiso para usar el puerto USB."

## Inicializar

Todos los comandos se ejecutan desde la carpeta `IoT/`.

- `python3.12 -m venv .venv` — "crea el entorno de herramientas."
- `.venv/bin/pip install --upgrade pip` — "actualiza el instalador."
- `.venv/bin/pip install -r requirements.txt` — "instala `esptool` (graba el firmware), `mpremote` (copia archivos) y el autocompletado de MicroPython."

## Preparar la placa (solo la primera vez)

Cambia `/dev/ttyUSB0` por el puerto real (en Linux suele ser `/dev/ttyUSB0` o
`/dev/ttyACM0`).

- `.venv/bin/esptool --port /dev/ttyUSB0 erase-flash` — "borra la memoria del ESP32."
- `.venv/bin/esptool --port /dev/ttyUSB0 --baud 460800 write-flash 0x1000 micropython/firmware/ESP32_GENERIC-20260824-v1.29.0.bin` — "graba MicroPython en la placa."

Si no conecta, mantén presionado el botón **BOOT** de la placa al iniciar el
comando. Pymakr **no** graba el firmware; eso se hace una sola vez con `esptool`.

## Trabajar con Pymakr

1. Abre la carpeta `IoT/micropython/` en VS Code (no la raíz del proyecto).
2. En el panel de Pymakr, la placa aparece en *Devices*; pulsa el rayo para conectarla.
3. Agrega el proyecto y usa **Sync project to device** para subir `lib/`,
   `boot.py` y `main.py`.
4. **Open terminal** abre la consola de Python de la placa.

Sin Pymakr, lo mismo se hace con `mpremote`:

- `.venv/bin/mpremote connect /dev/ttyUSB0 fs cp -r micropython/lib :` — "copia las bibliotecas a la placa."
- `.venv/bin/mpremote connect /dev/ttyUSB0 repl` — "abre la consola de Python de la placa; se sale con `Ctrl+]`."

## Pines provisionales

Se definen en `micropython/config.py`; si el montaje cambia, solo se edita ese archivo.

```text
ESP32
├── GPIO4    DHT22 datos              Con resistencia pull-up
├── GPIO21   I2C SDA (OLED + CCS811)  Bus compartido
├── GPIO22   I2C SCL (OLED + CCS811)  Bus compartido
├── GPIO25   LED RGB rojo             Con resistencia
├── GPIO26   LED RGB verde            Con resistencia
├── GPIO27   LED RGB azul             Con resistencia
├── GPIO33   LED de Wi-Fi             Con resistencia
├── GPIO32   Buzzer activo            Verificar corriente y nivel lógico
└── GPIO35   Batería                  ADC1, solo entrada; divisor de tensión 1:2
```

La batería está desactivada (`BATERIA_CONECTADA = False`) hasta montar el divisor; sin
ella el mensaje omite el nivel de batería. Se usa ADC1 porque el ADC2 no lee con el
Wi-Fi encendido. El CCS811 necesita su pin **nWAKE** conectado a GND. Si el LED RGB es de
ánodo común, `RGB_ACTIVO_ALTO = False`.

## Configurar y subir el código

Desde la carpeta `IoT/micropython/`:

1. Crear el usuario MQTT del dispositivo desde la carpeta principal (imprime su contraseña
   una sola vez):
   - `bash Mosquitto/dispositivo.sh NUC-001` — "crea el usuario del dispositivo en el broker."
2. Copiar la plantilla y completarla con la red Wi-Fi, el `codigo_mqtt` del dispositivo
   (el registrado en la plataforma), la dirección del broker y esa contraseña:
   - `cp secrets.example.py secrets.py` — "crea el archivo de credenciales."
3. Convertir la CA del broker a DER y dejarla en `certs/`:
   - `mkdir -p certs && openssl x509 -in ../../Mosquitto/certs/ca.crt -outform DER -out certs/ca.der` — "prepara el certificado que valida al broker."
4. Subir todo a la placa con **Sync project to device** en Pymakr, o con `mpremote`:
   - `../.venv/bin/mpremote connect /dev/ttyUSB0 fs cp -r lib certs nucleo config.py secrets.py boot.py main.py :` — "copia el proyecto a la placa."
5. Reiniciar la placa y ver la consola con `mpremote connect /dev/ttyUSB0 repl`.

`MQTT_HOST` debe ser un nombre o IP incluido en el certificado del servidor, y la placa
debe alcanzar el puerto 8883. El broker de desarrollo solo escucha en `127.0.0.1`; para
probar con la placa se define `MQTT_BIND=0.0.0.0` y `MQTT_SERVER_NAMES=<ip del servidor>`
en el `.env` raíz, se ejecuta `bash Mosquitto/preparar.sh` (reemite el certificado y
conserva la CA) y se reinicia el broker con `docker compose up -d mosquitto`.

## Cómo funciona

- **Ciclo:** cada `intervalo_seg` (30 s por defecto, de 5 a 120 s) lee los sensores,
  actualiza el LED RGB y la pantalla, y publica. El resto del tiempo atiende Wi-Fi, MQTT
  y el buzzer.
- **Niveles:** verde normal, amarillo advertencia, rojo peligro con buzzer. Un valor dentro
  de los límites de advertencia es normal; entre ellos y los de peligro es advertencia.
- **Sin conexión:** sigue leyendo y alertando en la placa con la última configuración, que
  se guarda en `ajustes.json`. Las lecturas con hora válida de ese periodo se guardan en una
  cola en memoria (hasta 20) y se envían al volver la conexión; sin hora no se encolan.
- **Calentamiento:** durante 20 minutos tras cada arranque la pantalla muestra
  "Calentando", el mensaje lleva `aire_estabilizado: false` y el aire no activa el LED
  ni el buzzer. La temperatura y la humedad miden y alertan desde el arranque.
- **Hora:** se sincroniza con NTP; sin ella el mensaje omite `fecha_hora` y el backend usa
  la de recepción. La hora también hace falta para validar el certificado del broker.
- **Un sensor que falla** no impide leer ni publicar los demás.

Mensaje que publica en `nucleo/devices/<codigo_mqtt>/measurements`:

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

La configuración llega retenida en `nucleo/devices/<codigo_mqtt>/config` con el intervalo
de muestreo y, por variable, los límites `peligro_min`, `advertencia_min`,
`advertencia_max` y `peligro_max`. El backend descarta las lecturas con un sensor no
registrado, una variable desconocida o un valor fuera del rango físico, y guarda el resto.

## Sintaxis de ejemplo

Fragmentos para probar cada componente desde la consola de la placa.

**DHT22** — temperatura y humedad (mínimo 2 segundos entre lecturas):

```python
import dht
from machine import Pin

sensor = dht.DHT22(Pin(4))
sensor.measure()
temperatura = sensor.temperature()   # °C
humedad = sensor.humidity()          # %
```

**Bus I2C** — compartido por la pantalla y el CCS811:

```python
from machine import Pin, SoftI2C

i2c = SoftI2C(sda=Pin(21), scl=Pin(22))
i2c.scan()   # [60, 90] -> 0x3C pantalla, 0x5A CCS811
```

**CCS811** — eCO2 (ppm) y TVOC (ppb):

```python
from ccs811 import CCS811

ccs = CCS811(i2c, addr=0x5A)
ccs.put_envdata(humedad, temperatura)   # compensa con datos del DHT22
if ccs.data_ready():
    eco2 = ccs.eCO2
    tvoc = ccs.tVOC
```

## Calibración del CCS811

Entrega CO2 estimado, no medido. La primera vez requiere 48 h encendido (acondicionamiento
previo a su puesta en servicio) y luego unos 20 minutos cada vez que arranca. Su
referencia (baseline) se guarda en `baseline.json` cada hora, ya estabilizado el sensor, y se
restaura al arrancar con `put_baseline()`.

## Para profundizar

La explicación técnica completa está en [`Context/`](../Context/README.md).

- [Firmware y hardware](../Context/iot/firmware-y-hardware.md)
- [Guía de desarrollo local](../Context/instalacion/guia-desarrollo-local.md)
