from django.contrib import admin

from .models import Umbral


@admin.register(Umbral)
class UmbralAdmin(admin.ModelAdmin):
    list_display = (
        "dispositivo",
        "variable",
        "peligro_min",
        "advertencia_min",
        "advertencia_max",
        "peligro_max",
        "activo",
    )
    list_filter = ("variable", "activo")
    readonly_fields = ("fecha_actualizacion",)
