from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.dispositivos.serializers import DispositivoSerializer, SensorSerializer
from apps.dispositivos.services import publicar_configuracion_al_confirmar
from apps.mediciones import consultas
from apps.mediciones.serializers import UltimaLecturaSerializer
from apps.tiempo_real import eventos
from common import roles
from common.permissions import PermisoPorRol
from common.scoping import dispositivos_visibles, sensores_visibles


class DispositivoViewSet(viewsets.ModelViewSet):
    """Dispositivos IoT. El administrador los gestiona; el supervisor ajusta el
    intervalo de muestreo; el operador solo ve el que tiene asignado."""

    serializer_class = DispositivoSerializer
    permission_classes = [PermisoPorRol]
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)
    roles_acciones = {"destroy": (roles.ADMIN,), "create": (roles.ADMIN,)}

    def get_queryset(self):
        return (
            dispositivos_visibles(self.request.user)
            .select_related("area", "estado_dispositivo")
            .prefetch_related("sensores")
        )

    def perform_create(self, serializer):
        dispositivo = serializer.save(registrado_por=self.request.user)
        publicar_configuracion_al_confirmar(dispositivo)

    def perform_update(self, serializer):
        estado_anterior = serializer.instance.estado_dispositivo_id
        dispositivo = serializer.save()
        publicar_configuracion_al_confirmar(dispositivo)
        if dispositivo.estado_dispositivo_id != estado_anterior:
            eventos.estado_dispositivo(dispositivo)

    def perform_destroy(self, instancia):
        """La baja conserva el historial: el dispositivo queda "Dado de baja"."""
        instancia.estado_dispositivo_id = roles.DISPOSITIVO_BAJA
        instancia.operador = None
        instancia.save(update_fields=["estado_dispositivo", "operador"])
        eventos.estado_dispositivo(instancia)

    @action(detail=True, methods=["get"], url_path="ultimas-lecturas")
    def ultimas_lecturas(self, request, pk=None):
        """Última lectura estabilizada de cada variable, para el panel en tiempo real."""
        dispositivo = self.get_object()
        sensores = dict(dispositivo.sensores.values_list("num", "modelo"))
        lecturas = consultas.ultimas_por_variable(sensores)
        contexto = {"sensores": sensores, "unidades": consultas.unidades()}
        return Response(UltimaLecturaSerializer(lecturas, many=True, context=contexto).data)


class SensorViewSet(viewsets.ModelViewSet):
    """Sensores de los dispositivos y su estado de calibración."""

    serializer_class = SensorSerializer
    permission_classes = [PermisoPorRol]
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)

    def get_queryset(self):
        consulta = sensores_visibles(self.request.user).select_related("estado_sensor")
        dispositivo = self.request.query_params.get("dispositivo")
        if dispositivo and dispositivo.isdigit():
            consulta = consulta.filter(dispositivo_id=int(dispositivo))
        return consulta
