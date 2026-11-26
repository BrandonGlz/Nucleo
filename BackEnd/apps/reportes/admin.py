from django.contrib import admin

from .models import (
    FormatoReporte,
    PreguntaAgente,
    ProgramacionReporte,
    Reporte,
    RespuestaAprendida,
    VersionFormato,
)


@admin.register(FormatoReporte)
class FormatoReporteAdmin(admin.ModelAdmin):
    list_display = ("num", "nombre", "organizacion", "plantilla", "predeterminado", "activo")
    list_filter = ("plantilla", "predeterminado", "activo", "organizacion")
    search_fields = ("nombre",)
    readonly_fields = ("fecha_creacion",)


@admin.register(VersionFormato)
class VersionFormatoAdmin(admin.ModelAdmin):
    list_display = ("num", "formato", "numero", "creada_por", "fecha")
    list_filter = ("formato__organizacion",)
    readonly_fields = ("conf", "fecha")


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


@admin.register(PreguntaAgente)
class PreguntaAgenteAdmin(admin.ModelAdmin):
    list_display = (
        "fecha",
        "pregunta",
        "via",
        "tema",
        "calificacion",
        "milisegundos",
        "dispositivo",
    )
    list_filter = ("via", "tema", "calificacion")
    search_fields = ("pregunta", "respuesta")
    readonly_fields = [f.name for f in PreguntaAgente._meta.fields]


@admin.register(RespuestaAprendida)
class RespuestaAprendidaAdmin(admin.ModelAdmin):
    list_display = ("pregunta", "tema", "votos_si", "votos_no", "activa", "organizacion")
    list_filter = ("activa", "tema")
    search_fields = ("pregunta", "plantilla")
