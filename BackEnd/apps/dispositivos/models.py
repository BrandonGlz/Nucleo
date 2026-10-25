"""Dispositivos IoT (ESP32) y los sensores que llevan montados."""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now

from common import roles


class Dispositivo(models.Model):
    """Dispositivo instalado en un área.

    Guarda su código MQTT (client id y tópico), su intervalo de muestreo y los estados que
    se derivan de sus lecturas: última conexión, batería y último arranque (inicio de los
    20 minutos de calentamiento del CCS811).
    """

    num = models.AutoField(primary_key=True)
    area = models.ForeignKey(
        "organizaciones.Area",
        on_delete=models.PROTECT,
        db_column="area_num",
        related_name="dispositivos",
        db_index=False,
    )
    estado_dispositivo = models.ForeignKey(
        "catalogos.EstadoDispositivo",
        on_delete=models.PROTECT,
        db_column="estado_dispositivo_codigo",
        related_name="dispositivos",
        default=roles.DISPOSITIVO_SIN_CONEXION,
    )
    operador = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="operador_num",
        related_name="dispositivos_asignados",
        null=True,
        blank=True,
    )
    registrado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="registrado_por",
        related_name="dispositivos_registrados",
    )
    nombre = models.CharField(max_length=60)
    codigo_mqtt = models.CharField(max_length=40, unique=True)
    intervalo_muestreo_seg = models.SmallIntegerField(db_default=30)
    nivel_bateria = models.SmallIntegerField(null=True, blank=True)
    ultima_conexion = models.DateTimeField(null=True, blank=True)
    ultimo_arranque = models.DateTimeField(null=True, blank=True)
    fecha_alta = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "dispositivo"
        ordering = ["area", "nombre"]
        verbose_name = "dispositivo"
        verbose_name_plural = "dispositivos"
        indexes = [models.Index(fields=["area"], name="idx_dispositivo_area")]
        constraints = [
            models.CheckConstraint(
                condition=Q(intervalo_muestreo_seg__gte=5, intervalo_muestreo_seg__lte=120),
                name="ck_dispositivo_intervalo",
            ),
            models.CheckConstraint(
                condition=Q(nivel_bateria__isnull=True)
                | Q(nivel_bateria__gte=0, nivel_bateria__lte=100),
                name="ck_dispositivo_bateria",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} [{self.codigo_mqtt}]"

    @property
    def organizacion_id(self):
        return self.area.organizacion_id


class Sensor(models.Model):
    """Sensor físico montado en un dispositivo (DHT22 y CCS811).

    Registra su estado, el fin del acondicionamiento de 48 horas del CCS811 antes de su
    primera puesta en servicio y su última calibración.
    """

    num = models.AutoField(primary_key=True)
    dispositivo = models.ForeignKey(
        Dispositivo,
        on_delete=models.PROTECT,
        db_column="dispositivo_num",
        related_name="sensores",
    )
    estado_sensor = models.ForeignKey(
        "catalogos.EstadoSensor",
        on_delete=models.PROTECT,
        db_column="estado_sensor_codigo",
        related_name="sensores",
        default=roles.SENSOR_OPERANDO,
    )
    modelo = models.CharField(max_length=30)
    funcion = models.CharField(max_length=100, null=True, blank=True)
    fecha_acondicionamiento = models.DateField(null=True, blank=True)
    fecha_calibracion = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "sensor"
        ordering = ["dispositivo", "modelo"]
        verbose_name = "sensor"
        verbose_name_plural = "sensores"
        constraints = [
            models.UniqueConstraint(
                fields=["dispositivo", "modelo"],
                name="uq_sensor_dispositivo_modelo",
            ),
        ]

    def __str__(self):
        return f"{self.modelo} · {self.dispositivo.codigo_mqtt}"
