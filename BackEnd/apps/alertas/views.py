from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.alertas.models import Alerta, Notificacion
from apps.alertas.serializers import (
    AlertaSerializer,
    AtencionSerializer,
    NotificacionSerializer,
)
from apps.integraciones import envio as webhooks
from apps.integraciones.autenticacion import con_token_api
from apps.tiempo_real import eventos
from common import roles
from common.exportar import respuesta_csv
from common.filtros import parametro_entero, parametro_fecha
from common.permissions import PermisoPorRol
from common.scoping import dispositivos_visibles


class AlertaViewSet(viewsets.ReadOnlyModelViewSet):
    """Alertas de los dispositivos a su alcance.

    Filtros: ``estado``, ``nivel``, ``dispositivo``, ``variable``, ``desde`` y ``hasta``.
    Los administradores y supervisores las atienden o descartan.
    """

    serializer_class = AlertaSerializer
    authentication_classes = con_token_api()
    permission_classes = [PermisoPorRol]
    roles_acciones = {
        "atender": (roles.ADMIN, roles.SUPERVISOR),
        "descartar": (roles.ADMIN, roles.SUPERVISOR),
    }

    def get_queryset(self):
        peticion = self.request
        consulta = Alerta.objects.filter(
            umbral__dispositivo__in=dispositivos_visibles(peticion.user)
        ).select_related("umbral__variable", "umbral__dispositivo")

        estado = peticion.query_params.get("estado")
        if estado:
            consulta = consulta.filter(estado=estado.upper())
        nivel = peticion.query_params.get("nivel")
        if nivel:
            consulta = consulta.filter(nivel=nivel.upper())
        variable = peticion.query_params.get("variable")
        if variable:
            consulta = consulta.filter(umbral__variable_id=variable.upper())
        dispositivo = parametro_entero(peticion, "dispositivo")
        if dispositivo is not None:
            consulta = consulta.filter(umbral__dispositivo_id=dispositivo)
        desde = parametro_fecha(peticion, "desde")
        if desde:
            consulta = consulta.filter(fecha_hora__gte=desde)
        hasta = parametro_fecha(peticion, "hasta")
        if hasta:
            consulta = consulta.filter(fecha_hora__lt=hasta)
        return consulta

    def _resolver(self, request, estado):
        alerta = self.get_object()
        if alerta.estado != Alerta.Estado.PENDIENTE:
            return Response(
                {"detail": f"La alerta ya está {alerta.get_estado_display().lower()}."},
                status=status.HTTP_409_CONFLICT,
            )
        entrada = AtencionSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        alerta.estado = estado
        alerta.atendida_por = request.user
        alerta.fecha_atencion = timezone.now()
        alerta.observaciones = entrada.validated_data.get("observaciones") or None
        alerta.save(update_fields=["estado", "atendida_por", "fecha_atencion", "observaciones"])
        eventos.alerta(
            alerta,
            eventos.ALERTA_ATENDIDA
            if estado == Alerta.Estado.ATENDIDA
            else eventos.ALERTA_DESCARTADA,
        )
        webhooks.notificar_alerta(
            alerta,
            webhooks.Webhook.Evento.ALERTA_ATENDIDA
            if estado == Alerta.Estado.ATENDIDA
            else webhooks.Webhook.Evento.ALERTA_DESCARTADA,
        )
        return Response(self.get_serializer(alerta).data)

    @action(detail=False, methods=["get"])
    def exportar(self, request):
        """CSV con las alertas del alcance y los mismos filtros de la lista."""
        consulta = self.get_queryset().select_related("atendida_por")
        encabezado = [
            "alerta",
            "fecha_hora",
            "dispositivo",
            "codigo",
            "variable",
            "valor",
            "nivel",
            "tipo",
            "estado",
            "atendida_por",
            "fecha_atencion",
            "observaciones",
        ]

        def filas():
            for a in consulta.iterator():
                yield [
                    a.pk,
                    a.fecha_hora.isoformat(),
                    a.umbral.dispositivo.nombre,
                    a.umbral.dispositivo.codigo_mqtt,
                    a.umbral.variable_id,
                    a.lectura_valor,
                    a.nivel,
                    a.tipo,
                    a.estado,
                    a.atendida_por.correo if a.atendida_por_id else "",
                    a.fecha_atencion.isoformat() if a.fecha_atencion else "",
                    a.observaciones or "",
                ]

        return respuesta_csv(request, "alertas", encabezado, filas())

    @action(detail=True, methods=["post"])
    def atender(self, request, pk=None):
        return self._resolver(request, Alerta.Estado.ATENDIDA)

    @action(detail=True, methods=["post"])
    def descartar(self, request, pk=None):
        return self._resolver(request, Alerta.Estado.DESCARTADA)


class NotificacionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Notificaciones de alerta del propio usuario (bandeja de la app móvil)."""

    serializer_class = NotificacionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notificacion.objects.filter(usuario=self.request.user)
