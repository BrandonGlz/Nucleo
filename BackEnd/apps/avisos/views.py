from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.avisos.models import Aviso
from apps.avisos.serializers import AvisoSerializer, MarcarLeidosSerializer


class AvisoViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Avisos de la campana del propio usuario (dispositivos, usuarios, reportes y Nico AI).

    Filtros: ``tipo`` (DISPOSITIVO, USUARIO, REPORTE, NICO) y ``no_leidos=1``.
    """

    serializer_class = AvisoSerializer
    permission_classes = [IsAuthenticated]

    def _propios(self):
        return Aviso.objects.filter(usuario=self.request.user)

    def get_queryset(self):
        consulta = self._propios()
        parametros = self.request.query_params
        tipo = parametros.get("tipo")
        if tipo:
            consulta = consulta.filter(tipo=tipo.upper())
        if parametros.get("no_leidos", "").lower() in ("1", "true", "si", "sí"):
            consulta = consulta.filter(leido_en__isnull=True)
        return consulta

    @action(detail=False, methods=["get"])
    def conteo(self, request):
        return Response({"no_leidos": self._propios().filter(leido_en__isnull=True).count()})

    @action(detail=False, methods=["post"], url_path="marcar-leidos")
    def marcar_leidos(self, request):
        entrada = MarcarLeidosSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        consulta = self._propios().filter(leido_en__isnull=True)
        nums = entrada.validated_data.get("nums")
        if nums:
            consulta = consulta.filter(pk__in=nums)
        return Response({"marcados": consulta.update(leido_en=timezone.now())})
