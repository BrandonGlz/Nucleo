"""Token de la API que caduca por inactividad (SRS 3.3.2).

Se usa el token de DRF. ``Token.created`` guarda el último uso: cada petición lo
renueva (como mucho una vez por minuto, para no escribir en cada llamada) y el token
caduca tras ``NUCLEO_TOKEN_DIAS_SIN_USO`` días sin usarse.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed

_RENOVAR_DESPUES_DE = timedelta(minutes=1)


def _vigencia():
    return timedelta(days=settings.NUCLEO_TOKEN_DIAS_SIN_USO)


def token_caducado(token, ahora=None):
    return (ahora or timezone.now()) - token.created > _vigencia()


def renovar(token, ahora=None):
    ahora = ahora or timezone.now()
    if ahora - token.created > _RENOVAR_DESPUES_DE:
        Token.objects.filter(pk=token.pk).update(created=ahora)
        token.created = ahora


def token_de(usuario):
    """Token vigente del usuario: renueva el existente o crea uno si caducó."""
    token = Token.objects.filter(user=usuario).first()
    if token is not None and token_caducado(token):
        token.delete()
        token = None
    if token is None:
        return Token.objects.create(user=usuario)
    renovar(token)
    return token


def usuario_de_token(clave):
    """Usuario activo dueño de un token vigente, o None. Lo usan las conexiones WebSocket."""
    token = Token.objects.select_related("user").filter(key=clave).first()
    if token is None or token_caducado(token) or not token.user.is_active:
        return None
    renovar(token)
    return token.user


class TokenCaducable(TokenAuthentication):
    def authenticate_credentials(self, clave):
        usuario, token = super().authenticate_credentials(clave)
        if token_caducado(token):
            token.delete()
            raise AuthenticationFailed("La sesión caducó por inactividad.")
        renovar(token)
        return usuario, token
