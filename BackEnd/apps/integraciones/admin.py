from django.contrib import admin

from apps.integraciones.models import TokenAPI, Webhook


@admin.register(TokenAPI)
class TokenAPIAdmin(admin.ModelAdmin):
    list_display = ("nombre", "prefijo", "organizacion", "activo", "ultimo_uso")
    list_filter = ("activo",)
    exclude = ("clave_hash",)
    readonly_fields = ("prefijo", "ultimo_uso")


@admin.register(Webhook)
class WebhookAdmin(admin.ModelAdmin):
    list_display = ("nombre", "url", "organizacion", "activo", "ultimo_estado")
    list_filter = ("activo",)
    exclude = ("secreto",)
