"""Serializers de los tableros de analítica."""

from rest_framework import serializers

from apps.analitica.models import TableroAnalitica, VersionTablero


class VersionTableroSerializer(serializers.ModelSerializer):
    creada_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = VersionTablero
        fields = ["numero", "fecha", "creada_por_nombre"]
        read_only_fields = fields

    def get_creada_por_nombre(self, version):
        return version.creada_por.get_full_name() if version.creada_por_id else ""


class TableroAnaliticaSerializer(serializers.ModelSerializer):
    """Tablero con los datos de su versión actual, para la web y la app."""

    es_plantilla = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    conf = serializers.SerializerMethodField()
    creado_por_nombre = serializers.SerializerMethodField()

    class Meta:
        model = TableroAnalitica
        fields = [
            "num",
            "nombre",
            "descripcion",
            "plantilla",
            "predeterminado",
            "activo",
            "es_plantilla",
            "version",
            "conf",
            "creado_por_nombre",
            "fecha_creacion",
        ]
        read_only_fields = fields

    def get_es_plantilla(self, tablero):
        return tablero.organizacion_id is None

    def get_version(self, tablero):
        actual = tablero.version_actual()
        return actual.numero if actual else None

    def get_conf(self, tablero):
        actual = tablero.version_actual()
        return actual.conf if actual else {}

    def get_creado_por_nombre(self, tablero):
        return tablero.creado_por.get_full_name() if tablero.creado_por_id else ""


class SolicitudCambioTableroSerializer(serializers.Serializer):
    nombre = serializers.CharField(max_length=80, required=False, allow_blank=True)
    descripcion = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    conf = serializers.JSONField(required=False)


class SolicitudTableroSerializer(SolicitudCambioTableroSerializer):
    desde = serializers.IntegerField(required=False, min_value=1)


class SolicitudRestaurarSerializer(serializers.Serializer):
    numero = serializers.IntegerField(min_value=1)
