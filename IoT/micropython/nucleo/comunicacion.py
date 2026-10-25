"""Cliente MQTT con TLS: publica lecturas y recibe la configuración retenida."""

import json
import ssl
import time

from umqtt.simple import MQTTClient

import config
import secrets


def _contexto_tls():
    contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    contexto.verify_mode = ssl.CERT_REQUIRED  # nunca se desactiva la validación
    with open(config.CA_CERT, "rb") as archivo:
        contexto.load_verify_locations(cadata=archivo.read())
    return contexto


class Broker:
    def __init__(self, al_recibir_configuracion):
        self._al_recibir = al_recibir_configuracion
        self._cliente = None
        self._ultimo_intento = None
        self._topico_lecturas = config.TOPICO_LECTURAS.format(codigo=secrets.CODIGO_MQTT)
        self._topico_config = config.TOPICO_CONFIG.format(codigo=secrets.CODIGO_MQTT)

    def conectado(self):
        return self._cliente is not None

    def mantener(self):
        """Reintenta la conexión cada MQTT_REINTENTO_SEG; sin conexión no hace nada más."""
        if self._cliente is not None:
            return
        ahora = time.ticks_ms()
        if (
            self._ultimo_intento is not None
            and time.ticks_diff(ahora, self._ultimo_intento) < config.MQTT_REINTENTO_SEG * 1000
        ):
            return
        self._ultimo_intento = ahora
        try:
            cliente = MQTTClient(
                secrets.CODIGO_MQTT,  # client_id y usuario = codigo_mqtt; la ACL liga el tópico al usuario
                secrets.MQTT_HOST,
                port=config.MQTT_PUERTO,
                user=secrets.CODIGO_MQTT,
                password=secrets.MQTT_PASSWORD,
                keepalive=config.MQTT_KEEPALIVE_SEG,
                ssl=_contexto_tls(),
            )
            cliente.set_callback(self._mensaje)
            cliente.connect()
            cliente.subscribe(self._topico_config)  # la configuración retenida llega al suscribir
            self._cliente = cliente
        except (OSError, ValueError):
            self._cliente = None

    def revisar(self):
        """Atiende los mensajes entrantes; una falla marca el broker como desconectado."""
        if self._cliente is None:
            return
        try:
            self._cliente.check_msg()
        except (OSError, ValueError):
            self._cerrar()

    def publicar_lecturas(self, carga):
        if self._cliente is None:
            return False
        try:
            self._cliente.publish(self._topico_lecturas, json.dumps(carga).encode())
            return True
        except OSError:
            self._cerrar()
            return False

    def _mensaje(self, topico, cuerpo):
        try:
            carga = json.loads(cuerpo)
        except ValueError:
            return
        if carga.get("dispositivo") == secrets.CODIGO_MQTT:
            self._al_recibir(carga)

    def _cerrar(self):
        try:
            self._cliente.disconnect()
        except Exception:
            pass
        self._cliente = None
