"""Creación de alertas a partir de lecturas fuera de umbral."""

import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.alertas import notificaciones
from apps.alertas.models import Alerta, Notificacion
from apps.integraciones import envio as webhooks
from apps.tiempo_real import eventos
from apps.usuarios.models import Usuario
from common import roles

logger = logging.getLogger(__name__)


def destinatarios(dispositivo):
    """Envíos de una alerta como tuplas ``(usuario, canal, telefono_push)``.

    Reciben la alerta los responsables del dispositivo dentro de su organización: los
    supervisores de su área, los administradores de la organización y el operador asignado
    (solo usuarios activos). Cada uno recibe un correo y, cuando el canal push está
    habilitado, una notificación en cada teléfono que tenga registrado.
    """
    organizacion_id = dispositivo.area.organizacion_id
    base = Usuario.objects.filter(
        organizacion_id=organizacion_id,
        estado_usuario_id=roles.USUARIO_ACTIVO,
    )
    responsables = {}
    for usuario in base.filter(rol_id=roles.SUPERVISOR, area_id=dispositivo.area_id).order_by("pk"):
        responsables.setdefault(usuario.pk, usuario)
    for usuario in base.filter(rol_id=roles.ADMIN).order_by("pk"):
        responsables.setdefault(usuario.pk, usuario)
    operador = dispositivo.operador
    if (
        operador is not None
        and operador.is_active
        and operador.organizacion_id == organizacion_id
        and operador.estado_usuario_id == roles.USUARIO_ACTIVO
    ):
        responsables.setdefault(operador.pk, operador)

    envios = [(usuario, Notificacion.Canal.CORREO, None) for usuario in responsables.values()]
    if settings.NUCLEO_PUSH_HABILITADO:
        for usuario in responsables.values():
            envios.extend(
                (usuario, Notificacion.Canal.PUSH, telefono)
                for telefono in usuario.telefonos_push.all()
            )
    return envios


def generar_alerta(umbral, lectura, avisar=True):
    """Crea la alerta y sus notificaciones en una sola transacción de ``nucleo_db``.

    ``lectura`` es la lectura de ``nucleo_iot`` que disparó la alerta. Mientras exista una
    alerta pendiente del mismo umbral y nivel no se crea otra, para no repetir el aviso en
    cada muestreo; si una advertencia escala a peligro se genera una nueva. Con
    ``avisar=False`` (lectura rezagada que llegó al reconectar) se registra sin correo ni push
    y con una observación de cuándo fue. Devuelve la alerta o ``None``.
    """
    clasificacion = umbral.clasificar(lectura.valor)
    if clasificacion is None:
        return None
    nivel, tipo = clasificacion
    pendientes = Alerta.objects.filter(umbral=umbral, nivel=nivel, estado=Alerta.Estado.PENDIENTE)
    if pendientes.exists():
        return None

    try:
        with transaction.atomic():
            alerta = Alerta.objects.create(
                umbral=umbral,
                lectura_num=lectura.num,
                lectura_fecha_hora=lectura.fecha_hora,
                lectura_valor=lectura.valor,
                nivel=nivel,
                tipo=tipo,
                observaciones=None
                if avisar
                else (
                    "Registrada al reconectarse el dispositivo; la lectura es del "
                    f"{timezone.localtime(lectura.fecha_hora):%d/%m/%Y %H:%M}. "
                    "Sin aviso por correo ni push."
                ),
            )
            alerta = Alerta.objects.select_related(
                "umbral__variable", "umbral__dispositivo__area"
            ).get(pk=alerta.pk)
            for usuario, canal, telefono in destinatarios(umbral.dispositivo) if avisar else ():
                if canal == Notificacion.Canal.CORREO:
                    salio = notificaciones.enviar_correo(usuario, alerta)
                else:
                    salio = notificaciones.enviar_push(telefono, alerta)
                Notificacion.objects.create(
                    alerta=alerta,
                    usuario=usuario,
                    telefono_push=telefono,
                    canal=canal,
                    estado_envio=(
                        Notificacion.EstadoEnvio.ENVIADA
                        if salio
                        else Notificacion.EstadoEnvio.FALLIDA
                    ),
                )
    except IntegrityError:
        # Otro proceso creó la misma alerta pendiente un instante antes.
        logger.info("Alerta pendiente ya registrada para el umbral %s (%s)", umbral.pk, nivel)
        return None
    eventos.alerta(alerta, eventos.ALERTA_NUEVA)
    webhooks.notificar_alerta(alerta, webhooks.Webhook.Evento.ALERTA_NUEVA)
    logger.info("Alerta %s (%s) creada para la lectura %s", alerta.pk, nivel, lectura.num)
    return alerta
