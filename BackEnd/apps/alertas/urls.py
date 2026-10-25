from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AlertaViewSet, NotificacionViewSet

router = DefaultRouter()
router.register("alertas", AlertaViewSet, basename="alerta")
router.register("notificaciones", NotificacionViewSet, basename="notificacion")

urlpatterns = [path("", include(router.urls))]
