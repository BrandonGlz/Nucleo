from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.usuarios.models import TelefonoPush
from apps.usuarios.serializers import (
    CambiarPasswordSerializer,
    CierreSesionSerializer,
    LoginSerializer,
    UsuarioSerializer,
)
from common import roles
from common.autenticacion import token_de
from common.permissions import PermisoPorRol
from common.scoping import usuarios_gestionables


class LoginView(APIView):
    """Inicia sesión con correo y contraseña y devuelve el token de la API."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        entrada = LoginSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        usuario = authenticate(
            request,
            correo=entrada.validated_data["correo"],
            password=entrada.validated_data["password"],
        )
        if usuario is None:
            return Response(
                {"detail": "Correo o contraseña incorrectos, o la cuenta no está activa."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        token = token_de(usuario)
        update_last_login(None, usuario)
        datos = entrada.validated_data
        if "token_expo" in datos:
            # Un teléfono pertenece a una sola persona: si cambia de usuario, se reasigna.
            TelefonoPush.objects.update_or_create(
                token_expo=datos["token_expo"],
                defaults={"usuario": usuario, "plataforma": datos["plataforma"]},
            )
        return Response(
            {
                "token": token.key,
                "usuario": UsuarioSerializer(usuario, context={"request": request}).data,
            }
        )


class LogoutView(APIView):
    """Invalida el token de la sesión y, si la app lo envía, quita el teléfono de los push."""

    def post(self, request):
        entrada = CierreSesionSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        token_expo = entrada.validated_data.get("token_expo")
        if token_expo:
            TelefonoPush.objects.filter(usuario=request.user, token_expo=token_expo).delete()
        Token.objects.filter(user=request.user).delete()
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
        request.user.save(update_fields=["password"])
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        Token.objects.filter(user=instancia).delete()
        instancia.telefonos_push.all().delete()
