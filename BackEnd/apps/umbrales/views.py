from rest_framework import viewsets

from apps.dispositivos.services import publicar_configuracion_al_confirmar
from apps.umbrales.models import Umbral
from apps.umbrales.serializers import UmbralSerializer
from common import roles
from common.permissions import PermisoPorRol
from common.scoping import dispositivos_visibles


class UmbralViewSet(viewsets.ModelViewSet):
    """Umbrales mínimo y máximo por variable y dispositivo.

    Solo administradores y supervisores pueden modificarlos.
    """

    serializer_class = UmbralSerializer
    permission_classes = [PermisoPorRol]
    roles_escritura = (roles.ADMIN, roles.SUPERVISOR)

    def get_queryset(self):
        consulta = Umbral.objects.filter(
            dispositivo__in=dispositivos_visibles(self.request.user)
        ).select_related("variable", "dispositivo")
        dispositivo = self.request.query_params.get("dispositivo")
        if dispositivo and dispositivo.isdigit():
            consulta = consulta.filter(dispositivo_id=int(dispositivo))
        return consulta

    def perform_create(self, serializer):
        umbral = serializer.save(configurado_por=self.request.user)
        publicar_configuracion_al_confirmar(umbral.dispositivo)

    def perform_update(self, serializer):
        umbral = serializer.save(configurado_por=self.request.user)
        publicar_configuracion_al_confirmar(umbral.dispositivo)

    def perform_destroy(self, instancia):
        dispositivo = instancia.dispositivo
        instancia.delete()
        publicar_configuracion_al_confirmar(dispositivo)
