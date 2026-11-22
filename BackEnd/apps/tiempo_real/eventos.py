"""Eventos en vivo para la web y la app móvil (SRS 3.1.4).

Cada evento se publica en el grupo de la organización; el consumidor de cada conexión
decide si el evento entra en el alcance de su rol. Los avisos de la campana (``aviso.nuevo``)
son personales: van al grupo ``usuario.<num>`` de su destinatario, al que solo se unen las
conexiones de esa cuenta. Publicar nunca interrumpe a quien lo
llama: si Redis no responde, el error se registra y las alertas y lecturas siguen su curso.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)

ALERTA_NUEVA = "alerta.nueva"
ALERTA_ATENDIDA = "alerta.atendida"
ALERTA_DESCARTADA = "alerta.descartada"
DISPOSITIVO_ESTADO = "dispositivo.estado"
AVISO_NUEVO = "aviso.nuevo"


def grupo_de(organizacion_num):
    return f"org.{organizacion_num}"


def grupo_de_usuario(usuario_num):
    return f"usuario.{usuario_num}"


def _enviar(organizacion_num, tipo, area_num, operador_num, datos):
    capa = get_channel_layer()
    if capa is None:
        return
    try:
        async_to_sync(capa.group_send)(
            grupo_de(organizacion_num),
            {
                "type": "evento",
                "tipo": tipo,
                "area": area_num,
                "operador": operador_num,
                "datos": datos,
            },
        )
    except Exception:
        logger.exception("No se pudo publicar el evento %s", tipo)


def _datos_alerta(alerta):
    umbral = alerta.umbral
    dispositivo = umbral.dispositivo
    return {
        "num": alerta.pk,
        "estado": alerta.estado,
        "nivel": alerta.nivel,
        "tipo": alerta.tipo,
        "variable": umbral.variable_id,
        "dispositivo": dispositivo.pk,
        "dispositivo_nombre": dispositivo.nombre,
        "valor": str(alerta.lectura_valor),
        "fecha_hora": alerta.lectura_fecha_hora.isoformat(),
    }


def alerta(alerta, tipo):
    """Publica una alerta (nueva, atendida o descartada) al confirmarse la transacción."""
    dispositivo = alerta.umbral.dispositivo
    organizacion = dispositivo.area.organizacion_id
    area, operador, datos = dispositivo.area_id, dispositivo.operador_id, _datos_alerta(alerta)
    transaction.on_commit(lambda: _enviar(organizacion, tipo, area, operador, datos))


def estado_dispositivo(dispositivo):
    """Publica el estado actual de un dispositivo (en línea, calentando, sin conexión...)."""
    datos = {
        "dispositivo": dispositivo.pk,
        "nombre": dispositivo.nombre,
        "estado": dispositivo.estado_dispositivo_id,
        "nivel_bateria": dispositivo.nivel_bateria,
        "ultima_conexion": (
            dispositivo.ultima_conexion.isoformat() if dispositivo.ultima_conexion else None
        ),
    }
    organizacion = dispositivo.area.organizacion_id
    area, operador = dispositivo.area_id, dispositivo.operador_id
    transaction.on_commit(lambda: _enviar(organizacion, DISPOSITIVO_ESTADO, area, operador, datos))


def _enviar_aviso(usuario_num, datos):
    capa = get_channel_layer()
    if capa is None:
        return
    try:
        async_to_sync(capa.group_send)(
            grupo_de_usuario(usuario_num), {"type": "aviso_usuario", "datos": datos}
        )
    except Exception:
        logger.exception("No se pudo publicar el aviso %s", datos.get("num"))


def aviso(usuario_num, datos):
    """Publica un aviso de la campana solo a las conexiones de su destinatario."""
    transaction.on_commit(lambda: _enviar_aviso(usuario_num, datos))
