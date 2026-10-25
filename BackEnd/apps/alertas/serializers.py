from rest_framework import serializers

from apps.alertas.models import Alerta, Notificacion


class AlertaSerializer(serializers.ModelSerializer):
    dispositivo = serializers.IntegerField(source="umbral.dispositivo_id", read_only=True)
    dispositivo_nombre = serializers.CharField(source="umbral.dispositivo.nombre", read_only=True)
    variable = serializers.CharField(source="umbral.variable_id", read_only=True)
    unidad = serializers.CharField(source="umbral.variable.unidad", read_only=True)
    peligro_min = serializers.DecimalField(
        source="umbral.peligro_min", max_digits=8, decimal_places=2, read_only=True
    )
    advertencia_min = serializers.DecimalField(
        source="umbral.advertencia_min", max_digits=8, decimal_places=2, read_only=True
    )
    advertencia_max = serializers.DecimalField(
        source="umbral.advertencia_max", max_digits=8, decimal_places=2, read_only=True
    )
    peligro_max = serializers.DecimalField(
        source="umbral.peligro_max", max_digits=8, decimal_places=2, read_only=True
    )

    class Meta:
        model = Alerta
        fields = [
            "num",
            "umbral",
            "dispositivo",
            "dispositivo_nombre",
            "variable",
            "unidad",
            "lectura_num",
            "lectura_valor",
            "lectura_fecha_hora",
            "peligro_min",
            "advertencia_min",
            "advertencia_max",
            "peligro_max",
            "nivel",
            "tipo",
            "estado",
            "fecha_hora",
            "atendida_por",
            "fecha_atencion",
            "observaciones",
        ]
        read_only_fields = fields


class AtencionSerializer(serializers.Serializer):
    observaciones = serializers.CharField(required=False, allow_blank=True)


class NotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notificacion
        fields = ["num", "alerta", "canal", "estado_envio", "fecha_envio"]
        read_only_fields = fields
