from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DispositivoViewSet, SensorViewSet

router = DefaultRouter()
router.register("dispositivos", DispositivoViewSet, basename="dispositivo")
router.register("sensores", SensorViewSet, basename="sensor")

urlpatterns = [path("", include(router.urls))]
