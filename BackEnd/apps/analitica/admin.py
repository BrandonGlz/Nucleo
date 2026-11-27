from django.contrib import admin

from .models import TableroAnalitica, VersionTablero


@admin.register(TableroAnalitica)
class TableroAnaliticaAdmin(admin.ModelAdmin):
    list_display = ("num", "nombre", "organizacion", "plantilla", "predeterminado", "activo")
    list_filter = ("plantilla", "predeterminado", "activo", "organizacion")
    search_fields = ("nombre",)
    readonly_fields = ("fecha_creacion",)


@admin.register(VersionTablero)
class VersionTableroAdmin(admin.ModelAdmin):
    list_display = ("num", "tablero", "numero", "creada_por", "fecha")
    list_filter = ("tablero__organizacion",)
    readonly_fields = ("conf", "fecha")
