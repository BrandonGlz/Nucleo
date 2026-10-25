"""Rutas de la API v1 de Núcleo."""

from django.urls import path

from .views import HealthCheckView

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
]
