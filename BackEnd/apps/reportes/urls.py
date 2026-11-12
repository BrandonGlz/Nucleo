from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AgenteView,
    CalificarAgenteView,
    EstadoAgenteView,
    ProgramacionReporteViewSet,
    PuenteTomarView,
    ReporteViewSet,
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
    path("puente/tomar/", PuenteTomarView.as_view(), name="puente-tomar"),
    path("", include(router.urls)),
]
