from datetime import time, timedelta

from django.db.models import Q
from rest_framework import serializers

from apps.organizaciones import logos
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
    organizacion_nombre = serializers.SerializerMethodField()
    organizacion_logo_url = serializers.SerializerMethodField()
    organizacion_color = serializers.SerializerMethodField()

    class Meta:
        model = Reporte
        fields = [
            "num",
            "organizacion",
            "organizacion_nombre",
            "organizacion_logo_url",
            "organizacion_color",
            "area",
            "areas",
            "generado_por",
            "origen",
            "estado",
            "error",
            "archivado",
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

    def get_organizacion_nombre(self, reporte):
        return reporte.organizacion.nombre if reporte.organizacion_id else ""

    def get_organizacion_logo_url(self, reporte):
        return logos.url_logo(reporte.organizacion) if reporte.organizacion_id else None

    def get_organizacion_color(self, reporte):
        return reporte.organizacion.color_reporte if reporte.organizacion_id else None

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
    areas = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )
    formato = serializers.IntegerField(required=False, allow_null=True)
    periodo_inicio = serializers.DateTimeField()
    periodo_fin = serializers.DateTimeField()

    def validate(self, datos):
        if datos["periodo_inicio"] >= datos["periodo_fin"]:
            raise serializers.ValidationError(
                {"periodo_inicio": "Debe ser anterior al fin del periodo."}
            )
        if datos["periodo_fin"] - datos["periodo_inicio"] > timedelta(days=31):
            raise serializers.ValidationError(
                {"periodo_fin": "El periodo no puede durar más de 31 días."}
            )
        if datos.get("area") is not None and datos.get("areas"):
            raise serializers.ValidationError({"areas": "Elige un área o varias, no ambas."})
        datos["areas"] = sorted(set(datos.get("areas") or []))
        return datos


class SolicitudRepetirSerializer(serializers.Serializer):
    periodo_inicio = serializers.DateTimeField()
    periodo_fin = serializers.DateTimeField()

    def validate(self, datos):
        if datos["periodo_inicio"] >= datos["periodo_fin"]:
            raise serializers.ValidationError(
                {"periodo_inicio": "Debe ser anterior al fin del periodo."}
            )
        if datos["periodo_fin"] - datos["periodo_inicio"] > timedelta(days=31):
            raise serializers.ValidationError(
                {"periodo_fin": "El periodo no puede durar más de 31 días."}
            )
        return datos


class SolicitudVistaPreviaSerializer(serializers.Serializer):
    """Cifras de la vista previa del asistente; no genera ni guarda un reporte."""

    areas = serializers.CharField(required=False, allow_blank=True, default="")
    desde = serializers.DateTimeField()
    hasta = serializers.DateTimeField()

    def validate_areas(self, valor):
        if not valor.strip():
            return []
        try:
            numeros = {int(part.strip()) for part in valor.split(",") if part.strip()}
        except ValueError as error:
            raise serializers.ValidationError(
                "Las áreas deben ser números separados por comas."
            ) from error
        return sorted(numeros)

    def validate(self, datos):
        if datos["desde"] >= datos["hasta"]:
            raise serializers.ValidationError({"desde": "Debe ser anterior al fin del periodo."})
        if datos["hasta"] - datos["desde"] > timedelta(days=31):
            raise serializers.ValidationError(
                {"hasta": "El periodo no puede durar más de 31 días."}
            )
        return datos


class ProgramacionReporteSerializer(serializers.ModelSerializer):
    """Programación periódica; sin ``proxima_ejecucion`` se calcula con hora y día."""

    destinatarios = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    areas = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )
    proxima_ejecucion = serializers.DateTimeField(required=False)
    formato_nombre = serializers.SerializerMethodField()

    class Meta:
        model = ProgramacionReporte
        fields = [
            "num",
            "organizacion",
            "area",
            "areas",
            "creada_por",
            "formato",
            "formato_nombre",
            "frecuencia",
            "hora",
            "dia_semana",
            "dia_mes",
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
            "formato_nombre",
            "ultima_ejecucion",
            "fecha_creacion",
        ]
        extra_kwargs = {"activa": {"required": False}}

    def get_formato_nombre(self, programacion):
        return programacion.formato.nombre if programacion.formato_id else ""

    def validate_area(self, area):
        actor = self.context["request"].user
        if area is not None and not areas_visibles(actor).filter(pk=area.pk).exists():
            raise serializers.ValidationError("El área no existe o no está a su alcance.")
        return area

    def validate_formato(self, formato):
        if formato is None:
            return None
        actor = self.context["request"].user
        visible = FormatoReporte.objects.filter(
            Q(organizacion_id=actor.organizacion_id) | Q(organizacion__isnull=True),
            activo=True,
            pk=formato.pk,
        ).exists()
        if not visible:
            raise serializers.ValidationError("El formato no existe o no está a su alcance.")
        return formato

    def validate_areas(self, numeros):
        if not numeros:
            return []
        actor = self.context["request"].user
        visibles = set(areas_visibles(actor).filter(pk__in=numeros).values_list("pk", flat=True))
        if visibles != set(numeros):
            raise serializers.ValidationError("Hay áreas que no existen o no están a su alcance.")
        return sorted(visibles)

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
        if datos.get("area") is not None and datos.get("areas"):
            raise serializers.ValidationError({"areas": "Elige un área o varias, no ambas."})
        if actor.rol_id != roles.ADMIN and actor.area_id:
            # Supervisor y analista con área solo programan reportes de su área.
            datos["area"] = areas_visibles(actor).filter(pk=actor.area_id).first()
            datos["areas"] = []
        areas = datos.get("areas") or []
        if len(areas) == 1:
            # Una sola área marcada en «varias áreas» es una programación de esa área.
            datos["area"] = areas_visibles(actor).filter(pk=areas[0]).first()
            datos["areas"] = []

        frecuencia = datos.get("frecuencia", getattr(self.instance, "frecuencia", None))
        hora = datos.get("hora", getattr(self.instance, "hora", time(8, 0)))
        dia_semana = datos.get("dia_semana", getattr(self.instance, "dia_semana", None))
        dia_mes = datos.get("dia_mes", getattr(self.instance, "dia_mes", None))

        if hora.minute not in (0, 30):
            raise serializers.ValidationError({"hora": "La hora debe ser en punto o y media."})
        if dia_semana is not None and not 0 <= dia_semana <= 6:
            raise serializers.ValidationError({"dia_semana": "El día debe estar entre 0 y 6."})
        if dia_mes is not None and not 1 <= dia_mes <= 28:
            raise serializers.ValidationError({"dia_mes": "El día debe estar entre 1 y 28."})
        if frecuencia == ProgramacionReporte.Frecuencia.SEMANAL and dia_semana is None:
            raise serializers.ValidationError(
                {"dia_semana": "Elige el día de la semana de la programación."}
            )
        if frecuencia == ProgramacionReporte.Frecuencia.MENSUAL and dia_mes is None:
            raise serializers.ValidationError(
                {"dia_mes": "Elige el día del mes de la programación."}
            )

        cambia_horario = any(
            campo in datos for campo in ("frecuencia", "hora", "dia_semana", "dia_mes")
        )
        reanuda = bool(self.instance and datos.get("activa") is True and not self.instance.activa)
        if self.instance is None:
            if "proxima_ejecucion" not in datos:
                datos["proxima_ejecucion"] = servicios.siguiente_ejecucion(
                    frecuencia, hora, dia_semana, dia_mes
                )
        elif cambia_horario or reanuda:
            datos["proxima_ejecucion"] = servicios.siguiente_ejecucion(
                frecuencia, hora, dia_semana, dia_mes
            )
        return datos
