"""Manejo de errores de la API con un formato uniforme."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def manejar_excepcion(exc, context):
    """Convierte errores del ORM en respuestas HTTP en lugar de un 500."""
    if isinstance(exc, ProtectedError):
        return Response(
            {"detail": "No se puede eliminar: tiene registros relacionados."},
            status=status.HTTP_409_CONFLICT,
        )
    if isinstance(exc, DjangoValidationError):
        detalle = exc.message_dict if hasattr(exc, "error_dict") else exc.messages
        return Response(detalle, status=status.HTTP_400_BAD_REQUEST)
    respuesta = exception_handler(exc, context)
    if (
        respuesta is not None
        and getattr(exc, "default_code", "") == "segundo_factor_pendiente"
        and isinstance(respuesta.data, dict)
    ):
        # La web y la app llevan a la configuración del segundo factor.
        respuesta.data["segundo_factor_pendiente"] = True
    return respuesta
