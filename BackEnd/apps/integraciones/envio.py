"""Entrega de webhooks: POST JSON firmado con HMAC-SHA256.

Encabezados que recibe el sistema externo:

- ``X-Nucleo-Evento``: ``alerta.nueva``, ``alerta.atendida``, ``alerta.descartada`` o ``prueba``.
- ``X-Nucleo-Entrega``: identificador único de la entrega.
- ``X-Nucleo-Fecha``: segundos Unix del envío.
- ``X-Nucleo-Firma``: ``sha256=<hex>`` de HMAC(secreto, ``"<fecha>.<cuerpo>"``).

El envío corre en un hilo aparte (no frena la recepción de lecturas ni la respuesta de la API)
con 3 intentos. Antes de cada intento se resuelve el host y se rechazan las IP privadas, de
loopback o locales, para que un webhook no pueda alcanzar servicios internos del servidor. Tras
``FALLOS_PARA_PAUSAR`` fallos seguidos el webhook se desactiva.
"""

import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlsplit

from django.db import close_old_connections, transaction
from django.utils import timezone

from apps.integraciones.models import Webhook

logger = logging.getLogger(__name__)

ESPERAS = (0, 5, 30)
TIEMPO_LIMITE = 8
FALLOS_PARA_PAUSAR = 10


class DestinoNoPermitido(Exception):
    pass


def validar_destino(url):
    """Lanza ``DestinoNoPermitido`` si la URL no es HTTPS o apunta a una red interna."""
    partes = urlsplit(url)
    if partes.scheme != "https" or not partes.hostname:
        raise DestinoNoPermitido("La URL debe empezar con https://")
    try:
        direcciones = {
            info[4][0] for info in socket.getaddrinfo(partes.hostname, partes.port or 443)
        }
    except socket.gaierror as error:
        raise DestinoNoPermitido(f"No se pudo resolver {partes.hostname}") from error
    for direccion in direcciones:
        ip = ipaddress.ip_address(direccion.split("%")[0])
        if not ip.is_global:
            raise DestinoNoPermitido(f"{partes.hostname} apunta a una red interna")


def firmar(secreto, fecha, cuerpo):
    mensaje = f"{fecha}.".encode() + cuerpo
    return "sha256=" + hmac.new(secreto.encode(), mensaje, hashlib.sha256).hexdigest()


class _SinRedirecciones(urllib.request.HTTPRedirectHandler):
    """Una redirección podría llevar a una red interna: no se siguen."""

    def redirect_request(self, *args, **kwargs):
        return None


_abridor = urllib.request.build_opener(_SinRedirecciones)


def _post(url, cuerpo, encabezados):
    """Hace el POST y devuelve el código HTTP. Separado para simularlo en las pruebas."""
    # validar_destino ya exigió https:// y una IP pública.
    peticion = urllib.request.Request(  # noqa: S310
        url, data=cuerpo, headers=encabezados, method="POST"
    )
    try:
        with _abridor.open(peticion, timeout=TIEMPO_LIMITE) as respuesta:
            return respuesta.status
    except urllib.error.HTTPError as error:
        return error.code


def entregar(webhook, evento, datos, esperas=ESPERAS):
    """Entrega un evento (con reintentos) y guarda el resultado. Devuelve ``True`` si salió."""
    cuerpo = json.dumps(
        {"evento": evento, "fecha_hora": timezone.now().isoformat(), "datos": datos},
        ensure_ascii=False,
        default=str,
    ).encode()
    entrega = str(uuid.uuid4())
    estado = ""
    exito = False
    for espera in esperas:
        if espera:
            time.sleep(espera)
        fecha = str(int(time.time()))
        encabezados = {
            "Content-Type": "application/json",
            "User-Agent": "Nucleo-Webhooks/1.0",
            "X-Nucleo-Evento": evento,
            "X-Nucleo-Entrega": entrega,
            "X-Nucleo-Fecha": fecha,
            "X-Nucleo-Firma": firmar(webhook.secreto, fecha, cuerpo),
        }
        try:
            validar_destino(webhook.url)
            codigo = _post(webhook.url, cuerpo, encabezados)
        except DestinoNoPermitido as error:
            estado = f"Rechazado: {error}"
            break
        except Exception as error:
            estado = f"Error: {error.__class__.__name__}"
            continue
        estado = f"HTTP {codigo}"
        if 200 <= codigo < 300:
            exito = True
            break
    _guardar_resultado(webhook, exito, estado)
    return exito


def _guardar_resultado(webhook, exito, estado):
    fallos = 0 if exito else webhook.fallos_consecutivos + 1
    cambios = {
        "ultimo_envio": timezone.now(),
        "ultimo_estado": estado[:120],
        "fallos_consecutivos": fallos,
    }
    if fallos >= FALLOS_PARA_PAUSAR:
        cambios["activo"] = False
        logger.warning("Webhook %s desactivado tras %s fallos seguidos", webhook.pk, fallos)
    Webhook.objects.filter(pk=webhook.pk).update(**cambios)


def _datos_alerta(alerta):
    umbral = alerta.umbral
    dispositivo = umbral.dispositivo
    return {
        "alerta": alerta.pk,
        "estado": alerta.estado,
        "nivel": alerta.nivel,
        "tipo": alerta.tipo,
        "variable": umbral.variable_id,
        "valor": alerta.lectura_valor,
        "unidad": umbral.variable.unidad,
        "medida_en": alerta.lectura_fecha_hora,
        "dispositivo": {
            "num": dispositivo.pk,
            "nombre": dispositivo.nombre,
            "codigo": dispositivo.codigo_mqtt,
            "area": dispositivo.area.nombre,
        },
    }


def _en_hilo(webhooks, evento, datos):
    def trabajar():
        try:
            for webhook in webhooks:
                entregar(webhook, evento, datos)
        finally:
            close_old_connections()

    threading.Thread(target=trabajar, name="nucleo-webhooks", daemon=True).start()


def notificar_alerta(alerta, evento):
    """Avisa a los webhooks activos de la organización de la alerta (al confirmar la
    transacción). Nunca lanza excepciones."""
    try:
        organizacion = alerta.umbral.dispositivo.area.organizacion_id
        webhooks = [
            w
            for w in Webhook.objects.filter(organizacion_id=organizacion, activo=True)
            if evento in w.eventos
        ]
        if not webhooks:
            return
        datos = _datos_alerta(alerta)
        transaction.on_commit(lambda: _en_hilo(webhooks, evento, datos))
    except Exception:
        logger.exception("No se pudieron preparar los webhooks de la alerta %s", alerta.pk)
