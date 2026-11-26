"""Cliente MQTT del backend.

Hay una única conexión del backend con el broker (patrón Singleton), la del comando
``escuchar_mqtt``. La API no abre la suya (tendría el mismo client id y el broker las
desconectaría entre sí): deja lo que hay que publicar (configuración de los dispositivos,
peticiones de firma del puente) en la cola compartida de Redis y ``escuchar_mqtt`` lo envía.
Además, cada vez que ``escuchar_mqtt`` se conecta reenvía la configuración retenida de todos
los dispositivos, así que un cambio hecho mientras estaba caído también llega.
"""

import json
import logging
import ssl
import threading
import time

import paho.mqtt.client as mqtt
from django.conf import settings
from django.db import close_old_connections

from apps.mediciones.services import MensajeInvalido, procesar_crudo

logger = logging.getLogger(__name__)


class ClienteMQTT:
    _instancia = None
    _candado = threading.Lock()

    def __init__(self):
        self.cliente = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=settings.MQTT_CLIENT_ID,
        )
        if settings.MQTT_USERNAME:
            self.cliente.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
        if settings.MQTT_USE_TLS:
            # Siempre se valida el certificado del broker.
            self.cliente.tls_set(
                ca_certs=settings.MQTT_CA_CERT or None,
                cert_reqs=ssl.CERT_REQUIRED,
                tls_version=ssl.PROTOCOL_TLS_CLIENT,
            )
        self.cliente.reconnect_delay_set(min_delay=1, max_delay=30)
        self.cliente.on_connect = self._al_conectar
        self.cliente.on_message = self._al_recibir

    @classmethod
    def obtener(cls):
        with cls._candado:
            if cls._instancia is None:
                cls._instancia = cls()
            return cls._instancia

    def _al_conectar(self, cliente, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            logger.error("No se pudo conectar al broker MQTT: %s", reason_code)
            return
        logger.info("Conectado al broker MQTT %s:%s", settings.MQTT_HOST, settings.MQTT_PORT)
        cliente.subscribe(settings.MQTT_TOPIC_LECTURAS, qos=1)
        cliente.subscribe(settings.MQTT_TOPIC_LATIDO, qos=0)
        cliente.subscribe(settings.MQTT_TOPIC_PUENTE_AUTORIZA, qos=0)
        if settings.MQTT_PUBLICAR_CONFIG:
            close_old_connections()
            try:
                total = publicar_todas_las_configuraciones(cliente)
            except Exception:
                logger.exception("No se pudo reenviar la configuración de los dispositivos")
            else:
                logger.info("Configuración retenida reenviada a %d dispositivos", total)

    def _al_recibir(self, cliente, userdata, mensaje):
        close_old_connections()
        partes = mensaje.topic.split("/")
        codigo = partes[2] if len(partes) > 2 else ""
        if mensaje.topic.endswith("/latido") or mensaje.topic.endswith("/puente/autoriza"):
            self._del_puente(mensaje.topic, codigo, mensaje.payload)
            return
        try:
            resultado = procesar_crudo(mensaje.payload)
        except MensajeInvalido as error:
            logger.warning("Mensaje descartado en %s: %s", mensaje.topic, error)
        except Exception:
            logger.exception("Error al procesar el mensaje de %s", mensaje.topic)
        else:
            from apps.reportes import puente

            puente.recibir_latido(resultado.dispositivo.codigo_mqtt, None)  # las lecturas también
            logger.info(
                "%s: %d lecturas, %d alertas, %d descartadas",
                resultado.dispositivo.codigo_mqtt,
                len(resultado.lecturas),
                len(resultado.alertas),
                len(resultado.descartadas),
            )

    def _del_puente(self, topico, codigo, carga):
        """Latido y firmas del ESP puente de Nico AI. El tópico (ligado por la ACL al usuario
        del dispositivo) dice quién lo manda; un mensaje malformado se ignora."""
        from apps.reportes import puente

        try:
            datos = json.loads(carga) if carga else {}
        except ValueError:
            return
        if not isinstance(datos, dict):
            return
        if topico.endswith("/latido"):
            puente.recibir_latido(codigo, datos)
        elif not puente.recibir_autorizacion(codigo, datos):
            logger.warning("Firma de puente inválida o vencida de %s", codigo)

    def _reenviar_peticiones(self):
        """Publica las peticiones de firma que la API deja en la cola compartida (Redis): así
        hay un solo cliente MQTT del backend y la API no abre su propia conexión."""
        from apps.reportes import puente

        while True:
            try:
                salida = puente.cola().siguiente_salida(5)
            except Exception:
                logger.exception("No se pudo leer la cola del puente")
                time.sleep(5)
                continue
            if salida:
                topico, carga, *resto = salida
                retener = bool(resto and resto[0])
                # La configuración va retenida y con QoS 1; las peticiones de firma, sin retener.
                self.cliente.publish(
                    topico, json.dumps(carga), qos=1 if retener else 0, retain=retener
                )

    def escuchar(self):
        """Conecta y atiende mensajes en el hilo actual hasta que se interrumpa."""
        threading.Thread(target=self._reenviar_peticiones, daemon=True).start()
        self.cliente.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60)
        self.cliente.loop_forever(retry_first_connection=True)

    def conectar_en_segundo_plano(self):
        if not self.cliente.is_connected():
            self.cliente.connect(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60)
            self.cliente.loop_start()

    def publicar(self, topico, carga, retener=False):
        self.conectar_en_segundo_plano()
        return self.cliente.publish(topico, json.dumps(carga), qos=1, retain=retener)


def carga_configuracion(dispositivo):
    """Nombre, intervalo y umbrales vigentes del dispositivo, como los espera el ESP32."""
    return {
        "dispositivo": dispositivo.codigo_mqtt,
        "nombre": dispositivo.nombre,  # encabezado de la pantalla OLED
        "intervalo_muestreo_seg": dispositivo.intervalo_muestreo_seg,
        "umbrales": [
            {
                "variable": u.variable_id,
                "peligro_min": float(u.peligro_min),
                "advertencia_min": float(u.advertencia_min),
                "advertencia_max": float(u.advertencia_max),
                "peligro_max": float(u.peligro_max),
            }
            for u in dispositivo.umbrales.all()
            if u.activo
        ],
    }


def _topico_config(dispositivo):
    return settings.MQTT_TOPIC_CONFIG.format(codigo_mqtt=dispositivo.codigo_mqtt)


def publicar_configuracion(dispositivo):
    """Deja en la cola la configuración del dispositivo para que ``escuchar_mqtt`` la publique.

    El mensaje es retenido: el dispositivo lo recibe al conectarse y lo usa también sin
    conexión. Un fallo de la cola se registra pero no interrumpe la API.
    """
    from apps.reportes import puente

    try:
        puente.cola().publicar(
            _topico_config(dispositivo), carga_configuracion(dispositivo), retener=True
        )
    except Exception:
        logger.exception("No se pudo publicar la configuración de %s", dispositivo.codigo_mqtt)


def publicar_todas_las_configuraciones(cliente):
    """Publica directo (desde ``escuchar_mqtt``) la configuración retenida de cada dispositivo
    que no está dado de baja. Devuelve cuántos se publicaron."""
    from apps.dispositivos.models import Dispositivo
    from common import roles

    dispositivos = Dispositivo.objects.exclude(
        estado_dispositivo_id=roles.DISPOSITIVO_BAJA
    ).prefetch_related("umbrales")
    total = 0
    for dispositivo in dispositivos:
        carga = carga_configuracion(dispositivo)
        cliente.publish(_topico_config(dispositivo), json.dumps(carga), qos=1, retain=True)
        total += 1
    return total
