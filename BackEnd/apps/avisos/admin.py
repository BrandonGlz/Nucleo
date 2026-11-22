from django.contrib import admin

from .models import Aviso


@admin.register(Aviso)
class AvisoAdmin(admin.ModelAdmin):
    list_display = ("num", "usuario", "tipo", "nivel", "titulo", "fecha_hora", "leido_en")
    list_filter = ("tipo", "nivel")
    search_fields = ("titulo", "detalle", "usuario__correo")
    readonly_fields = ("fecha_hora",)
    raw_id_fields = ("usuario",)
