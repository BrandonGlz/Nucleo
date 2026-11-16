"""Registro en la bitácora de auditoría.

``PeticionActual`` (middleware) guarda la petición en curso en una variable de contexto; DRF
asigna el usuario autenticado a esa misma petición, así que las señales de los modelos saben
quién hizo el cambio sin pasarlo a mano.
"""

import contextvars
import logging

from django.db import transaction

from apps.auditoria.models import RegistroAuditoria
from common.red import ip_cliente

logger = logging.getLogger(__name__)

_peticion = contextvars.ContextVar("nucleo_peticion_actual", default=None)


class PeticionActual:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        marca = _peticion.set(request)
        try:
            return self.get_response(request)
        finally:
            _peticion.reset(marca)


def peticion_actual():
    return _peticion.get()


def actor_actual():
    """Persona que hace la petición en curso, o ``None`` (sistema, comando, integración)."""
    peticion = peticion_actual()
    usuario = getattr(peticion, "user", None)
    if usuario is None or not getattr(usuario, "is_authenticated", False):
        return None
    if getattr(usuario, "es_integracion", False):
        return None
    return usuario


def registrar(
    accion,
    *,
    usuario=None,
    correo="",
    organizacion_id=None,
    recurso="",
    recurso_num="",
    descripcion="",
    cambios=None,
    request=None,
):
    """Agrega un registro. Nunca interrumpe la operación que se audita."""
    request = request or peticion_actual()
    if usuario is None:
        usuario = actor_actual()
    if organizacion_id is None and usuario is not None:
        organizacion_id = usuario.organizacion_id
    try:
        # Punto de guardado propio: si falla, no deja inservible la transacción de la operación.
        with transaction.atomic():
            return _crear(
                accion=accion,
                usuario=usuario,
                correo=correo,
                organizacion_id=organizacion_id,
                recurso=recurso,
                recurso_num=recurso_num,
                descripcion=descripcion,
                cambios=cambios,
                request=request,
            )
    except Exception:
        logger.exception("No se pudo guardar el registro de auditoría (%s)", accion)
        return None


def _crear(
    *, accion, usuario, correo, organizacion_id, recurso, recurso_num, descripcion, cambios, request
):
    return RegistroAuditoria.objects.create(
        accion=accion,
        usuario=usuario,
        usuario_correo=(usuario.correo if usuario is not None else correo)[:150],
        organizacion_id=organizacion_id,
        recurso=recurso[:40],
        recurso_num=str(recurso_num or "")[:40],
        descripcion=descripcion[:255],
        cambios=cambios,
        ip=ip_cliente(request) if request is not None else None,
    )
