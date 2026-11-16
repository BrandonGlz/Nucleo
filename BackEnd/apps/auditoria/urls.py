from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.auditoria.views import RegistroAuditoriaViewSet

router = DefaultRouter()
router.register("auditoria", RegistroAuditoriaViewSet, basename="auditoria")

urlpatterns = [path("", include(router.urls))]
