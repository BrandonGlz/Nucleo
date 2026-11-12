"""Plantilla de credenciales. Copiar como secrets.py y completar; secrets.py no se versiona."""

WIFI_SSID = "nombre-de-la-red"
WIFI_PASSWORD = "contraseña-wifi"

# Identificador del dispositivo: el codigo_mqtt registrado en la plataforma. También es el
# client_id y el usuario de MQTT (se crea con Mosquitto/dispositivo.sh), por lo que el
# broker solo le permite su propio tópico.
CODIGO_MQTT = "NUC-001"

# Debe coincidir con un nombre o IP incluido en el certificado del servidor.
MQTT_HOST = "192.168.1.10"
MQTT_PASSWORD = "contraseña-del-dispositivo"  # la imprime Mosquitto/dispositivo.sh
# Por internet, el broker se alcanza dentro de WebSocket por el túnel de Cloudflare:
# MQTT_HOST = "dispositivos.bynucleo.com"
# MQTT_PUERTO = 443
# MQTT_WS = "/mqtt"
# MQTT_CA = "nucleo/raices.pem"  # raíces de Let's Encrypt y Google, incluidas en el firmware

# ── Llave de Nico AI (opcional) ──────────────────────────────────────────────────────
# Con PUENTE_CLAVE el ESP firma cada petición del agente de su dispositivo (CODIGO_MQTT) y
# manda un latido cada 20 s; la IA corre en el servidor. Sin el ESP conectado, ese agente
# no usa la IA. MODO = "puente" arranca sin sensores ni pantalla (solo la llave).
# MODO = "puente"
# PUENTE_HOST = "dispositivos.bynucleo.com"  # respaldo HTTPS y hora si falla el broker
# PUENTE_CLAVE = "la IA_PUENTE_CLAVE de BackEnd/.env del servidor"
# Redes conocidas, en orden de preferencia (además de WIFI_SSID). Con señal débil, un
# hotspot cercano (celular o computadora, en 2.4 GHz) es lo más estable:
# REDES = [("hotspot", "contraseña"), ("oficina", "contraseña")]
