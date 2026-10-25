from rest_framework.response import Response
from rest_framework.views import APIView

from .models import EstadoDispositivo, EstadoSensor, EstadoUsuario, Rol, VariableAmbiental
from .serializers import (
    EstadoDispositivoSerializer,
    EstadoSensorSerializer,
    EstadoUsuarioSerializer,
    RolSerializer,
    VariableAmbientalSerializer,
)


class CatalogosView(APIView):
    """Todos los catálogos en una sola respuesta, para llenar listas en los clientes."""

    def get(self, request):
        return Response(
            {
                "roles": RolSerializer(Rol.objects.all(), many=True).data,
                "estados_usuario": EstadoUsuarioSerializer(
                    EstadoUsuario.objects.all(), many=True
                ).data,
                "estados_dispositivo": EstadoDispositivoSerializer(
                    EstadoDispositivo.objects.all(), many=True
                ).data,
                "estados_sensor": EstadoSensorSerializer(
                    EstadoSensor.objects.all(), many=True
                ).data,
                "variables": VariableAmbientalSerializer(
                    VariableAmbiental.objects.all(), many=True
                ).data,
            }
        )
