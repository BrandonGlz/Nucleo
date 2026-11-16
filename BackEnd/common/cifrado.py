"""Cifrado de datos sensibles en la base (cifrado en reposo por campo).

Usa Fernet (AES-128-CBC + HMAC-SHA256) de ``cryptography``. La llave es
``NUCLEO_CLAVE_CIFRADO`` (una llave Fernet en base64); sin ella se deriva de
``DJANGO_SECRET_KEY``, lo que solo conviene en desarrollo y pruebas. Si la llave se pierde, los
campos cifrados no se pueden leer: en producción se guarda una copia fuera del servidor.

``CampoCifrado`` guarda el texto cifrado y lo descifra al leer. Un valor que no se puede
descifrar (por ejemplo, el de un respaldo anterior al cifrado) se devuelve tal cual, y se cifra
la próxima vez que se guarde.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

PREFIJO = "fernet:"


@lru_cache(maxsize=4)
def _fernet(clave, secreto_django):
    if not clave:
        derivada = hashlib.sha256(f"nucleo-cifrado:{secreto_django}".encode()).digest()
        clave = base64.urlsafe_b64encode(derivada).decode()
    return Fernet(clave.encode() if isinstance(clave, str) else clave)


def fernet():
    return _fernet(settings.NUCLEO_CLAVE_CIFRADO, settings.SECRET_KEY)


def cifrar(texto):
    if texto is None or texto == "":
        return texto
    return PREFIJO + fernet().encrypt(str(texto).encode()).decode()


def descifrar(valor):
    if not valor or not str(valor).startswith(PREFIJO):
        return valor
    try:
        return fernet().decrypt(valor[len(PREFIJO) :].encode()).decode()
    except InvalidToken:
        # Otra llave: no se puede leer, pero tampoco se rompe la consulta.
        return None


class CampoCifrado(models.TextField):
    """Texto cifrado en la base y en claro en Python. No sirve para filtrar ni ordenar."""

    description = "Texto cifrado con Fernet"

    def from_db_value(self, valor, expression, connection):
        return descifrar(valor)

    def to_python(self, valor):
        return descifrar(valor) if isinstance(valor, str) else valor

    def get_prep_value(self, valor):
        valor = super().get_prep_value(valor)
        if isinstance(valor, str) and valor.startswith(PREFIJO):
            return valor
        return cifrar(valor)
