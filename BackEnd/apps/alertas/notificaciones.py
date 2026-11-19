"""Envío de avisos de alerta por correo y notificación push."""

import json
import logging
import urllib.request

from django.conf import settings
from django.utils import timezone

from common import correo

logger = logging.getLogger(__name__)


def _variable_corta(nombre):
    """«Calidad del aire (eCO2)» → «calidad del aire»."""
    corto = nombre.split("(")[0].strip()
    return corto[:1].lower() + corto[1:]


def _datos_alerta(alerta):
    """Asunto y contenido del correo de una alerta ambiental."""
    umbral = alerta.umbral
    dispositivo = umbral.dispositivo
    variable = umbral.variable
    unidad = variable.unidad
    nivel = alerta.get_nivel_display()
    peligro = alerta.nivel == alerta.Nivel.PELIGRO
    encima = alerta.tipo == "POR_ENCIMA"
    if encima:
        limite = umbral.peligro_max if peligro else umbral.advertencia_max
    else:
        limite = umbral.peligro_min if peligro else umbral.advertencia_min
    valor = correo.numero(alerta.lectura_valor)
    limite_txt = correo.numero(limite)
    sentido = "por encima" if encima else "por debajo"
    asunto = (
        f"{nivel} · {dispositivo.nombre}: {_variable_corta(variable.nombre)} "
        f"en {valor} {unidad} (límite {limite_txt})"
    )
    medida = timezone.localtime(alerta.lectura_fecha_hora)
    datos = dict(
        titulo=f"{variable.nombre} {sentido} del límite",
        intro=(
            f"Le escribe Nico. Detecté una lectura en nivel de {nivel.lower()} en el "
            f"dispositivo {dispositivo.nombre}, ubicado en {dispositivo.area.nombre}. "
            "Le recomiendo revisar el área a la brevedad."
        ),
        nivel="peligro" if peligro else "advertencia",
        etiqueta=nivel,
        icono="octagon-alert" if peligro else "triangle-alert",
        destacado=dict(
            etiqueta=variable.nombre,
            valor=valor,
            unidad=unidad,
            nota=f"Límite de {nivel.lower()}: {limite_txt} {unidad}",
        ),
        filas=[
            ("Dispositivo", f"{dispositivo.nombre} ({dispositivo.codigo_mqtt})"),
            ("Área", dispositivo.area.nombre),
            ("Medida", f"{medida:%d/%m/%Y, %H:%M:%S}"),
            (
                "Rango de advertencia",
                f"{correo.numero(umbral.advertencia_min)} a "
                f"{correo.numero(umbral.advertencia_max)} {unidad}",
            ),
            (
                "Rango de peligro",
                f"{correo.numero(umbral.peligro_min)} a "
                f"{correo.numero(umbral.peligro_max)} {unidad}",
            ),
        ],
        boton=("Atender alerta", correo.url_web("/alertas")),
        motivo="Recibe este aviso porque es responsable de esta área en Núcleo.",
        previa=(
            f"{variable.nombre}: {valor} {unidad} en {dispositivo.nombre}. "
            f"Límite {limite_txt} {unidad}."
        ),
    )
    return asunto, datos


def enviar_correo(usuario, alerta):
    """Devuelve ``True`` si el correo salió; nunca lanza excepciones."""
    try:
        asunto, datos = _datos_alerta(alerta)
        enviados = correo.enviar([usuario.correo], asunto, **datos)
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
    # URL fija de la configuración (https de Expo), no de un dato del usuario.
    peticion = urllib.request.Request(  # noqa: S310
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
    # Canales de Android que crea la app: «alertas» suena y vibra; «alertas-silencio», no.
    peligro = alerta.nivel == alerta.Nivel.PELIGRO
    carga = {
        "to": telefono.token_expo,
        "title": titulo,
        "body": cuerpo,
        "sound": "default" if peligro else None,
        "priority": "high",
        "channelId": "alertas" if peligro else "alertas-silencio",
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
