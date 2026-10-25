from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CambiarPasswordView, LoginView, LogoutView, MeView, UsuarioViewSet

router = DefaultRouter()
router.register("usuarios", UsuarioViewSet, basename="usuario")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/yo/", MeView.as_view(), name="auth-yo"),
    path("auth/cambiar-password/", CambiarPasswordView.as_view(), name="auth-cambiar-password"),
    path("", include(router.urls)),
]
