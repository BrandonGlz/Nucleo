"""Seguridad de la cuenta: verificación en dos pasos (TOTP) y recuperación de contraseña.

- La verificación en dos pasos es obligatoria para los roles de ``NUCLEO_2FA_OBLIGATORIO``
  (por ejemplo ``ADMINPLAT,ADMIN``) y opcional para los demás. Mientras un rol obligatorio no la
  configura, su token solo sirve para las rutas ``/auth/`` (ver ``common/autenticacion.py``).
- La recuperación manda por correo un enlace de un solo uso que caduca en
  ``PASSWORD_RESET_TIMEOUT`` segundos. La respuesta es la misma exista o no la cuenta.
"""

import logging

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.usuarios.models import SegundoFactor, Usuario
from common import totp
from common.red import LimitePorIP

logger = logging.getLogger(__name__)
Accion = RegistroAuditoria.Accion


# --- Verificación en dos pasos -------------------------------------------------------------


def es_obligatorio(usuario):
    return usuario.rol_id in settings.NUCLEO_2FA_OBLIGATORIO


def segundo_factor_activo(usuario):
    factor = SegundoFactor.objects.filter(usuario=usuario, activo=True).first()
    return factor


def falta_configurar(usuario):
    """El rol exige verificación en dos pasos y la cuenta aún no la tiene activa."""
    return es_obligatorio(usuario) and segundo_factor_activo(usuario) is None


def verificar_codigo(factor, codigo):
    """Acepta un código TOTP o uno de recuperación (que se consume). Devuelve el tipo usado
    (``"totp"`` o ``"recuperacion"``) o ``None``."""
    codigo = (codigo or "").strip()
    if not codigo:
        return None
    paso = totp.verificar(factor.secreto, codigo, ultimo_paso=factor.ultimo_paso)
    if paso is not None:
        factor.ultimo_paso = paso
        factor.save(update_fields=["ultimo_paso"])
        return "totp"
    resumen = totp.resumen_codigo_recuperacion(codigo)
    if resumen in factor.codigos_recuperacion:
        factor.codigos_recuperacion = [c for c in factor.codigos_recuperacion if c != resumen]
        factor.save(update_fields=["codigos_recuperacion"])
        return "recuperacion"
    return None


def _nuevos_codigos(factor):
    codigos = totp.generar_codigos_recuperacion()
    factor.codigos_recuperacion = [totp.resumen_codigo_recuperacion(c) for c in codigos]
    return codigos


class CodigoSerializer(serializers.Serializer):
    codigo = serializers.CharField(max_length=20)


class DesactivarSerializer(serializers.Serializer):
    password = serializers.CharField(style={"input_type": "password"}, trim_whitespace=False)
    codigo = serializers.CharField(max_length=20)


class SegundoFactorView(APIView):
    """``GET``: estado de la verificación en dos pasos de la cuenta."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        factor = SegundoFactor.objects.filter(usuario=request.user).first()
        activo = bool(factor and factor.activo)
        return Response(
            {
                "activo": activo,
                "obligatorio": es_obligatorio(request.user),
                "codigos_restantes": len(factor.codigos_recuperacion) if activo else 0,
                "fecha_activacion": factor.fecha_activacion if activo else None,
            }
        )


class ConfigurarSegundoFactorView(APIView):
    """``POST``: crea un secreto nuevo (pendiente) y devuelve el QR para la app de autenticación.

    Si ya estaba activa, primero hay que desactivarla: así un token robado no puede cambiar el
    segundo factor de la cuenta.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        factor = SegundoFactor.objects.filter(usuario=request.user).first()
        if factor and factor.activo:
            return Response(
                {"detail": "La verificación en dos pasos ya está activa."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        secreto = totp.generar_secreto()
        if factor is None:
            factor = SegundoFactor(usuario=request.user)
        factor.secreto = secreto
        factor.activo = False
        factor.ultimo_paso = None
        factor.codigos_recuperacion = []
        factor.save()
        uri = totp.uri(secreto, request.user.correo)
        return Response({"secreto": secreto, "uri": uri, "qr_svg": totp.qr_svg(uri)})


class ActivarSegundoFactorView(APIView):
    """``POST {codigo}``: confirma la configuración con el primer código y devuelve los
    códigos de recuperación (solo se muestran esta vez)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entrada = CodigoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        factor = SegundoFactor.objects.filter(usuario=request.user, activo=False).first()
        if factor is None:
            return Response(
                {"detail": "Primero genera el código QR."}, status=status.HTTP_400_BAD_REQUEST
            )
        paso = totp.verificar(factor.secreto, entrada.validated_data["codigo"])
        if paso is None:
            return Response(
                {"codigo": ["El código no es válido. Revisa la hora del teléfono."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        codigos = _nuevos_codigos(factor)
        factor.activo = True
        factor.ultimo_paso = paso
        factor.fecha_activacion = timezone.now()
        factor.save()
        registrar(Accion.SEGUNDO_FACTOR, descripcion="Activó la verificación en dos pasos")
        return Response({"codigos_recuperacion": codigos})


class DesactivarSegundoFactorView(APIView):
    """``POST {password, codigo}``: la quita (no se permite en los roles obligatorios)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entrada = DesactivarSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        if es_obligatorio(request.user):
            return Response(
                {"detail": "Tu rol exige la verificación en dos pasos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        factor = segundo_factor_activo(request.user)
        if factor is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if not request.user.check_password(entrada.validated_data["password"]):
            return Response(
                {"password": ["La contraseña no es correcta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if verificar_codigo(factor, entrada.validated_data["codigo"]) is None:
            return Response(
                {"codigo": ["El código no es válido."]}, status=status.HTTP_400_BAD_REQUEST
            )
        factor.delete()
        registrar(Accion.SEGUNDO_FACTOR, descripcion="Desactivó la verificación en dos pasos")
        return Response(status=status.HTTP_204_NO_CONTENT)


class CodigosRecuperacionView(APIView):
    """``POST {codigo}``: genera códigos de recuperación nuevos (los anteriores dejan de
    servir)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        entrada = CodigoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        factor = segundo_factor_activo(request.user)
        if factor is None:
            return Response(
                {"detail": "La verificación en dos pasos no está activa."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if verificar_codigo(factor, entrada.validated_data["codigo"]) is None:
            return Response(
                {"codigo": ["El código no es válido."]}, status=status.HTTP_400_BAD_REQUEST
            )
        codigos = _nuevos_codigos(factor)
        factor.save(update_fields=["codigos_recuperacion"])
        registrar(Accion.SEGUNDO_FACTOR, descripcion="Generó códigos de recuperación nuevos")
        return Response({"codigos_recuperacion": codigos})


# --- Recuperación de contraseña ------------------------------------------------------------


class RecuperarSerializer(serializers.Serializer):
    correo = serializers.EmailField()


class RestablecerSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    password_nueva = serializers.CharField(style={"input_type": "password"})


def _usuario_de_uid(uid):
    try:
        num = int(force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError):
        return None
    return Usuario.objects.filter(pk=num).first()


def enlace_recuperacion(usuario):
    uid = urlsafe_base64_encode(force_bytes(usuario.pk))
    token = default_token_generator.make_token(usuario)
    return f"{settings.NUCLEO_URL_WEB.rstrip('/')}/restablecer?uid={uid}&token={token}"


class RecuperarPasswordView(APIView):
    """``POST {correo}``: manda el enlace para elegir una contraseña nueva. Siempre responde
    204, para no revelar qué correos tienen cuenta."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LimitePorIP]
    throttle_scope = "recuperar"

    def post(self, request):
        entrada = RecuperarSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        correo = entrada.validated_data["correo"]
        usuario = Usuario.objects.filter(correo__iexact=correo).first()
        if usuario is not None and usuario.is_active:
            minutos = settings.PASSWORD_RESET_TIMEOUT // 60
            cuerpo = (
                f"Hola, {usuario.nombre}.\n\n"
                "Pediste cambiar la contraseña de tu cuenta de Núcleo. Abre este enlace para "
                f"elegir una nueva (vale una sola vez y caduca en {minutos} minutos):\n\n"
                f"{enlace_recuperacion(usuario)}\n\n"
                "Si no lo pediste, ignora este correo: tu contraseña no cambia."
            )
            try:
                send_mail(
                    "[Núcleo] Recupera tu contraseña",
                    cuerpo,
                    settings.DEFAULT_FROM_EMAIL,
                    [usuario.correo],
                )
            except Exception:
                logger.exception("No se pudo enviar el correo de recuperación a %s", usuario.pk)
            registrar(
                Accion.RECUPERAR,
                usuario=usuario,
                request=request,
                descripcion="Pidió el enlace de recuperación",
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class RestablecerPasswordView(APIView):
    """``POST {uid, token, password_nueva}``: guarda la contraseña nueva y cierra las sesiones
    abiertas. El enlace deja de servir al cambiar la contraseña."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LimitePorIP]
    throttle_scope = "recuperar"

    def post(self, request):
        entrada = RestablecerSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        usuario = _usuario_de_uid(datos["uid"])
        if (
            usuario is None
            or not usuario.is_active
            or not default_token_generator.check_token(usuario, datos["token"])
        ):
            return Response(
                {"detail": "El enlace no es válido o ya caducó. Pide uno nuevo."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(datos["password_nueva"], usuario)
        except Exception as error:
            mensajes = getattr(error, "messages", [str(error)])
            return Response({"password_nueva": mensajes}, status=status.HTTP_400_BAD_REQUEST)
        usuario.set_password(datos["password_nueva"])
        usuario.save(update_fields=["password"])
        Token.objects.filter(user=usuario).delete()
        registrar(
            Accion.RECUPERAR,
            usuario=usuario,
            request=request,
            descripcion="Restableció la contraseña con el enlace",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
