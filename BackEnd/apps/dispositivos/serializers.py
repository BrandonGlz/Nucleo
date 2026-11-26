from rest_framework import serializers

from apps.dispositivos import firmware
from apps.dispositivos.models import Dispositivo, Sensor
from common import roles
from common.scoping import areas_visibles, dispositivos_visibles
from common.serializers import ValoresPorDefectoDeBaseMixin


class SensorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sensor
        fields = [
            "num",
            "dispositivo",
            "estado_sensor",
            "modelo",
            "funcion",
            "fecha_acondicionamiento",
            "fecha_calibracion",
        ]
        read_only_fields = ["num"]

    def validate_dispositivo(self, dispositivo):
        usuario = self.context["request"].user
        if not dispositivos_visibles(usuario).filter(pk=dispositivo.pk).exists():
            raise serializers.ValidationError("El dispositivo no existe o no está a su alcance.")
        if self.instance and self.instance.dispositivo_id != dispositivo.pk:
            raise serializers.ValidationError("Un sensor no puede cambiar de dispositivo.")
        return dispositivo


class DispositivoSerializer(ValoresPorDefectoDeBaseMixin, serializers.ModelSerializer):
    sensores = SensorSerializer(many=True, read_only=True)
    # Versión de firmware publicada para la actualización remota (null si no hay ninguna): con
    # version_firmware el cliente sabe si el equipo está al día.
    version_firmware_publicada = serializers.SerializerMethodField()
    # El ESP mide con otro intervalo que el configurado: su configuración aún no le llega.
    configuracion_pendiente = serializers.SerializerMethodField()

    class Meta:
        model = Dispositivo
        fields = [
            "num",
            "area",
            "estado_dispositivo",
            "operador",
            "registrado_por",
            "nombre",
            "codigo_mqtt",
            "intervalo_muestreo_seg",
            "nivel_bateria",
            "voltaje_bateria",
            "intervalo_reportado_seg",
            "configuracion_pendiente",
            "ultima_conexion",
            "ultimo_arranque",
            "fecha_alta",
            "version_firmware",
            "version_reportada_en",
            "version_firmware_publicada",
            "sensores",
        ]
        read_only_fields = [
            "num",
            "registrado_por",
            "nivel_bateria",
            "voltaje_bateria",
            "intervalo_reportado_seg",
            "ultima_conexion",
            "ultimo_arranque",
            "fecha_alta",
            "version_firmware",
            "version_reportada_en",
        ]

    def get_configuracion_pendiente(self, dispositivo):
        reportado = dispositivo.intervalo_reportado_seg
        return reportado is not None and reportado != dispositivo.intervalo_muestreo_seg

    def get_version_firmware_publicada(self, dispositivo):
        # Se lee una vez por respuesta (es un archivo), no una por dispositivo de la lista.
        cache = self.root.__dict__.setdefault("_version_publicada", [])
        if not cache:
            cache.append(firmware.version_actual())
        return cache[0]

    def validate_area(self, area):
        if not areas_visibles(self.context["request"].user).filter(pk=area.pk).exists():
            raise serializers.ValidationError("El área no existe o no está a su alcance.")
        return area

    def validate_intervalo_muestreo_seg(self, valor):
        if not 5 <= valor <= 120:
            raise serializers.ValidationError("El intervalo debe estar entre 5 y 120 segundos.")
        return valor

    def validate(self, datos):
        actor = self.context["request"].user
        if actor.rol_id == roles.SUPERVISOR:
            # El supervisor solo ajusta el intervalo de muestreo.
            prohibidos = set(datos) - {"intervalo_muestreo_seg"}
            if self.instance is None or prohibidos:
                raise serializers.ValidationError(
                    "Un supervisor solo puede modificar el intervalo de muestreo."
                )
        operador = datos.get("operador")
        area = datos.get("area") or (self.instance.area if self.instance else None)
        if operador is not None:
            if operador.rol_id != roles.OPERADOR:
                raise serializers.ValidationError({"operador": "El usuario no es un operador."})
            if operador.organizacion_id != actor.organizacion_id or (
                area and operador.area_id != area.pk
            ):
                raise serializers.ValidationError({"operador": "El operador no pertenece al área."})
        return datos
