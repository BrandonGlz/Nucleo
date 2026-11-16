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
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS

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


# --- Sesión de la web en cookie HttpOnly -----------------------------------------------------
# La web no guarda el token: el inicio de sesión lo deja en una cookie que JavaScript no puede
# leer (un XSS no puede robar la sesión). La app móvil sigue con Authorization: Token.
# Protección CSRF: la cookie es SameSite=Lax y, en métodos que escriben, la API exige además el
# encabezado CLIENTE_WEB, que un sitio ajeno no puede enviar sin pasar por CORS.
CLIENTE_WEB = "X-Nucleo-Cliente"


def es_cliente_web(request):
    return request.headers.get(CLIENTE_WEB) == "web"


def poner_cookie_sesion(respuesta, token):
    respuesta.set_cookie(
        settings.NUCLEO_COOKIE_SESION,
        token.key,
        max_age=int(_vigencia().total_seconds()),
        httponly=True,
        secure=settings.NUCLEO_COOKIE_SEGURA,
        samesite="Lax",
        path="/",
    )
    return respuesta


def quitar_cookie_sesion(respuesta):
    respuesta.delete_cookie(settings.NUCLEO_COOKIE_SESION, path="/", samesite="Lax")
    return respuesta


def token_de_cookie(cookies):
    return cookies.get(settings.NUCLEO_COOKIE_SESION) or ""


# Con la verificación en dos pasos pendiente, el token solo sirve en estas rutas (perfil,
# cierre de sesión, contraseña y la propia configuración del segundo factor).
_RUTAS_SIN_SEGUNDO_FACTOR = "/api/v1/auth/"


class SegundoFactorPendiente(PermissionDenied):
    default_detail = "Tu rol exige la verificación en dos pasos. Configúrala para continuar."
    default_code = "segundo_factor_pendiente"


class TokenCaducable(TokenAuthentication):
    def authenticate(self, request):
        resultado = super().authenticate(request)
        if resultado is None:
            resultado = self._desde_cookie(request)
        if resultado is not None and not request.path.startswith(_RUTAS_SIN_SEGUNDO_FACTOR):
            from apps.usuarios.seguridad import falta_configurar

            if falta_configurar(resultado[0]):
                raise SegundoFactorPendiente()
        return resultado

    def _desde_cookie(self, request):
        clave = token_de_cookie(request.COOKIES)
        if not clave:
            return None
        if request.method not in SAFE_METHODS and not es_cliente_web(request):
            raise PermissionDenied(f"Falta el encabezado {CLIENTE_WEB} (protección CSRF).")
        try:
            return self.authenticate_credentials(clave)
        except AuthenticationFailed:
            # Cookie vieja o de una sesión cerrada: se trata como visita sin sesión, así las
            # rutas públicas (acceso, recuperación) siguen funcionando.
            return None

    def authenticate_credentials(self, clave):
        usuario, token = super().authenticate_credentials(clave)
        if token_caducado(token):
            token.delete()
            raise AuthenticationFailed("La sesión caducó por inactividad.")
        renovar(token)
        return usuario, token
