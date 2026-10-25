from django.utils import timezone
from rest_framework import serializers

from apps.reportes import servicios
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.usuarios.models import Usuario
from common import roles
from common.scoping import areas_visibles


class ReporteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reporte
        fields = [
            "num",
            "organizacion",
            "area",
            "generado_por",
            "origen",
            "periodo_inicio",
            "periodo_fin",
            "cifras",
            "contenido",
            "archivo_pdf",
            "fecha_generacion",
        ]
        read_only_fields = fields


class SolicitudReporteSerializer(serializers.Serializer):
    area = serializers.IntegerField(required=False, allow_null=True)
    periodo_inicio = serializers.DateTimeField()
    periodo_fin = serializers.DateTimeField()

    def validate(self, datos):
        if datos["periodo_inicio"] >= datos["periodo_fin"]:
            raise serializers.ValidationError(
                {"periodo_inicio": "Debe ser anterior al fin del periodo."}
            )
        return datos


class ProgramacionReporteSerializer(serializers.ModelSerializer):
    """Programación periódica; sin ``proxima_ejecucion`` se programa un periodo adelante."""

    destinatarios = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    proxima_ejecucion = serializers.DateTimeField(required=False)

    class Meta:
        model = ProgramacionReporte
        fields = [
            "num",
            "organizacion",
            "area",
            "creada_por",
            "frecuencia",
            "destinatarios",
            "activa",
            "proxima_ejecucion",
            "ultima_ejecucion",
            "fecha_creacion",
        ]
        read_only_fields = [
            "num",
            "organizacion",
            "creada_por",
            "ultima_ejecucion",
            "fecha_creacion",
        ]
        extra_kwargs = {"activa": {"required": False}}

    def validate_area(self, area):
        actor = self.context["request"].user
        if area is not None and not areas_visibles(actor).filter(pk=area.pk).exists():
            raise serializers.ValidationError("El área no existe o no está a su alcance.")
        return area

    def validate_destinatarios(self, numeros):
        organizacion = self.context["request"].user.organizacion_id
        validos = set(
            Usuario.objects.filter(pk__in=numeros, organizacion_id=organizacion).values_list(
                "pk", flat=True
            )
        )
        if validos != set(numeros):
            raise serializers.ValidationError(
                "Los destinatarios deben ser usuarios de su misma organización."
            )
        return sorted(validos)

    def validate(self, datos):
        actor = self.context["request"].user
        if actor.rol_id != roles.ADMIN and actor.area_id:
            # Supervisor y analista con área solo programan reportes de su área.
            datos["area"] = areas_visibles(actor).filter(pk=actor.area_id).first()
        if self.instance is None and "proxima_ejecucion" not in datos:
            datos["proxima_ejecucion"] = servicios.desplazar(timezone.now(), datos["frecuencia"], 1)
        return datos
