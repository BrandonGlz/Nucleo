from rest_framework import serializers

from common import roles
from common.serializers import ValoresPorDefectoDeBaseMixin

from .models import Area, Organizacion


class OrganizacionSerializer(ValoresPorDefectoDeBaseMixin, serializers.ModelSerializer):
    """El estado (activa, suspendida o baja) solo lo cambia el administrador de plataforma."""

    class Meta:
        model = Organizacion
        fields = [
            "num",
            "nombre",
            "dir_calle",
            "dir_numero",
            "dir_colonia",
            "ciudad",
            "telefono",
            "estado",
            "fecha_registro",
        ]
        read_only_fields = ["num", "fecha_registro"]

    def validate(self, datos):
        actor = self.context["request"].user
        if "estado" in datos and actor.rol_id != roles.ADMIN_PLATAFORMA:
            raise serializers.ValidationError(
                {"estado": "Solo el administrador de plataforma cambia el estado."}
            )
        return datos


class AreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Area
        fields = ["num", "organizacion", "nombre", "descripcion"]
        read_only_fields = ["num", "organizacion"]

    def validate(self, datos):
        organizacion = self.context["request"].user.organizacion_id
        nombre = datos.get("nombre", getattr(self.instance, "nombre", None))
        repetida = Area.objects.filter(organizacion_id=organizacion, nombre=nombre)
        if self.instance:
            repetida = repetida.exclude(pk=self.instance.pk)
        if repetida.exists():
            raise serializers.ValidationError({"nombre": "Ya existe un área con ese nombre."})
        return datos
