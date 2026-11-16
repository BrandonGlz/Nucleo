from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DispositivoConsolaViewSet,
    FirmwareView,
    OrganizacionesView,
    PoliticaView,
    ResumenView,
    SesionViewSet,
    UsuarioConsolaViewSet,
)

router = DefaultRouter()
router.register("usuarios", UsuarioConsolaViewSet, basename="consola-usuario")
router.register("sesiones", SesionViewSet, basename="consola-sesion")
router.register("dispositivos", DispositivoConsolaViewSet, basename="consola-dispositivo")

urlpatterns = [
    path("resumen/", ResumenView.as_view(), name="consola-resumen"),
    path("organizaciones/", OrganizacionesView.as_view(), name="consola-organizaciones"),
    path("firmware/", FirmwareView.as_view(), name="consola-firmware"),
    path("politicas/", PoliticaView.as_view(), name="consola-politicas"),
    path("", include(router.urls)),
]
