from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TableroAnaliticaViewSet

router = DefaultRouter()
router.register("tableros-analitica", TableroAnaliticaViewSet, basename="tablero-analitica")

urlpatterns = [
    path("", include(router.urls)),
]
