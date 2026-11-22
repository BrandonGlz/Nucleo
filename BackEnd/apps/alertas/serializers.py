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
    # Quién la atendió o descartó, para mostrarlo a quien no puede listar usuarios.
    atendida_por_nombre = serializers.SerializerMethodField()

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
            "atendida_por_nombre",
            "fecha_atencion",
            "observaciones",
        ]
        read_only_fields = fields

    def get_atendida_por_nombre(self, alerta):
        u = alerta.atendida_por
        return (u.get_full_name() or u.correo) if u else None


OBSERVACIONES_MIN = 5
OBSERVACIONES_MAX = 500


class AtencionSerializer(serializers.Serializer):
    """Nota obligatoria al atender (qué se hizo) o al descartar (por qué) una alerta.

    ``context["descartar"]`` elige el mensaje de error cuando falta la nota."""

    observaciones = serializers.CharField(
        min_length=OBSERVACIONES_MIN,
        max_length=OBSERVACIONES_MAX,
        trim_whitespace=True,
        error_messages={
            "min_length": f"Describe con al menos {OBSERVACIONES_MIN} caracteres.",
            "max_length": f"La nota no puede pasar de {OBSERVACIONES_MAX} caracteres.",
        },
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        falta = (
            "Escribe por qué se descarta la alerta."
            if self.context.get("descartar")
            else "Escribe qué se hizo para atender la alerta."
        )
        mensajes = self.fields["observaciones"].error_messages
        for clave in ("required", "blank", "null"):
            mensajes[clave] = falta


class NotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notificacion
        fields = ["num", "alerta", "canal", "estado_envio", "fecha_envio"]
        read_only_fields = fields
