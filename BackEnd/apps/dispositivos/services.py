"""Reglas de negocio de los dispositivos."""

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import ExpressionWrapper, F, fields
from django.utils import timezone

from apps.dispositivos.models import Dispositivo
from apps.tiempo_real import eventos
from common import roles

logger = logging.getLogger(__name__)

ESTADOS_SIN_SEGUIMIENTO = (
    roles.DISPOSITIVO_MANTENIMIENTO,
    roles.DISPOSITIVO_BAJA,
    roles.DISPOSITIVO_SIN_CONEXION,
)


def marcar_sin_conexion(ahora=None):
    """Marca como "Sin conexión" los dispositivos que dejaron de enviar lecturas.

    Un dispositivo se considera sin conexión cuando pasan más de
    ``NUCLEO_SIN_CONEXION_FACTOR`` intervalos de muestreo sin recibir datos.
    Devuelve los dispositivos marcados.
    """
    ahora = ahora or timezone.now()
    factor = settings.NUCLEO_SIN_CONEXION_FACTOR
    vencidos = (
        Dispositivo.objects.exclude(estado_dispositivo_id__in=ESTADOS_SIN_SEGUIMIENTO)
        .filter(ultima_conexion__isnull=False)
        .annotate(
            limite=ExpressionWrapper(
                F("intervalo_muestreo_seg") * factor * timedelta(seconds=1),
                output_field=fields.DurationField(),
            )
        )
        .filter(ultima_conexion__lt=ahora - F("limite"))
    )
    marcados = list(vencidos)
    if marcados:
        Dispositivo.objects.filter(pk__in=[d.pk for d in marcados]).update(
            estado_dispositivo_id=roles.DISPOSITIVO_SIN_CONEXION
        )
        for dispositivo in marcados:
            dispositivo.estado_dispositivo_id = roles.DISPOSITIVO_SIN_CONEXION
            eventos.estado_dispositivo(dispositivo)
        logger.warning("Dispositivos sin conexión: %s", [d.codigo_mqtt for d in marcados])
    return marcados


def publicar_configuracion_al_confirmar(dispositivo):
    """Envía al dispositivo su intervalo y umbrales cuando la transacción se confirma."""
    if not settings.MQTT_PUBLICAR_CONFIG:
        return

    def _publicar():
        from apps.mediciones.mqtt import publicar_configuracion

        publicar_configuracion(dispositivo)

    transaction.on_commit(_publicar)
