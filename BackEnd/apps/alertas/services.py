"""Creación de alertas a partir de lecturas fuera de umbral."""

import logging

from django.conf import settings
from django.db import IntegrityError, transaction

from apps.alertas import notificaciones
from apps.alertas.models import Alerta, Notificacion
from apps.tiempo_real import eventos
from apps.usuarios.models import Usuario
from common import roles

logger = logging.getLogger(__name__)


def destinatarios(dispositivo):
    """Envíos de una alerta como tuplas ``(usuario, canal, telefono_push)``.

    El correo va a los supervisores del área o, si no hay, a los administradores. Cuando el
    canal push está habilitado, cada teléfono registrado de esos responsables y del
    operador asignado recibe además una notificación push.
    """
    base = Usuario.objects.filter(
        organizacion_id=dispositivo.area.organizacion_id,
        estado_usuario_id=roles.USUARIO_ACTIVO,
    )
    responsables = list(base.filter(rol_id=roles.SUPERVISOR, area_id=dispositivo.area_id))
    if not responsables:
        responsables = list(base.filter(rol_id=roles.ADMIN))

    envios = [(usuario, Notificacion.Canal.CORREO, None) for usuario in responsables]
    if settings.NUCLEO_PUSH_HABILITADO:
        con_push = {usuario.pk: usuario for usuario in responsables}
        operador = dispositivo.operador
        if operador is not None and operador.is_active:
            con_push.setdefault(operador.pk, operador)
        for usuario in con_push.values():
            envios.extend(
                (usuario, Notificacion.Canal.PUSH, telefono)
                for telefono in usuario.telefonos_push.all()
            )
    return envios


def generar_alerta(umbral, lectura):
    """Crea la alerta y sus notificaciones en una sola transacción de ``nucleo_db``.

    ``lectura`` es la lectura de ``nucleo_iot`` que disparó la alerta. Mientras exista una
    alerta pendiente del mismo umbral y nivel no se crea otra, para no repetir el aviso en
    cada muestreo; si una advertencia escala a peligro se genera una nueva. Devuelve la
    alerta o ``None``.
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
            )
            alerta = Alerta.objects.select_related(
                "umbral__variable", "umbral__dispositivo__area"
            ).get(pk=alerta.pk)
            for usuario, canal, telefono in destinatarios(umbral.dispositivo):
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
    logger.info("Alerta %s (%s) creada para la lectura %s", alerta.pk, nivel, lectura.num)
    return alerta
