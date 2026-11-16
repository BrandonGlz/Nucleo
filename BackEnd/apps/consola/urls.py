from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .flasheo import ArchivosView, ConfiguracionView, FlasheoView, MicropythonView
from .views import (
    DispositivoConsolaViewSet,
    FirmwareView,
    OrganizacionesView,
    PoliticaView,
    ResumenView,
    SesionViewSet,
    UsuarioConsolaViewSet,
)
from .vistas_alertas import AlertaSeguridadViewSet, NotificacionSeguridadViewSet

router = DefaultRouter()
router.register("usuarios", UsuarioConsolaViewSet, basename="consola-usuario")
router.register("sesiones", SesionViewSet, basename="consola-sesion")
router.register("dispositivos", DispositivoConsolaViewSet, basename="consola-dispositivo")
router.register("alertas", AlertaSeguridadViewSet, basename="consola-alerta")
router.register("notificaciones", NotificacionSeguridadViewSet, basename="consola-notificacion")

urlpatterns = [
    path("resumen/", ResumenView.as_view(), name="consola-resumen"),
    path("organizaciones/", OrganizacionesView.as_view(), name="consola-organizaciones"),
    path("firmware/", FirmwareView.as_view(), name="consola-firmware"),
    path("politicas/", PoliticaView.as_view(), name="consola-politicas"),
    path("flasheo/", FlasheoView.as_view(), name="consola-flasheo"),
    path("flasheo/micropython/<str:chip>/", MicropythonView.as_view(), name="consola-micropython"),
    path("flasheo/archivos/", ArchivosView.as_view(), name="consola-flasheo-archivos"),
    path("flasheo/configuracion/", ConfiguracionView.as_view(), name="consola-flasheo-config"),
    path("", include(router.urls)),
]
