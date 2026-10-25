from django.contrib import admin

from .models import Alerta, Notificacion


class NotificacionInline(admin.TabularInline):
    model = Notificacion
    extra = 0
    can_delete = False


@admin.register(Alerta)
class AlertaAdmin(admin.ModelAdmin):
    list_display = ("num", "umbral", "nivel", "tipo", "estado", "fecha_hora", "atendida_por")
    list_filter = ("estado", "nivel", "tipo")
    readonly_fields = ("fecha_hora",)
    inlines = [NotificacionInline]
