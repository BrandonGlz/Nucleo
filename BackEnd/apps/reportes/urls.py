from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ProgramacionReporteViewSet, ReporteViewSet

router = DefaultRouter()
router.register("reportes", ReporteViewSet, basename="reporte")
router.register(
    "programaciones-reporte", ProgramacionReporteViewSet, basename="programacion-reporte"
)

urlpatterns = [path("", include(router.urls))]
