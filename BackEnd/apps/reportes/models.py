"""Reportes con inteligencia artificial."""

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Func, IntegerField, Q
from django.db.models.functions import Now


class Reporte(models.Model):
    """Reporte de un periodo.

    Las cifras se calculan en el backend a partir de las lecturas de TimescaleDB y se
    guardan en ``cifras``; la IA solo redacta ``contenido``.
    """

    class Origen(models.TextChoices):
        MANUAL = "MANUAL", "Manual"
        PROGRAMADO = "PROGRAMADO", "Programado"
        AGENTE = "AGENTE", "Agente de IA"

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="reportes",
    )
    area = models.ForeignKey(
        "organizaciones.Area",
        on_delete=models.PROTECT,
        db_column="area_num",
        related_name="reportes",
        null=True,
        blank=True,
    )
    generado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="generado_por",
        related_name="reportes",
        null=True,
        blank=True,
    )
    origen = models.CharField(max_length=12, choices=Origen.choices)
    periodo_inicio = models.DateTimeField()
    periodo_fin = models.DateTimeField()
    cifras = models.JSONField()
    contenido = models.TextField()
    archivo_pdf = models.CharField(max_length=255, null=True, blank=True)
    fecha_generacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "reporte"
        ordering = ["-fecha_generacion"]
        verbose_name = "reporte"
        verbose_name_plural = "reportes"
        constraints = [
            models.CheckConstraint(
                condition=Q(origen__in=["MANUAL", "PROGRAMADO", "AGENTE"]),
                name="ck_reporte_origen",
            ),
            models.CheckConstraint(
                condition=Q(periodo_inicio__lt=F("periodo_fin")),
                name="ck_reporte_periodo",
            ),
        ]

    def __str__(self):
        return f"Reporte {self.num} · {self.periodo_inicio:%Y-%m-%d} → {self.periodo_fin:%Y-%m-%d}"


class ProgramacionReporte(models.Model):
    """Reporte periódico que un administrador, supervisor o analista programa.

    Elige la frecuencia, el área (o toda la organización) y los destinatarios, que son
    usuarios de su misma organización. Una tarea cron revisa las programaciones activas y
    genera y envía los reportes vencidos.
    """

    class Frecuencia(models.TextChoices):
        DIARIA = "DIARIA", "Diaria"
        SEMANAL = "SEMANAL", "Semanal"
        MENSUAL = "MENSUAL", "Mensual"

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="programaciones_reporte",
    )
    area = models.ForeignKey(
        "organizaciones.Area",
        on_delete=models.PROTECT,
        db_column="area_num",
        related_name="programaciones_reporte",
        null=True,
        blank=True,
    )
    creada_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creada_por",
        related_name="programaciones_reporte",
    )
    frecuencia = models.CharField(max_length=10, choices=Frecuencia.choices)
    destinatarios = ArrayField(models.IntegerField())
    activa = models.BooleanField(db_default=True)
    proxima_ejecucion = models.DateTimeField()
    ultima_ejecucion = models.DateTimeField(null=True, blank=True)
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "programacion_reporte"
        ordering = ["proxima_ejecucion"]
        verbose_name = "programación de reporte"
        verbose_name_plural = "programaciones de reporte"
        indexes = [
            models.Index(fields=["activa", "proxima_ejecucion"], name="idx_programacion_activa"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(frecuencia__in=["DIARIA", "SEMANAL", "MENSUAL"]),
                name="ck_programacion_frecuencia",
            ),
            models.CheckConstraint(
                condition=models.lookups.GreaterThan(
                    Func(F("destinatarios"), function="cardinality", output_field=IntegerField()),
                    0,
                ),
                name="ck_programacion_destinatarios",
            ),
        ]

    def __str__(self):
        return f"Programación {self.num} · {self.get_frecuencia_display()}"
