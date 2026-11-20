"""Validaciones compartidas de correos y contraseñas, con mensajes claros para la persona."""

import re

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError

# Antes de la @: letras sin acento, números y . _ - + (sin empezar, terminar ni repetir el punto).
# Después: un dominio normal (letras, números, guiones y puntos) con su terminación (.com, .mx…).
_CORREO = re.compile(
    r"^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*"
    r"@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*"
    r"\.[A-Za-z]{2,}$"
)
MENSAJE_CORREO = (
    "El correo no es válido: antes de la @ solo puede llevar letras sin acento, números "
    "y los signos . _ - +"
)


def validar_correo(valor):
    """Rechaza correos con caracteres especiales (|, espacios, acentos, comillas…)."""
    if not _CORREO.match(valor or ""):
        raise ValidationError(MENSAJE_CORREO, code="correo_invalido")


# Mensaje de cada regla de Django, explicado como «insegura» y con qué hacer.
_MENSAJES_PASSWORD = {
    "password_too_common": (
        "La contraseña es insegura: es de las más usadas y fáciles de adivinar. "
        "Elige otra combinando palabras, números y signos."
    ),
    "password_too_short": "La contraseña es insegura: debe tener al menos 8 caracteres.",
    "password_entirely_numeric": "La contraseña es insegura: no puede ser solo números.",
    "password_too_similar": (
        "La contraseña es insegura: se parece demasiado a tu nombre o a tu correo."
    ),
}


def validar_password(valor, usuario=None):
    """Como ``validate_password`` de Django, pero con un mensaje claro por cada regla que falla."""
    try:
        password_validation.validate_password(valor, usuario)
    except ValidationError as error:
        mensajes = []
        for e in error.error_list:
            texto = _MENSAJES_PASSWORD.get(e.code) or " ".join(e.messages)
            if texto not in mensajes:
                mensajes.append(texto)
        raise ValidationError(mensajes) from error
