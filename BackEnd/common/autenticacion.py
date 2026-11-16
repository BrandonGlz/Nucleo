"""Sesiones de la API que caducan por inactividad (SRS 3.3.2).

Cada inicio de sesión crea una ``Sesion`` (``apps/usuarios``) con su propia clave: la web la
recibe en una cookie HttpOnly y la app en el cuerpo de la respuesta (``Authorization: Token``).
Así cada navegador o teléfono es una sesión aparte que se puede ver y cerrar desde la consola de
administración. Solo se guarda el SHA-256 de la clave. ``ultimo_uso`` se renueva (como mucho una
vez por minuto) y la sesión caduca tras los días sin uso de la política de seguridad.
"""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS

_RENOVAR_DESPUES_DE = timedelta(minutes=1)


def _vigencia():
    from apps.consola.politicas import politica

    return timedelta(days=politica().dias_sesion)


def hash_clave(clave):
    return hashlib.sha256(clave.encode()).hexdigest()


def sesion_caducada(sesion, ahora=None):
    return (ahora or timezone.now()) - sesion.ultimo_uso > _vigencia()


def renovar(sesion, ahora=None):
    from apps.usuarios.models import Sesion

    ahora = ahora or timezone.now()
    if ahora - sesion.ultimo_uso > _RENOVAR_DESPUES_DE:
        Sesion.objects.filter(pk=sesion.pk).update(ultimo_uso=ahora)
        sesion.ultimo_uso = ahora


def _resumir_agente(texto):
    """«Chrome en Windows», «App Núcleo (Android)»… a partir del User-Agent."""
    t = texto or ""
    if "okhttp" in t or "Expo" in t or "Nucleo-App" in t or "CFNetwork" in t:
        so = "iOS" if ("CFNetwork" in t or "iPhone" in t) else "Android"
        return f"App Núcleo ({so})"
    navegador = next(
        (
            n
            for clave, n in (
                ("Edg/", "Edge"),
                ("OPR/", "Opera"),
                ("Brave", "Brave"),
                ("Firefox/", "Firefox"),
                ("Chrome/", "Chrome"),
                ("Safari/", "Safari"),
            )
            if clave in t
        ),
        "Navegador",
    )
    so = next(
        (
            n
            for clave, n in (
                ("Android", "Android"),
                ("iPhone", "iPhone"),
                ("iPad", "iPad"),
                ("Windows", "Windows"),
                ("Mac OS", "macOS"),
                ("Linux", "Linux"),
            )
            if clave in t
        ),
        "",
    )
    return f"{navegador} en {so}" if so else navegador


def crear_sesion(usuario, request=None):
    """Abre una sesión nueva y devuelve ``(sesion, clave)``. La clave solo existe aquí."""
    from apps.usuarios.models import Sesion
    from common.red import ip_cliente

    clave = secrets.token_hex(20)
    agente = request.META.get("HTTP_USER_AGENT", "") if request is not None else ""
    sesion = Sesion.objects.create(
        usuario=usuario,
        clave_hash=hash_clave(clave),
        cliente=Sesion.Cliente.WEB
        if request is not None and es_cliente_web(request)
        else Sesion.Cliente.APP,
        agente=_resumir_agente(agente)[:200],
        ip=ip_cliente(request) if request is not None else None,
        ultimo_uso=timezone.now(),
    )
    return sesion, clave


def cerrar_sesiones(usuario):
    """Cierra todas las sesiones de una persona (cambio de contraseña, baja, consola)."""
    return usuario.sesiones.all().delete()[0]


def sesion_de_clave(clave):
    """Sesión vigente de una persona activa para esa clave, o None (la caducada se borra)."""
    from apps.usuarios.models import Sesion

    if not clave:
        return None
    sesion = Sesion.objects.select_related("usuario").filter(clave_hash=hash_clave(clave)).first()
    if sesion is None:
        return None
    if sesion_caducada(sesion):
        sesion.delete()
        return None
    if not sesion.usuario.is_active:
        return None
    renovar(sesion)
    return sesion


def usuario_de_token(clave):
    """Usuario activo dueño de una sesión vigente, o None. Lo usan las conexiones WebSocket."""
    sesion = sesion_de_clave(clave)
    return sesion.usuario if sesion else None


# --- Sesión de la web en cookie HttpOnly -----------------------------------------------------
# La web no guarda el token: el inicio de sesión lo deja en una cookie que JavaScript no puede
# leer (un XSS no puede robar la sesión). La app móvil sigue con Authorization: Token.
# Protección CSRF: la cookie es SameSite=Lax y, en métodos que escriben, la API exige además el
# encabezado CLIENTE_WEB, que un sitio ajeno no puede enviar sin pasar por CORS.
CLIENTE_WEB = "X-Nucleo-Cliente"


def es_cliente_web(request):
    return request.headers.get(CLIENTE_WEB) == "web"


def poner_cookie_sesion(respuesta, clave):
    respuesta.set_cookie(
        settings.NUCLEO_COOKIE_SESION,
        clave,
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


class TokenCaducable(BaseAuthentication):
    """``Authorization: Token <clave>`` (app) o la cookie de sesión (web). ``request.auth`` es la
    ``Sesion``: el cierre de sesión borra solo esa."""

    palabra = b"token"

    def authenticate_header(self, request):
        return "Token"

    def authenticate(self, request):
        resultado = self._desde_encabezado(request)
        if resultado is None:
            resultado = self._desde_cookie(request)
        if resultado is not None and not request.path.startswith(_RUTAS_SIN_SEGUNDO_FACTOR):
            from apps.usuarios.seguridad import falta_configurar

            if falta_configurar(resultado[0]):
                raise SegundoFactorPendiente()
        return resultado

    def _desde_encabezado(self, request):
        partes = get_authorization_header(request).split()
        if not partes or partes[0].lower() != self.palabra:
            return None
        if len(partes) != 2:
            raise AuthenticationFailed("Encabezado Authorization mal formado.")
        try:
            clave = partes[1].decode()
        except UnicodeError:
            raise AuthenticationFailed("Encabezado Authorization mal formado.") from None
        return self.authenticate_credentials(clave)

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
        sesion = sesion_de_clave(clave)
        if sesion is None:
            raise AuthenticationFailed("La sesión no es válida o caducó por inactividad.")
        return sesion.usuario, sesion
