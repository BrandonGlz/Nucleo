from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ArbolView,
    BancoViewSet,
    ConsolaAgenteView,
    ConsolaCalificarView,
    ConsolaEstadoView,
    DocumentoViewSet,
    HerramientasView,
    HerramientaView,
    RegistroViewSet,
    ResumenView,
)

router = DefaultRouter()
router.register("banco", BancoViewSet, basename="nico-banco")
router.register("registro", RegistroViewSet, basename="nico-registro")
router.register("documentos", DocumentoViewSet, basename="nico-documento")

urlpatterns = [
    path("chat/", ConsolaAgenteView.as_view(), name="nico-chat"),
    path("calificar/", ConsolaCalificarView.as_view(), name="nico-calificar"),
    path("estado/", ConsolaEstadoView.as_view(), name="nico-estado"),
    path("arbol/", ArbolView.as_view(), name="nico-arbol"),
    path("resumen/", ResumenView.as_view(), name="nico-resumen"),
    path("herramientas/", HerramientasView.as_view(), name="nico-herramientas"),
    path("herramientas/<str:nombre>/", HerramientaView.as_view(), name="nico-herramienta"),
    path("", include(router.urls)),
]
