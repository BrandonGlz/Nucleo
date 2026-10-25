from datetime import timedelta

from django.db.models import Avg, Count, Max, Min
from django.db.models.functions import TruncDay, TruncHour, TruncMinute
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.mediciones import consultas
from apps.mediciones.serializers import LecturaSerializer, PuntoSerieSerializer
from common.filtros import parametro_entero, parametro_fecha
from common.permissions import PermisoPorRol

TRUNCADORES = {"minuto": TruncMinute, "hora": TruncHour, "dia": TruncDay}


class LecturaViewSet(viewsets.ReadOnlyModelViewSet):
    """Histórico de lecturas de los dispositivos a su alcance, desde TimescaleDB.

    Filtros: ``dispositivo``, ``sensor``, ``variable``, ``estabilizada``, ``desde`` y
    ``hasta``. ``serie/`` devuelve promedios, mínimos y máximos por intervalo para las
    gráficas de tendencia.
    """

    serializer_class = LecturaSerializer
    permission_classes = [PermisoPorRol]

    def _sensores(self):
        """Sensores del alcance del usuario, acotados por ``dispositivo`` si viene."""
        if not hasattr(self, "_sensores_cache"):
            self._sensores_cache = consultas.sensores_del_alcance(
                self.request.user, parametro_entero(self.request, "dispositivo")
            )
        return self._sensores_cache

    def get_serializer_context(self):
        contexto = super().get_serializer_context()
        contexto["sensores"] = self._sensores()
        contexto["unidades"] = consultas.unidades()
        return contexto

    def get_queryset(self):
        peticion = self.request
        consulta = consultas.lecturas_de(self._sensores())
        sensor = parametro_entero(peticion, "sensor")
        if sensor is not None:
            consulta = consulta.filter(sensor_num=sensor)
        variable = peticion.query_params.get("variable")
        if variable:
            consulta = consulta.filter(variable_codigo=variable.upper())
        estabilizada = peticion.query_params.get("estabilizada")
        if estabilizada:
            consulta = consulta.filter(estabilizada=estabilizada.lower() in ("1", "true", "si"))
        desde = parametro_fecha(peticion, "desde")
        if desde:
            consulta = consulta.filter(fecha_hora__gte=desde)
        hasta = parametro_fecha(peticion, "hasta")
        if hasta:
            consulta = consulta.filter(fecha_hora__lt=hasta)
        return consulta

    @action(detail=False, methods=["get"])
    def serie(self, request):
        """Serie de tendencia: ``dispositivo`` y ``variable`` son obligatorios.

        ``intervalo`` puede ser ``minuto``, ``hora`` (por defecto) o ``dia``. Sin ``desde``
        ni ``hasta`` se devuelven las últimas 24 horas. Solo cuenta lecturas estabilizadas.
        """
        if parametro_entero(request, "dispositivo") is None or not request.query_params.get(
            "variable"
        ):
            raise ValidationError({"detail": "dispositivo y variable son obligatorios."})
        intervalo = request.query_params.get("intervalo", "hora")
        if intervalo not in TRUNCADORES:
            raise ValidationError({"intervalo": "Use minuto, hora o dia."})

        consulta = self.get_queryset().filter(estabilizada=True)
        if not (request.query_params.get("desde") or request.query_params.get("hasta")):
            consulta = consulta.filter(fecha_hora__gte=timezone.now() - timedelta(hours=24))

        puntos = (
            consulta.annotate(periodo=TRUNCADORES[intervalo]("fecha_hora"))
            .values("periodo")
            .annotate(
                promedio=Avg("valor"),
                minimo=Min("valor"),
                maximo=Max("valor"),
                muestras=Count("num"),
            )
            .order_by("periodo")
        )
        return Response(PuntoSerieSerializer(puntos, many=True).data)
