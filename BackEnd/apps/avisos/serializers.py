from rest_framework import serializers

from apps.avisos.models import Aviso


class AvisoSerializer(serializers.ModelSerializer):
    leido = serializers.SerializerMethodField()

    class Meta:
        model = Aviso
        fields = ["num", "tipo", "nivel", "titulo", "detalle", "ruta", "fecha_hora", "leido"]
        read_only_fields = fields

    def get_leido(self, aviso) -> bool:
        return aviso.leido_en is not None


class MarcarLeidosSerializer(serializers.Serializer):
    """Sin ``nums`` (o con la lista vacía) se marcan todos los avisos sin leer."""

    nums = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, allow_empty=True
    )
