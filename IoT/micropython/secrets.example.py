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

# ── Puente de Nico AI (opcional) ─────────────────────────────────────────────────────
# MODO = "puente" hace que este ESP lleve las peticiones del agente de su dispositivo
# (CODIGO_MQTT) a la IA local del servidor. Sin el ESP conectado, ese agente no responde.
# MODO = "puente"
# PUENTE_HOST = "nucleo.<tailnet>.ts.net"
# PUENTE_CLAVE = "la IA_PUENTE_CLAVE de BackEnd/.env del servidor"
# Redes conocidas, en orden de preferencia (además de WIFI_SSID):
# REDES = [("oficina", "contraseña"), ("celular", "contraseña")]
