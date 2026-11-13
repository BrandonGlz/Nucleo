from django.contrib import admin

from .models import AjusteHerramienta, DocumentoNico


@admin.register(DocumentoNico)
class DocumentoNicoAdmin(admin.ModelAdmin):
    list_display = ("clave", "activo", "orden", "actualizado")


@admin.register(AjusteHerramienta)
class AjusteHerramientaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "activa", "actualizado")
