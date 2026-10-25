"""Lectura de parámetros de consulta comunes."""

from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError


def parametro_fecha(request, nombre):
    """Devuelve un datetime con zona horaria o ``None`` si el parámetro no viene."""
    valor = request.query_params.get(nombre)
    if not valor:
        return None
    fecha = parse_datetime(valor)
    if fecha is None:
        raise ValidationError(
            {nombre: "Use el formato ISO 8601, por ejemplo 2026-10-23T15:20:00-07:00."}
        )
    if fecha.tzinfo is None:
        from django.utils import timezone

        fecha = timezone.make_aware(fecha)
    return fecha


def parametro_entero(request, nombre):
    valor = request.query_params.get(nombre)
    if valor in (None, ""):
        return None
    try:
        return int(valor)
    except ValueError:
        raise ValidationError({nombre: "Debe ser un número entero."}) from None
