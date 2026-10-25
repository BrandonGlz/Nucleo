from django.contrib import admin

from .models import Area, Organizacion


@admin.register(Organizacion)
class OrganizacionAdmin(admin.ModelAdmin):
    list_display = ("nombre", "ciudad", "estado", "fecha_registro")
    list_filter = ("estado",)
    search_fields = ("nombre",)


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "organizacion")
    list_filter = ("organizacion",)
    search_fields = ("nombre",)
