"""Lecturas de los sensores: serie de tiempo en TimescaleDB (``nucleo_iot``)."""

from django.db import models
from django.db.models.functions import Now


class Lectura(models.Model):
    """Medición recibida por MQTT.

    La tabla es una hypertable particionada por ``fecha_hora``; su llave primaria en la
    base es ``(num, fecha_hora)`` y la migración la crea así. ``sensor_num`` y
    ``variable_codigo`` son referencias lógicas a ``nucleo_db``: no hay llaves foráneas
    entre bases y el backend las valida antes de insertar.

    ``fecha_hora`` es cuando midió el dispositivo y ``recibida_en`` cuando llegó al
    servidor; la diferencia permite comprobar el límite de 2 minutos. ``estabilizada`` es
    ``False`` durante el calentamiento del CCS811: esas lecturas no generan alertas ni
    entran en los reportes.
    """

    num = models.BigAutoField(primary_key=True)
    fecha_hora = models.DateTimeField()
    sensor_num = models.IntegerField()
    variable_codigo = models.CharField(max_length=10)
    valor = models.DecimalField(max_digits=8, decimal_places=2)
    recibida_en = models.DateTimeField(db_default=Now(), editable=False)
    estabilizada = models.BooleanField(db_default=True)

    class Meta:
        db_table = "lectura"
        ordering = ["-fecha_hora"]
        verbose_name = "lectura"
        verbose_name_plural = "lecturas"
        indexes = [
            models.Index(
                fields=["sensor_num", "variable_codigo", "-fecha_hora"],
                name="idx_lectura_consulta",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(variable_codigo__in=["TEMP", "HUM", "AIRE"]),
                name="ck_lectura_variable",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(variable_codigo="TEMP", valor__gte=-40, valor__lte=80)
                    | models.Q(variable_codigo="HUM", valor__gte=0, valor__lte=100)
                    | models.Q(variable_codigo="AIRE", valor__gte=0, valor__lte=10000)
                ),
                name="ck_lectura_rango_fisico",
            ),
        ]

    def __str__(self):
        return f"{self.variable_codigo}={self.valor} @ {self.fecha_hora:%Y-%m-%d %H:%M:%S}"
