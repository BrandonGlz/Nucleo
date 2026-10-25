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
    return exception_handler(exc, context)
