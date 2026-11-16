from django.contrib import admin

from apps.auditoria.models import RegistroAuditoria


@admin.register(RegistroAuditoria)
class RegistroAuditoriaAdmin(admin.ModelAdmin):
    """Solo lectura: la bitácora no se edita ni se borra a mano."""

    list_display = ("fecha_hora", "usuario_correo", "accion", "recurso", "recurso_num", "ip")
    list_filter = ("accion", "recurso")
    search_fields = ("usuario_correo", "descripcion")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
