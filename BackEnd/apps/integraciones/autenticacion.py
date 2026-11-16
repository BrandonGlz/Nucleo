"""Autenticación con token de API (``Authorization: ApiKey nuc_<prefijo>_<secreto>``).

La petición queda a nombre de una ``CuentaIntegracion``: un usuario en memoria con alcance de
analista de toda la organización (``area`` vacía) que nunca se guarda. ``PermisoPorRol`` le
niega cualquier escritura.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.utils import timezone
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from apps.integraciones.models import TokenAPI
from common import roles

PALABRA = b"apikey"
_RENOVAR_USO = timedelta(minutes=5)


def resumen(clave):
    return hashlib.sha256(clave.encode()).hexdigest()


def generar_clave():
    """Devuelve ``(clave_completa, prefijo)``."""
    prefijo = secrets.token_hex(4)
    return f"nuc_{prefijo}_{secrets.token_urlsafe(32)}", prefijo


class CuentaIntegracion:
    """Usuario en memoria para las consultas hechas con un token de API."""

    es_integracion = True
    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = False
    is_superuser = False
    rol_id = roles.ANALISTA
    area_id = None
    pk = None
    num = None
    correo = ""

    def __init__(self, token):
        self.token = token
        self.organizacion_id = token.organizacion_id
        self.organizacion = token.organizacion

    def get_full_name(self):
        return f"Integración {self.token.nombre}"

    def tiene_rol(self, *codigos):
        return self.rol_id in codigos


class TokenAPIAutenticacion(BaseAuthentication):
    def authenticate(self, request):
        partes = get_authorization_header(request).split()
        if not partes or partes[0].lower() != PALABRA:
            return None
        if len(partes) != 2:
            raise AuthenticationFailed("Encabezado ApiKey mal formado.")
        clave = partes[1].decode(errors="ignore")
        trozos = clave.split("_", 2)
        if len(trozos) != 3 or trozos[0] != "nuc":
            raise AuthenticationFailed("Token de API no válido.")
        token = TokenAPI.objects.select_related("organizacion").filter(prefijo=trozos[1]).first()
        if token is None or not hmac.compare_digest(token.clave_hash, resumen(clave)):
            raise AuthenticationFailed("Token de API no válido.")
        ahora = timezone.now()
        if not token.activo or (token.fecha_expiracion and token.fecha_expiracion <= ahora):
            raise AuthenticationFailed("El token de API está revocado o caducó.")
        if not token.organizacion.esta_activa:
            raise AuthenticationFailed("La organización no está activa.")
        if token.ultimo_uso is None or ahora - token.ultimo_uso > _RENOVAR_USO:
            TokenAPI.objects.filter(pk=token.pk).update(ultimo_uso=ahora)
        return CuentaIntegracion(token), token

    def authenticate_header(self, request):
        return "ApiKey"


def con_token_api():
    """Clases de autenticación de las vistas de consulta que aceptan token de API."""
    from rest_framework.authentication import SessionAuthentication

    from common.autenticacion import TokenCaducable

    return [TokenCaducable, SessionAuthentication, TokenAPIAutenticacion]


class EsquemaTokenAPI(OpenApiAuthenticationExtension):
    """Cómo aparece el token de API en el esquema OpenAPI (/api/v1/docs/)."""

    target_class = "apps.integraciones.autenticacion.TokenAPIAutenticacion"
    name = "TokenAPI"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "`ApiKey nuc_<prefijo>_<secreto>` (Integraciones, solo lectura)",
        }
