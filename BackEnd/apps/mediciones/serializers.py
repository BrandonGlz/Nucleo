from rest_framework import serializers

from apps.mediciones.models import Lectura


class LecturaSerializer(serializers.ModelSerializer):
    """Lectura con su dispositivo y su unidad.

    El contexto trae ``sensores`` (``{sensor_num: dispositivo_num}``) y ``unidades``
    (``{variable_codigo: unidad}``) porque esos datos viven en la otra base.
    """

    dispositivo = serializers.SerializerMethodField()
    unidad = serializers.SerializerMethodField()

    class Meta:
        model = Lectura
        fields = [
            "num",
            "dispositivo",
            "sensor_num",
            "variable_codigo",
            "unidad",
            "valor",
            "fecha_hora",
            "recibida_en",
            "estabilizada",
        ]
        read_only_fields = fields

    def get_dispositivo(self, lectura):
        return self.context["sensores"].get(lectura.sensor_num)

    def get_unidad(self, lectura):
        return self.context["unidades"].get(lectura.variable_codigo)


class PuntoSerieSerializer(serializers.Serializer):
    periodo = serializers.DateTimeField()
    promedio = serializers.DecimalField(max_digits=10, decimal_places=2)
    minimo = serializers.DecimalField(max_digits=8, decimal_places=2)
    maximo = serializers.DecimalField(max_digits=8, decimal_places=2)
    muestras = serializers.IntegerField()


class UltimaLecturaSerializer(serializers.ModelSerializer):
    """Última lectura de una variable; el contexto trae ``sensores`` ``{sensor_num: modelo}``."""

    variable = serializers.CharField(source="variable_codigo")
    unidad = serializers.SerializerMethodField()
    sensor_modelo = serializers.SerializerMethodField()

    class Meta:
        model = Lectura
        fields = ["variable", "unidad", "valor", "fecha_hora", "recibida_en", "sensor_modelo"]
        read_only_fields = fields

    def get_unidad(self, lectura):
        return self.context["unidades"].get(lectura.variable_codigo)

    def get_sensor_modelo(self, lectura):
        return self.context["sensores"].get(lectura.sensor_num)
