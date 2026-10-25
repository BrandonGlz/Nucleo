from django.contrib import admin

from .models import EstadoDispositivo, EstadoSensor, EstadoUsuario, Rol, VariableAmbiental

for modelo in (Rol, EstadoUsuario, EstadoDispositivo, EstadoSensor):
    admin.site.register(modelo, list_display=("codigo", "nombre", "descripcion"))

admin.site.register(
    VariableAmbiental, list_display=("codigo", "nombre", "unidad", "rango_min", "rango_max")
)
