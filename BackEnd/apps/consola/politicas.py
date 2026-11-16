"""Lectura de la política de seguridad, con una copia en memoria de pocos segundos.

La usan el inicio de sesión (intentos por minuto), la caducidad de las sesiones, la verificación
en dos pasos obligatoria, la depuración de la bitácora y la actualización del firmware. Los
cambios desde la consola tardan como mucho ``_VIGENCIA`` segundos en aplicarse en cada proceso.
"""

import time

from django.conf import settings
from django.db import DatabaseError

_VIGENCIA = 15
_copia = {"valor": None, "hasta": 0.0}


def valores_iniciales():
    rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].get("login", "10/min")
    return {
        "dias_sesion": settings.NUCLEO_TOKEN_DIAS_SIN_USO,
        "intentos_login_por_minuto": int(rate.split("/")[0]),
        "roles_2fa_obligatorio": list(settings.NUCLEO_2FA_OBLIGATORIO),
        "dias_auditoria": settings.NUCLEO_AUDITORIA_DIAS,
        "ota_todos": "*" in settings.NUCLEO_FIRMWARE_DISPOSITIVOS,
    }


def politica(fresca=False):
    """La fila de la política (se crea con los valores del ``.env`` la primera vez)."""
    from .models import PoliticaSeguridad

    ahora = time.monotonic()
    if not fresca and _copia["valor"] is not None and ahora < _copia["hasta"]:
        return _copia["valor"]
    try:
        valor, _ = PoliticaSeguridad.objects.get_or_create(pk=1, defaults=valores_iniciales())
    except DatabaseError:
        # Sin tabla todavía (antes de migrar): se usan los valores del .env.
        valor = PoliticaSeguridad(pk=1, **valores_iniciales())
    _copia.update(valor=valor, hasta=ahora + _VIGENCIA)
    return valor


def olvidar():
    """Descarta la copia en memoria (al guardar cambios y en las pruebas)."""
    _copia.update(valor=None, hasta=0.0)
