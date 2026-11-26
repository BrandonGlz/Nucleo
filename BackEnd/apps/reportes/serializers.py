from django.utils import timezone
from rest_framework import serializers

from apps.reportes import formatos, servicios
from apps.reportes.models import FormatoReporte, ProgramacionReporte, Reporte, VersionFormato
from apps.usuarios.models import Usuario
from common import roles
from common.scoping import areas_visibles


class VersionFormatoSerializer(serializers.ModelSerializer):
    creada_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = VersionFormato
        fields = ["numero", "fecha", "creada_por_nombre"]
        read_only_fields = fields

    def get_creada_por_nombre(self, version):
        return version.creada_por.get_full_name() if version.creada_por_id else ""


class FormatoReporteSerializer(serializers.ModelSerializer):
    """Formato con los datos de su versión actual, para la web y el chat de Nico AI."""

    es_plantilla = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    conf = serializers.SerializerMethodField()
    creado_por_nombre = serializers.SerializerMethodField()
    areas_predeterminado = serializers.SerializerMethodField()

    class Meta:
        model = FormatoReporte
        fields = [
            "num",
            "nombre",
            "plantilla",
            "predeterminado",
            "activo",
            "es_plantilla",
            "version",
            "conf",
            "creado_por_nombre",
            "areas_predeterminado",
        ]
        read_only_fields = fields

    def get_es_plantilla(self, formato):
        return formato.organizacion_id is None

    def get_version(self, formato):
        actual = formato.version_actual()
        return actual.numero if actual else None

    def get_conf(self, formato):
        actual = formato.version_actual()
        return actual.conf if actual else {}

    def get_creado_por_nombre(self, formato):
        return formato.creado_por.get_full_name() if formato.creado_por_id else ""

    def get_areas_predeterminado(self, formato):
        return list(formato.areas_predeterminado.values_list("num", flat=True))


class SolicitudFormatoSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80)
    conf = serializers.JSONField()


class SolicitudAreasFormatoSerializer(serializers.Serializer):
    areas = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)


class SolicitudDuplicarFormatoSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80, required=False, allow_blank=True)


class CambioFormatoSerializer(serializers.Serializer):
    formato = serializers.IntegerField()


class ReporteSerializer(serializers.ModelSerializer):
    formato = serializers.SerializerMethodField()
    formato_nombre = serializers.SerializerMethodField()
    formato_version = serializers.SerializerMethodField()
    formato_conf = serializers.SerializerMethodField()

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
            "formato",
            "formato_nombre",
            "formato_version",
            "formato_conf",
        ]
        read_only_fields = fields

    def _resolver(self, reporte):
        """Formato y versión del reporte; los viejos usan la plantilla Operativo detallado."""
        if reporte.formato_version_id:
            version = reporte.formato_version
            return version.formato, version
        # Se busca una sola vez: en una lista, el mismo serializador pinta todos los reportes.
        if not hasattr(self, "_operativo"):
            formato = FormatoReporte.objects.filter(
                plantilla=FormatoReporte.Plantilla.OPERATIVO,
            ).first()
            self._operativo = (formato, formato.version_actual() if formato else None)
        return self._operativo

    def get_formato(self, reporte):
        formato, _ = self._resolver(reporte)
        return formato.num if formato else None

    def get_formato_nombre(self, reporte):
        formato, _ = self._resolver(reporte)
        return formato.nombre if formato else ""

    def get_formato_version(self, reporte):
        _, version = self._resolver(reporte)
        return version.numero if version else None

    def get_formato_conf(self, reporte):
        _, version = self._resolver(reporte)
        return version.conf if version else formatos.CONF_OPERATIVO


class SolicitudReporteSerializer(serializers.Serializer):
    area = serializers.IntegerField(required=False, allow_null=True)
    formato = serializers.IntegerField(required=False, allow_null=True)
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
