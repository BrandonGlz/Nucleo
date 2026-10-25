from django.contrib import admin

from .models import Dispositivo, Sensor


class SensorInline(admin.TabularInline):
    model = Sensor
    extra = 0


@admin.register(Dispositivo)
class DispositivoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "codigo_mqtt", "area", "estado_dispositivo", "ultima_conexion")
    list_filter = ("estado_dispositivo", "area__organizacion")
    search_fields = ("nombre", "codigo_mqtt")
    readonly_fields = ("fecha_alta",)
    inlines = [SensorInline]


@admin.register(Sensor)
class SensorAdmin(admin.ModelAdmin):
    list_display = ("modelo", "dispositivo", "estado_sensor", "fecha_calibracion")
    list_filter = ("estado_sensor", "modelo")
