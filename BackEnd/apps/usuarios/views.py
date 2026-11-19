from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.auditoria.models import RegistroAuditoria
from apps.auditoria.servicios import registrar
from apps.usuarios import seguridad
from apps.usuarios.models import Sesion, TelefonoPush, Usuario
from apps.usuarios.serializers import (
    CambiarPasswordSerializer,
    CierreSesionSerializer,
    LoginSerializer,
    TelefonoSerializer,
    UsuarioSerializer,
)
from common import roles
from common.autenticacion import (
    cerrar_sesiones,
    crear_sesion,
    es_cliente_web,
    poner_cookie_sesion,
    quitar_cookie_sesion,
)
from common.permissions import PermisoPorRol
from common.red import LimitePorIP
from common.scoping import usuarios_gestionables

Accion = RegistroAuditoria.Accion


class LoginView(APIView):
    """Inicia sesión con correo y contraseña y devuelve el token de la API.

    Con la verificación en dos pasos activa hace falta además ``codigo`` (de la app de
    autenticación o de recuperación); sin él responde 401 con ``requiere_codigo``.
    ``configurar_segundo_factor`` avisa que el rol la exige y la cuenta aún no la tiene.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LimitePorIP]
    throttle_scope = "login"

    def _rechazo(self, request, correo, motivo, detalle, **extra):
        conocido = Usuario.objects.filter(correo__iexact=correo).first()
        registrar(
            Accion.LOGIN_FALLIDO,
            usuario=conocido,
            correo=correo,
            request=request,
            descripcion=motivo,
        )
        return Response({"detail": detalle, **extra}, status=status.HTTP_401_UNAUTHORIZED)

    def post(self, request):
        entrada = LoginSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        usuario = authenticate(request, correo=datos["correo"], password=datos["password"])
        if usuario is None:
            return self._rechazo(
                request,
                datos["correo"],
                "Correo o contraseña incorrectos, o cuenta inactiva",
                "Correo o contraseña incorrectos, o la cuenta no está activa.",
            )
        factor = seguridad.segundo_factor_activo(usuario)
        if factor is not None:
            codigo = datos.get("codigo", "")
            if not codigo:
                return Response(
                    {
                        "detail": "Escribe el código de tu app de autenticación.",
                        "requiere_codigo": True,
                    },
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if seguridad.verificar_codigo(factor, codigo) is None:
                return self._rechazo(
                    request,
                    datos["correo"],
                    "Código de verificación incorrecto",
                    "El código no es válido.",
                    requiere_codigo=True,
                )
        sesion, clave = crear_sesion(usuario, request)
        update_last_login(None, usuario)
        if "token_expo" in datos:
            # Un teléfono pertenece a una sola persona: si cambia de usuario, se reasigna.
            TelefonoPush.objects.update_or_create(
                token_expo=datos["token_expo"],
                defaults={"usuario": usuario, "plataforma": datos["plataforma"]},
            )
        registrar(
            Accion.LOGIN,
            usuario=usuario,
            request=request,
            descripcion="Con verificación en dos pasos" if factor else "",
        )
        cuerpo = {
            "token": clave,
            "usuario": UsuarioSerializer(usuario, context={"request": request}).data,
            "configurar_segundo_factor": factor is None and seguridad.es_obligatorio(usuario),
        }
        if es_cliente_web(request):
            # La web recibe la sesión en una cookie HttpOnly y nunca ve el token.
            del cuerpo["token"]
            return poner_cookie_sesion(Response(cuerpo), clave)
        return Response(cuerpo)


class LogoutView(APIView):
    """Cierra la sesión actual (solo este navegador o teléfono) y, si la app lo envía, quita el
    teléfono de los push."""

    def post(self, request):
        entrada = CierreSesionSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        token_expo = entrada.validated_data.get("token_expo")
        if token_expo:
            TelefonoPush.objects.filter(usuario=request.user, token_expo=token_expo).delete()
        if isinstance(request.auth, Sesion):
            request.auth.delete()
        registrar(Accion.LOGOUT)
        return quitar_cookie_sesion(Response(status=status.HTTP_204_NO_CONTENT))


class TelefonoView(APIView):
    """Activa (``POST``) o desactiva (``DELETE``) los push en el teléfono de la sesión.

    Lo usa el interruptor «Notificaciones push» del perfil de la app sin cerrar sesión.
    """

    def post(self, request):
        entrada = TelefonoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        if "plataforma" not in datos:
            raise ValidationError({"plataforma": "Indique la plataforma del teléfono."})
        TelefonoPush.objects.update_or_create(
            token_expo=datos["token_expo"],
            defaults={"usuario": request.user, "plataforma": datos["plataforma"]},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request):
        entrada = TelefonoSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        TelefonoPush.objects.filter(
            usuario=request.user, token_expo=entrada.validated_data["token_expo"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Datos del usuario autenticado."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UsuarioSerializer(request.user, context={"request": request}).data)


class CambiarPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        entrada = CambiarPasswordSerializer(data=request.data, context={"request": request})
        entrada.is_valid(raise_exception=True)
        if not request.user.check_password(entrada.validated_data["password_actual"]):
            return Response(
                {"password_actual": ["La contraseña actual no es correcta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(entrada.validated_data["password_nueva"])
        request.user.debe_cambiar_password = False
        request.user.save(update_fields=["password", "debe_cambiar_password"])
        cerrar_sesiones(request.user)
        return quitar_cookie_sesion(Response(status=status.HTTP_204_NO_CONTENT))


class UsuarioViewSet(viewsets.ModelViewSet):
    """Alta, consulta, edición y baja de usuarios.

    El administrador gestiona toda su organización; el supervisor, solo a los
    operadores de su área. La baja marca la cuenta como inactiva.
    """

    serializer_class = UsuarioSerializer
    permission_classes = [PermisoPorRol]
    roles_lectura = (roles.ADMIN, roles.SUPERVISOR)
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)

    def get_queryset(self):
        return usuarios_gestionables(self.request.user).select_related("rol", "estado_usuario")

    def perform_destroy(self, instancia):
        instancia.estado_usuario_id = roles.USUARIO_INACTIVO
        instancia.save(update_fields=["estado_usuario"])
        cerrar_sesiones(instancia)
        instancia.telefonos_push.all().delete()
