from django.contrib import admin

from .models import ProgramacionReporte, Reporte


@admin.register(Reporte)
class ReporteAdmin(admin.ModelAdmin):
    list_display = ("num", "organizacion", "area", "origen", "periodo_inicio", "periodo_fin")
    list_filter = ("origen", "organizacion")
    readonly_fields = ("fecha_generacion",)


@admin.register(ProgramacionReporte)
class ProgramacionReporteAdmin(admin.ModelAdmin):
    list_display = ("num", "organizacion", "area", "frecuencia", "activa", "proxima_ejecucion")
    list_filter = ("frecuencia", "activa", "organizacion")
    readonly_fields = ("fecha_creacion",)
