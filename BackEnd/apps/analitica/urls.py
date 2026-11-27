from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ConsultaCSVView,
    ConsultaView,
    HallazgosView,
    TableroAnaliticaViewSet,
)

router = DefaultRouter()
router.register("tableros-analitica", TableroAnaliticaViewSet, basename="tablero-analitica")

urlpatterns = [
    path("analitica/consulta/", ConsultaView.as_view(), name="analitica-consulta"),
    path(
        "analitica/consulta/csv/",
        ConsultaCSVView.as_view(),
        name="analitica-consulta-csv",
    ),
    path("analitica/hallazgos/", HallazgosView.as_view(), name="analitica-hallazgos"),
    path("", include(router.urls)),
]
