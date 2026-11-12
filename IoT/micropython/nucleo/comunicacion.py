"""Cliente MQTT con TLS: lecturas, configuración retenida y el puente de Nico AI.

Una sola conexión segura lleva todo:

- **Lecturas** de los sensores (``.../measurements``) y **configuración** retenida (``.../config``).
- **Latido** cada ``LATIDO_SEG`` (``.../latido``) con el diagnóstico de red, y como último
  mensaje ``{"estado": "offline"}``: si el ESP se apaga, el broker lo publica y Nico se
  desactiva al instante.
- **Firma de peticiones** de Nico: el servidor publica ``{id, reto}`` en ``.../puente/peticion``
  y el ESP responde en ``.../puente/autoriza`` con HMAC-SHA256(``PUENTE_CLAVE``,
  ``codigo:id:reto``). Son unos bytes: los sensores no esperan.

Por internet va dentro de WebSocket (``MQTT_WS``, ``websocket.py``) para pasar por el túnel de
Cloudflare en el 443. Si aun así falla, ``respaldo.py`` mantiene vivo a Nico por HTTPS.
"""

import binascii
import hashlib
import json
import ssl
import time

from umqtt.simple import MQTTClient

import config
import secrets
from nucleo.websocket import Tubo


def hmac_sha256(clave, mensaje):
    """HMAC-SHA256 en hexadecimal (MicroPython no trae el módulo hmac)."""
    bloque = 64
    if len(clave) > bloque:
        clave = hashlib.sha256(clave).digest()
    clave = clave + b"\0" * (bloque - len(clave))
    interna = hashlib.sha256(bytes(b ^ 0x36 for b in clave) + mensaje).digest()
    return binascii.hexlify(hashlib.sha256(bytes(b ^ 0x5C for b in clave) + interna).digest()).decode()


def _contexto_tls():
    contexto = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    contexto.verify_mode = ssl.CERT_REQUIRED  # nunca se desactiva la validación
    with open(getattr(secrets, "MQTT_CA", config.CA_CERT), "rb") as archivo:
        contexto.load_verify_locations(cadata=archivo.read())
    return contexto


class _TLS:
    """Envuelve el contexto TLS para quedarse con el socket TCP de abajo: umqtt lo vuelve
    bloqueante sin límite en cada ``check_msg`` y, con señal débil, una escritura atorada
    congelaría el ciclo hasta que el watchdog reinicie la placa. Con el límite, la escritura
    falla en pocos segundos y solo se reconecta el broker."""

    def __init__(self, contexto, ruta_ws=None):
        self._contexto = contexto
        self._ruta_ws = ruta_ws
        self.crudo = None

    def wrap_socket(self, sock, **opciones):
        self.crudo = sock
        seguro = self._contexto.wrap_socket(sock, **opciones)
        if not self._ruta_ws:
            return seguro
        self.limitar()
        tubo = Tubo(seguro, al_bloquear=self.limitar)
        tubo.saludo(opciones.get("server_hostname", ""), self._ruta_ws)
        return tubo

    def limitar(self):
        if self.crudo is not None:
            self.crudo.settimeout(config.MQTT_ESPERA_SEG)


class Broker:
    def __init__(self, al_recibir_configuracion, red=None, al_firmar=None):
        self._al_recibir = al_recibir_configuracion
        self._al_firmar = al_firmar
        self._red = red
        self._cliente = None
        self._tls = None
        self._ultimo_intento = None
        self._ultimo_latido = None
        self.fallos_seguidos = 0
        self.firmadas = 0
        codigo = secrets.CODIGO_MQTT
        self._topico_lecturas = config.TOPICO_LECTURAS.format(codigo=codigo)
        self._topico_config = config.TOPICO_CONFIG.format(codigo=codigo)
        self._topico_latido = config.TOPICO_LATIDO.format(codigo=codigo)
        self._topico_peticion = config.TOPICO_PETICION.format(codigo=codigo)
        self._topico_autoriza = config.TOPICO_AUTORIZA.format(codigo=codigo)
        self._clave_puente = getattr(secrets, "PUENTE_CLAVE", "").encode()

    def conectado(self):
        return self._cliente is not None

    def mantener(self, reintento_seg=None):
        """Reintenta la conexión cada ``reintento_seg`` (MQTT_REINTENTO_SEG por omisión) y,
        conectado, manda el latido a tiempo."""
        ahora = time.ticks_ms()
        if self._cliente is not None:
            if self._ultimo_latido is None or time.ticks_diff(
                ahora, self._ultimo_latido
            ) >= config.LATIDO_SEG * 1000:
                self._latido(ahora)
            return
        espera = (reintento_seg or config.MQTT_REINTENTO_SEG) * 1000
        if self._ultimo_intento is not None and time.ticks_diff(ahora, self._ultimo_intento) < espera:
            return
        self._ultimo_intento = ahora
        try:
            self._tls = _TLS(_contexto_tls(), getattr(secrets, "MQTT_WS", ""))
            cliente = MQTTClient(
                secrets.CODIGO_MQTT,  # client_id y usuario = codigo_mqtt; la ACL liga el tópico al usuario
                secrets.MQTT_HOST,
                port=getattr(secrets, "MQTT_PUERTO", config.MQTT_PUERTO),
                user=secrets.CODIGO_MQTT,
                password=secrets.MQTT_PASSWORD,
                keepalive=config.MQTT_KEEPALIVE_SEG,
                ssl=self._tls,
            )
            cliente.set_last_will(self._topico_latido, b'{"estado":"offline"}')
            cliente.set_callback(self._mensaje)
            cliente.connect(timeout=config.MQTT_CONECTAR_SEG)
            self._tls.limitar()
            cliente.subscribe(self._topico_config)  # la configuración retenida llega al suscribir
            if self._clave_puente:
                cliente.subscribe(self._topico_peticion)
            self._cliente = cliente
            self.fallos_seguidos = 0
            self._latido(ahora)
        except Exception as e:  # noqa: BLE001 - MQTTException no es OSError
            self.fallos_seguidos += 1
            if self._red is not None:
                self._red.falla = "mqtt_%s" % e
            self._cliente = None

    def _latido(self, ahora):
        self._ultimo_latido = ahora
        diag = self._red.diagnostico(";modo=mqtt") if self._red is not None else ""
        if not self._publicar(self._topico_latido, {"diag": diag}):
            return

    def revisar(self):
        """Atiende los mensajes entrantes; una falla marca el broker como desconectado."""
        if self._cliente is None:
            return
        try:
            self._cliente.check_msg()
            self._tls.limitar()  # check_msg deja el socket bloqueante sin límite
        except (OSError, ValueError):
            self._cerrar()

    def publicar_lecturas(self, carga):
        return self._publicar(self._topico_lecturas, carga)

    def _publicar(self, topico, carga):
        if self._cliente is None:
            return False
        try:
            self._cliente.publish(topico, json.dumps(carga).encode())
            return True
        except OSError:
            self._cerrar()
            return False

    def _mensaje(self, topico, cuerpo):
        try:
            carga = json.loads(cuerpo)
        except ValueError:
            return
        if not isinstance(carga, dict):
            return
        if topico == self._topico_peticion.encode() or topico == self._topico_peticion:
            self._firmar(carga)
        elif carga.get("dispositivo") == secrets.CODIGO_MQTT:
            self._al_recibir(carga)

    def _firmar(self, carga):
        """Autoriza una petición de Nico: firma ``codigo:id:reto`` con la clave del puente."""
        id_, reto = str(carga.get("id", "")), str(carga.get("reto", ""))
        if not id_ or not reto or not self._clave_puente:
            return
        mensaje = ("%s:%s:%s" % (secrets.CODIGO_MQTT, id_, reto)).encode()
        if self._publicar(
            self._topico_autoriza, {"id": id_, "firma": hmac_sha256(self._clave_puente, mensaje)}
        ):
            self.firmadas += 1
            if self._al_firmar:
                self._al_firmar()

    def _cerrar(self):
        try:
            self._cliente.disconnect()
        except Exception:
            pass
        self._cliente = None
