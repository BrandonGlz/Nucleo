import re

from rest_framework import serializers

from apps.organizaciones import logos
from common import roles
from common.serializers import ValoresPorDefectoDeBaseMixin

from .models import Area, Organizacion

_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _luminancia(color):
    """Luminancia relativa WCAG de un color #RRGGBB."""
    canales = [int(color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lineales = [
        canal / 12.92 if canal <= 0.04045 else ((canal + 0.055) / 1.055) ** 2.4 for canal in canales
    ]
    return 0.2126 * lineales[0] + 0.7152 * lineales[1] + 0.0722 * lineales[2]


def contraste_con_blanco(color):
    """Contraste WCAG de un color #RRGGBB contra blanco (1 a 21)."""
    return 1.05 / (_luminancia(color) + 0.05)


def validar_color_reporte(valor):
    """Devuelve el color normalizado o lanza ``ValidationError``."""
    if valor in (None, ""):
        return None
    if not isinstance(valor, str) or not _HEX.match(valor):
        raise serializers.ValidationError("Usa un color en formato #RRGGBB.")
    color = valor.upper()
    if contraste_con_blanco(color) < 3:
        raise serializers.ValidationError(
            "El color no tiene contraste suficiente con el blanco: el texto no se leería."
        )
    return color


class OrganizacionSerializer(ValoresPorDefectoDeBaseMixin, serializers.ModelSerializer):
    """El estado (activa, suspendida o baja) solo lo cambia el administrador de plataforma."""

    logo_url = serializers.SerializerMethodField()
    color_reporte = serializers.CharField(
        allow_null=True, allow_blank=True, required=False, max_length=7
    )

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
            "logo_url",
            "color_reporte",
        ]
        read_only_fields = ["num", "fecha_registro", "logo_url"]

    def get_logo_url(self, organizacion):
        return logos.url_logo(organizacion)

    def validate_color_reporte(self, valor):
        return validar_color_reporte(valor)

    def validate(self, datos):
        actor = self.context["request"].user
        if "estado" in datos and actor.rol_id != roles.ADMIN_PLATAFORMA:
            raise serializers.ValidationError(
                {"estado": "Solo el administrador de plataforma cambia el estado."}
            )
        if "color_reporte" in datos and actor.rol_id != roles.ADMIN:
            raise serializers.ValidationError(
                {"color_reporte": "Solo el administrador cambia el color de los reportes."}
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
