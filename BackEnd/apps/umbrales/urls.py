from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import UmbralViewSet

router = DefaultRouter()
router.register("umbrales", UmbralViewSet, basename="umbral")

urlpatterns = [path("", include(router.urls))]
