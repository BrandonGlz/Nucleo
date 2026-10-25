from rest_framework import serializers

from apps.umbrales.models import Umbral
from common.scoping import dispositivos_visibles
from common.serializers import ValoresPorDefectoDeBaseMixin

LIMITES = ("peligro_min", "advertencia_min", "advertencia_max", "peligro_max")


class UmbralSerializer(ValoresPorDefectoDeBaseMixin, serializers.ModelSerializer):
    class Meta:
        model = Umbral
        fields = [
            "num",
            "dispositivo",
            "variable",
            "configurado_por",
            *LIMITES,
            "activo",
            "fecha_actualizacion",
        ]
        read_only_fields = ["num", "configurado_por", "fecha_actualizacion"]

    def validate_dispositivo(self, dispositivo):
        usuario = self.context["request"].user
        if not dispositivos_visibles(usuario).filter(pk=dispositivo.pk).exists():
            raise serializers.ValidationError("El dispositivo no existe o no está a su alcance.")
        return dispositivo

    def validate(self, datos):
        if self.instance:
            for campo in ("dispositivo", "variable"):
                if campo in datos and datos[campo].pk != getattr(self.instance, f"{campo}_id"):
                    raise serializers.ValidationError(
                        {campo: "No se puede cambiar; cree otro umbral."}
                    )
        peligro_min, advertencia_min, advertencia_max, peligro_max = (
            datos.get(campo, getattr(self.instance, campo, None)) for campo in LIMITES
        )
        if None in (peligro_min, advertencia_min, advertencia_max, peligro_max):
            return datos
        if not peligro_min <= advertencia_min < advertencia_max <= peligro_max:
            raise serializers.ValidationError(
                {
                    "advertencia_min": (
                        "Los límites deben cumplir: peligro mínimo ≤ advertencia mínima < "
                        "advertencia máxima ≤ peligro máximo."
                    )
                }
            )
        return datos
