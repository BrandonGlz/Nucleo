"""Envío de avisos de alerta por correo y notificación push."""

import json
import logging
import urllib.request

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


def _texto_alerta(alerta):
    umbral = alerta.umbral
    dispositivo = umbral.dispositivo
    unidad = umbral.variable.unidad
    nivel = alerta.get_nivel_display()
    sentido = "por encima" if alerta.tipo == "POR_ENCIMA" else "por debajo"
    asunto = (
        f"[Núcleo] {nivel}: {umbral.variable.nombre} {sentido} del límite en {dispositivo.nombre}"
    )
    cuerpo = (
        f"Se detectó una lectura en nivel de {nivel.lower()}.\n\n"
        f"Dispositivo: {dispositivo.nombre} ({dispositivo.codigo_mqtt})\n"
        f"Área: {dispositivo.area.nombre}\n"
        f"Variable: {umbral.variable.nombre}\n"
        f"Valor: {alerta.lectura_valor} {unidad}\n"
        f"Límites de advertencia: {umbral.advertencia_min} a {umbral.advertencia_max} {unidad}\n"
        f"Límites de peligro: {umbral.peligro_min} a {umbral.peligro_max} {unidad}\n"
        f"Medida: {timezone.localtime(alerta.lectura_fecha_hora):%Y-%m-%d %H:%M:%S %Z}\n\n"
        f"Atienda la alerta desde la plataforma web."
    )
    return asunto, cuerpo


def enviar_correo(usuario, alerta):
    """Devuelve ``True`` si el correo salió; nunca lanza excepciones."""
    asunto, cuerpo = _texto_alerta(alerta)
    try:
        enviados = send_mail(asunto, cuerpo, settings.DEFAULT_FROM_EMAIL, [usuario.correo])
    except Exception:
        logger.exception(
            "No se pudo enviar el correo de la alerta %s a %s", alerta.pk, usuario.correo
        )
        return False
    return enviados > 0


def _texto_push(alerta):
    umbral = alerta.umbral
    dispositivo = umbral.dispositivo
    nivel = alerta.get_nivel_display()
    sentido = "por encima" if alerta.tipo == "POR_ENCIMA" else "por debajo"
    titulo = f"{nivel}: {umbral.variable.nombre} {sentido} del límite"
    cuerpo = (
        f"{dispositivo.nombre} ({dispositivo.area.nombre}): "
        f"{alerta.lectura_valor} {umbral.variable.unidad}"
    )
    return titulo, cuerpo


def _post_expo(carga):
    """Envía una petición a Expo y devuelve la respuesta JSON. Separado para poder simularlo."""
    peticion = urllib.request.Request(
        settings.NUCLEO_EXPO_PUSH_URL,
        data=json.dumps(carga).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
        method="POST",
    )
    with urllib.request.urlopen(peticion, timeout=10) as respuesta:  # noqa: S310
        return json.loads(respuesta.read())


def enviar_push(telefono, alerta):
    """Notificación push de Expo al teléfono registrado.

    Devuelve ``True`` si Expo aceptó el mensaje; nunca lanza excepciones. Si Expo informa
    que el token ya no es válido (``DeviceNotRegistered``) el teléfono se elimina. El
    canal solo se usa con ``NUCLEO_PUSH_HABILITADO``.
    """
    titulo, cuerpo = _texto_push(alerta)
    carga = {
        "to": telefono.token_expo,
        "title": titulo,
        "body": cuerpo,
        "sound": "default",
        "priority": "high",
        "channelId": "alertas",
        "data": {"alerta": alerta.pk, "nivel": alerta.nivel},
    }
    try:
        respuesta = _post_expo(carga)
    except Exception:
        logger.exception("No se pudo enviar el push de la alerta %s", alerta.pk)
        return False
    resultado = respuesta.get("data") or {}
    if isinstance(resultado, list):
        resultado = resultado[0] if resultado else {}
    if resultado.get("status") == "ok":
        return True
    if (resultado.get("details") or {}).get("error") == "DeviceNotRegistered":
        telefono.delete()
        logger.info("Teléfono %s eliminado: Expo ya no reconoce su token.", telefono.pk)
    else:
        logger.warning("Expo rechazó el push de la alerta %s: %s", alerta.pk, resultado)
    return False
