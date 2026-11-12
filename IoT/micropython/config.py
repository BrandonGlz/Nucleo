"""Parámetros del dispositivo. Las credenciales van en secrets.py, no aquí."""

# --- Pines (ESP32-S3; confirmar contra el montaje real) -----------------------------------
# Libres en la S3 con PSRAM octal: se evitan los de arranque (0, 3, 45, 46), USB (19, 20),
# flash y PSRAM (26 a 37), la consola (43, 44) y el LED integrado de algunas placas (48).
PIN_DHT22 = 4
DHT22_PULL_UP_INTERNO = True  # por si la placa del DHT22 no trae su resistencia de 10 kΩ
PIN_I2C_SDA = 8  # bus compartido por la pantalla OLED, el CCS811 y el MAX17048
PIN_I2C_SCL = 9
PIN_RGB_ROJO = 5
PIN_RGB_VERDE = 6
PIN_RGB_AZUL = 7
PIN_LED_WIFI = 15
PIN_BUZZER = 16
PIN_BATERIA = 1  # solo con BATERIA = "ADC": ADC1 (el ADC2 no lee con el Wi-Fi activo)
# Reservados para piezas opcionales (el firmware aún no los usa): lector microSD por SPI y
# ventilador de 5 V por MOSFET. Ver «Conexiones del ESP32» en el README principal.
PIN_SD_CS = 10
PIN_SD_MOSI = 11
PIN_SD_SCK = 12
PIN_SD_MISO = 13
PIN_VENTILADOR = 14

RGB_ACTIVO_ALTO = True  # False si el LED RGB es de ánodo común
BUZZER_ACTIVO_ALTO = True

# --- Pantalla y sensores ------------------------------------------------------------------
OLED_ANCHO = 128
OLED_ALTO = 64
OLED_DIRECCION = 0x3C
CCS811_DIRECCION = 0x5A
MAX17048_DIRECCION = 0x36

SENSOR_TEMP_HUM = "DHT22"  # modelos tal como están registrados en la plataforma
SENSOR_AIRE = "CCS811"

# Rango físico de cada variable; el backend descarta las lecturas fuera de él.
RANGOS = {"TEMP": (-40, 80), "HUM": (0, 100), "AIRE": (0, 10000)}

# El CCS811 tarda 20 minutos en estabilizarse tras cada arranque (SRS 3.2.1).
CALENTAMIENTO_AIRE_SEG = 20 * 60

# --- Muestreo -----------------------------------------------------------------------------
# La plataforma puede cambiarlo (5 a 120 s) con el mensaje retenido de configuración.
INTERVALO_MUESTREO_SEG = 30
INTERVALO_MIN_SEG = 5
INTERVALO_MAX_SEG = 120
ARCHIVO_AJUSTES = "ajustes.json"  # última configuración recibida, para usarla sin conexión

# --- Calibración del CCS811 ---------------------------------------------------------------
# El baseline del sensor se guarda cada hora, ya estabilizado, y se restaura al arrancar.
ARCHIVO_BASELINE = "baseline.json"
BASELINE_CADA_SEG = 3600

# --- Lecturas sin conexión ----------------------------------------------------------------
# Mensajes con hora que se guardan en memoria mientras no hay broker y se envían al volver
# la conexión (20 mensajes son unos 10 minutos con el intervalo por defecto).
COLA_MAX_MENSAJES = 20
COLA_ENVIOS_POR_CICLO = 5

# --- Batería ------------------------------------------------------------------------------
# "MAX17048": medidor de carga por I2C (porcentaje real de la celda). "ADC": divisor de
# tensión 1:2 en PIN_BATERIA (porcentaje aproximado por voltaje). None: sin batería.
BATERIA = "MAX17048"
BATERIA_DIVISOR = 2.0  # solo para "ADC"
BATERIA_VACIA_V = 3.3
BATERIA_LLENA_V = 4.2

# --- Red y MQTT ---------------------------------------------------------------------------
WIFI_INTENTO_SEG = 20  # tiempo para asociarse a una red antes de probar la siguiente
MQTT_PUERTO = 8883  # por internet (Cloudflare): MQTT_PUERTO = 443 y MQTT_WS = "/mqtt" en secrets.py
MQTT_KEEPALIVE_SEG = 30  # sin señales en 1.5 veces esto, el broker publica el último mensaje
MQTT_REINTENTO_SEG = 10
MQTT_CONECTAR_SEG = 10  # tope para abrir la conexión y el TLS
MQTT_ESPERA_SEG = 5  # tope de cada lectura o escritura ya conectado (señal débil)
# CA del broker; el certificado se valida siempre. Por internet el certificado lo emite
# Cloudflare (Let's Encrypt o Google): MQTT_CA = "nucleo/raices.pem" en secrets.py.
CA_CERT = "certs/ca.der"
TOPICO_LECTURAS = "nucleo/devices/{codigo}/measurements"
TOPICO_CONFIG = "nucleo/devices/{codigo}/config"

# --- Puente de Nico AI ----------------------------------------------------------------------
# El ESP es la llave del agente: late por MQTT y firma cada petición (ver comunicacion.py).
TOPICO_LATIDO = "nucleo/devices/{codigo}/latido"
TOPICO_PETICION = "nucleo/devices/{codigo}/puente/peticion"
TOPICO_AUTORIZA = "nucleo/devices/{codigo}/puente/autoriza"
LATIDO_SEG = 20
# Si el broker falla MQTT_FALLOS_RESPALDO veces seguidas con Wi-Fi (p. ej. la red bloquea el
# puerto), Nico se mantiene por HTTPS cada RESPALDO_SEG y MQTT se reintenta cada 2 min.
MQTT_FALLOS_RESPALDO = 3
MQTT_REINTENTO_RESPALDO_SEG = 120
RESPALDO_SEG = 10
RESPALDO_ESPERA_SEG = 8
RAIZ_PUENTE = "nucleo/raices.pem"

# Reinicia la placa si el programa deja de responder; 0 lo desactiva (útil al depurar con Pymakr).
WATCHDOG_MS = 60000
