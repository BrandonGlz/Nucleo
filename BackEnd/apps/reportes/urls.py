from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AgenteView,
    CalificarAgenteView,
    EstadoAgenteView,
    ProgramacionReporteViewSet,
    PuenteFirmwareArchivoView,
    PuenteFirmwareView,
    PuenteTomarView,
    ReporteViewSet,
    SugerenciasAgenteView,
)

router = DefaultRouter()
router.register("reportes", ReporteViewSet, basename="reporte")
router.register(
    "programaciones-reporte", ProgramacionReporteViewSet, basename="programacion-reporte"
)

urlpatterns = [
    path("agente/", AgenteView.as_view(), name="agente"),
    path("agente/calificar/", CalificarAgenteView.as_view(), name="agente-calificar"),
    path("agente/estado/", EstadoAgenteView.as_view(), name="agente-estado"),
    path("agente/sugerencias/", SugerenciasAgenteView.as_view(), name="agente-sugerencias"),
    path("puente/tomar/", PuenteTomarView.as_view(), name="puente-tomar"),
    path("puente/firmware/", PuenteFirmwareView.as_view(), name="puente-firmware"),
    path(
        "puente/firmware/archivo/",
        PuenteFirmwareArchivoView.as_view(),
        name="puente-firmware-archivo",
    ),
    path("", include(router.urls)),
]
