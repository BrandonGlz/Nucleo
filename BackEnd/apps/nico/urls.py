from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AjusteSugerenciasView,
    ArbolView,
    BancoViewSet,
    ConsolaAgenteView,
    ConsolaCalificarView,
    ConsolaEstadoView,
    ConsolaSugerenciasView,
    DocumentoViewSet,
    HerramientasView,
    HerramientaView,
    IncluidasView,
    LeerNotificacionesView,
    NotificacionesView,
    PreferenciasAvisosView,
    RegistroViewSet,
    ResumenView,
)
from .voz import VozView

router = DefaultRouter()
router.register("banco", BancoViewSet, basename="nico-banco")
router.register("registro", RegistroViewSet, basename="nico-registro")
router.register("documentos", DocumentoViewSet, basename="nico-documento")

urlpatterns = [
    path("chat/", ConsolaAgenteView.as_view(), name="nico-chat"),
    path("voz/", VozView.as_view(), name="nico-voz"),
    path("calificar/", ConsolaCalificarView.as_view(), name="nico-calificar"),
    path("estado/", ConsolaEstadoView.as_view(), name="nico-estado"),
    path("chat/sugerencias/", ConsolaSugerenciasView.as_view(), name="nico-chat-sugerencias"),
    path("sugerencias/", AjusteSugerenciasView.as_view(), name="nico-sugerencias"),
    path("incluidas/", IncluidasView.as_view(), name="nico-incluidas"),
    path("arbol/", ArbolView.as_view(), name="nico-arbol"),
    path("resumen/", ResumenView.as_view(), name="nico-resumen"),
    path("herramientas/", HerramientasView.as_view(), name="nico-herramientas"),
    path("herramientas/<str:nombre>/", HerramientaView.as_view(), name="nico-herramienta"),
    path("notificaciones/", NotificacionesView.as_view(), name="nico-notificaciones"),
    path("notificaciones/leer/", LeerNotificacionesView.as_view(), name="nico-notificaciones-leer"),
    path(
        "notificaciones/preferencias/",
        PreferenciasAvisosView.as_view(),
        name="nico-notificaciones-preferencias",
    ),
    path("", include(router.urls)),
]
