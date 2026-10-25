"""Vistas transversales de la API de Núcleo."""

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Verificación de disponibilidad pública del backend."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "service": "nucleo-backend",
                "version": "0.1.0",
                "timestamp": timezone.now().isoformat(),
            }
        )
