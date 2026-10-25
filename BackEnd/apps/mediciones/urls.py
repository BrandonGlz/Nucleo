from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LecturaViewSet

router = DefaultRouter()
router.register("lecturas", LecturaViewSet, basename="lectura")

urlpatterns = [path("", include(router.urls))]
