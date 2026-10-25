from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AreaViewSet, OrganizacionViewSet

router = DefaultRouter()
router.register("organizaciones", OrganizacionViewSet, basename="organizacion")
router.register("areas", AreaViewSet, basename="area")

urlpatterns = [path("", include(router.urls))]
