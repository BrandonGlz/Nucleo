from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.integraciones.views import TokenAPIViewSet, WebhookViewSet

router = DefaultRouter()
router.register("tokens", TokenAPIViewSet, basename="token-api")
router.register("webhooks", WebhookViewSet, basename="webhook")

urlpatterns = [path("integraciones/", include(router.urls))]
