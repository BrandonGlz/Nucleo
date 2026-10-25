from rest_framework import serializers

from .models import EstadoDispositivo, EstadoSensor, EstadoUsuario, Rol, VariableAmbiental


class CatalogoSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ["codigo", "nombre", "descripcion"]


def _catalogo(modelo):
    meta = type("Meta", (CatalogoSerializer.Meta,), {"model": modelo})
    return type(f"{modelo.__name__}Serializer", (CatalogoSerializer,), {"Meta": meta})


RolSerializer = _catalogo(Rol)
EstadoUsuarioSerializer = _catalogo(EstadoUsuario)
EstadoDispositivoSerializer = _catalogo(EstadoDispositivo)
EstadoSensorSerializer = _catalogo(EstadoSensor)


class VariableAmbientalSerializer(serializers.ModelSerializer):
    class Meta:
        model = VariableAmbiental
        fields = ["codigo", "nombre", "unidad", "rango_min", "rango_max"]
