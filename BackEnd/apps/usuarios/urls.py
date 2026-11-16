from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .seguridad import (
    ActivarSegundoFactorView,
    CodigosRecuperacionView,
    ConfigurarSegundoFactorView,
    DesactivarSegundoFactorView,
    RecuperarPasswordView,
    RestablecerPasswordView,
    SegundoFactorView,
)
from .sesiones import MiSesionView, MisSesionesView
from .views import (
    CambiarPasswordView,
    LoginView,
    LogoutView,
    MeView,
    TelefonoView,
    UsuarioViewSet,
)

router = DefaultRouter()
router.register("usuarios", UsuarioViewSet, basename="usuario")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/yo/", MeView.as_view(), name="auth-yo"),
    path("auth/telefono/", TelefonoView.as_view(), name="auth-telefono"),
    path("auth/sesiones/", MisSesionesView.as_view(), name="auth-sesiones"),
    path("auth/sesiones/<int:num>/", MiSesionView.as_view(), name="auth-sesion"),
    path("auth/cambiar-password/", CambiarPasswordView.as_view(), name="auth-cambiar-password"),
    path("auth/recuperar/", RecuperarPasswordView.as_view(), name="auth-recuperar"),
    path("auth/restablecer/", RestablecerPasswordView.as_view(), name="auth-restablecer"),
    path("auth/2fa/", SegundoFactorView.as_view(), name="auth-2fa"),
    path("auth/2fa/configurar/", ConfigurarSegundoFactorView.as_view(), name="auth-2fa-configurar"),
    path("auth/2fa/activar/", ActivarSegundoFactorView.as_view(), name="auth-2fa-activar"),
    path("auth/2fa/desactivar/", DesactivarSegundoFactorView.as_view(), name="auth-2fa-desactivar"),
    path("auth/2fa/codigos/", CodigosRecuperacionView.as_view(), name="auth-2fa-codigos"),
    path("", include(router.urls)),
]
