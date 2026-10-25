"""Parámetros del dispositivo. Las credenciales van en secrets.py, no aquí."""

# --- Pines (provisionales; confirmar contra el montaje real) ------------------------------
PIN_DHT22 = 4
PIN_I2C_SDA = 21  # bus compartido por la pantalla OLED y el CCS811
PIN_I2C_SCL = 22
PIN_RGB_ROJO = 25
PIN_RGB_VERDE = 26
PIN_RGB_AZUL = 27
PIN_LED_WIFI = 33
PIN_BUZZER = 32
PIN_BATERIA = 35  # ADC1 (el ADC2 no funciona con el Wi-Fi activo), detrás de un divisor 1:2

RGB_ACTIVO_ALTO = True  # False si el LED RGB es de ánodo común
BUZZER_ACTIVO_ALTO = True

# --- Pantalla y sensores ------------------------------------------------------------------
OLED_ANCHO = 128
OLED_ALTO = 64
OLED_DIRECCION = 0x3C
CCS811_DIRECCION = 0x5A

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
BATERIA_CONECTADA = False  # activar cuando el divisor de tensión esté montado
BATERIA_DIVISOR = 2.0
BATERIA_VACIA_V = 3.3
BATERIA_LLENA_V = 4.2

# --- Red y MQTT ---------------------------------------------------------------------------
WIFI_REINTENTO_SEG = 15
MQTT_PUERTO = 8883
MQTT_KEEPALIVE_SEG = 60
MQTT_REINTENTO_SEG = 10
CA_CERT = "certs/ca.der"  # CA del broker en formato DER; el certificado se valida siempre
TOPICO_LECTURAS = "nucleo/devices/{codigo}/measurements"
TOPICO_CONFIG = "nucleo/devices/{codigo}/config"

# Reinicia la placa si el programa deja de responder; 0 lo desactiva (útil al depurar con Pymakr).
WATCHDOG_MS = 0
