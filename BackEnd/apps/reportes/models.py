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


class RespuestaAprendida(models.Model):
    """Respuesta de la IA que un usuario calificó con 👍, guardada como plantilla.

    Las cifras de ``plantilla`` son espacios (``{actual}``, ``{promedio}``…) que se rellenan con
    las lecturas del momento, así que la siguiente vez que alguien de la organización hace la
    misma pregunta se responde al instante y sin IA. Un 👎 sobre ella la desactiva.
    """

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.CASCADE,
        db_column="organizacion_num",
        related_name="respuestas_aprendidas",
    )
    pregunta = models.CharField(max_length=500)
    pregunta_normalizada = models.CharField(max_length=500)
    tema = models.CharField(max_length=12, blank=True)
    plantilla = models.TextField()
    votos_si = models.PositiveIntegerField(default=1)
    votos_no = models.PositiveIntegerField(default=0)
    activa = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "respuesta_aprendida"
        verbose_name = "respuesta aprendida"
        verbose_name_plural = "respuestas aprendidas"
        constraints = [
            models.UniqueConstraint(
                fields=["organizacion", "pregunta_normalizada", "tema"],
                name="uq_respuesta_aprendida",
            )
        ]

    def __str__(self):
        return self.pregunta


class PreguntaAgente(models.Model):
    """Registro de cada pregunta a Nico AI: cómo se resolvió y la reacción del usuario."""

    class Via(models.TextChoices):
        PREDEFINIDA = "PREDEFINIDA", "Respuesta predefinida"
        BANCO = "BANCO", "Respuesta aprendida"
        IA = "IA", "Redactada por la IA"
        NO_ENTENDIDA = "NO_ENTENDIDA", "No entendida"

    num = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.CASCADE,
        db_column="usuario_num",
        related_name="preguntas_agente",
    )
    dispositivo = models.ForeignKey(
        "dispositivos.Dispositivo",
        on_delete=models.CASCADE,
        db_column="dispositivo_num",
        related_name="preguntas_agente",
    )
    pregunta = models.CharField(max_length=1000)
    pregunta_normalizada = models.CharField(max_length=1000)
    tema = models.CharField(max_length=12, blank=True)
    via = models.CharField(max_length=12, choices=Via.choices)
    respuesta = models.TextField()
    # Cifras con que se armó la respuesta: sirven para convertirla en plantilla.
    datos = models.JSONField(default=dict, blank=True)
    aprendida = models.ForeignKey(
        RespuestaAprendida,
        on_delete=models.SET_NULL,
        db_column="aprendida_num",
        related_name="usos",
        null=True,
        blank=True,
    )
    calificacion = models.SmallIntegerField(null=True, blank=True)  # 1 = 👍, -1 = 👎
    milisegundos = models.PositiveIntegerField(default=0)
    fecha = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "pregunta_agente"
        ordering = ["-fecha"]
        verbose_name = "pregunta a Nico AI"
        verbose_name_plural = "preguntas a Nico AI"
        indexes = [models.Index(fields=["via", "fecha"], name="ix_pregunta_agente_via")]

    def __str__(self):
        return self.pregunta
