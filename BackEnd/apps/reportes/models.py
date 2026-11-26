"""Reportes con inteligencia artificial."""

from datetime import time

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Func, IntegerField, Q
from django.db.models.functions import Now


class FormatoReporte(models.Model):
    """Formato de reporte compartido por una organización o plantilla del sistema.

    Cada cambio de la configuración crea una ``VersionFormato`` nueva; los reportes guardan
    la versión con la que se generaron. Las plantillas del sistema no tienen organización y
    no se editan: se duplican.
    """

    class Plantilla(models.TextChoices):
        EJECUTIVO = "EJECUTIVO", "Ejecutivo"
        CUMPLIMIENTO = "CUMPLIMIENTO", "Cumplimiento"
        OPERATIVO = "OPERATIVO", "Operativo detallado"
        INCIDENTES = "INCIDENTES", "Incidentes"

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="formatos_reporte",
        null=True,
        blank=True,
    )
    nombre = models.CharField(max_length=80)
    plantilla = models.CharField(max_length=20, choices=Plantilla.choices, blank=True)
    predeterminado = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)
    creado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creado_por",
        related_name="formatos_creados",
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "formato_reporte"
        ordering = ["nombre"]
        verbose_name = "formato de reporte"
        verbose_name_plural = "formatos de reporte"
        constraints = [
            models.CheckConstraint(
                condition=(
                    (Q(plantilla="") & Q(organizacion__isnull=False))
                    | (~Q(plantilla="") & Q(organizacion__isnull=True))
                ),
                name="ck_formato_plantilla_sin_org",
            ),
            models.UniqueConstraint(
                fields=["organizacion"],
                condition=Q(predeterminado=True, activo=True),
                name="uq_formato_predeterminado",
            ),
            models.UniqueConstraint(
                fields=["organizacion", "nombre"],
                condition=Q(activo=True),
                name="uq_formato_nombre",
            ),
        ]

    def version_actual(self):
        """La última versión guardada del formato."""
        return self.versiones.order_by("-numero").first()

    def __str__(self):
        return f"{self.nombre} ({self.organizacion or 'plantilla'})"


class VersionFormato(models.Model):
    """Configuración de un formato en un momento dado.

    Los reportes apuntan a la versión con la que se generaron, así un cambio posterior no
    altera los reportes ya emitidos.
    """

    num = models.AutoField(primary_key=True)
    formato = models.ForeignKey(
        FormatoReporte,
        on_delete=models.PROTECT,
        db_column="formato_num",
        related_name="versiones",
    )
    numero = models.PositiveIntegerField()
    conf = models.JSONField()
    creada_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creada_por",
        related_name="versiones_formato_creadas",
        null=True,
        blank=True,
    )
    fecha = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "version_formato"
        ordering = ["formato", "numero"]
        verbose_name = "versión de formato"
        verbose_name_plural = "versiones de formato"
        constraints = [
            models.UniqueConstraint(
                fields=["formato", "numero"],
                name="uq_version_formato_numero",
            ),
        ]

    def __str__(self):
        return f"{self.formato.nombre} · versión {self.numero}"


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
    # Varias áreas: area queda nula y aquí van sus nums. Vacío = toda la organización.
    areas = ArrayField(models.IntegerField(), default=list, blank=True)
    generado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="generado_por",
        related_name="reportes",
        null=True,
        blank=True,
    )
    formato_version = models.ForeignKey(
        VersionFormato,
        on_delete=models.PROTECT,
        db_column="formato_version_num",
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
    # Varias áreas: area queda nula y aquí van sus nums. Vacío = toda la organización.
    areas = ArrayField(models.IntegerField(), default=list, blank=True)
    creada_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creada_por",
        related_name="programaciones_reporte",
    )
    formato = models.ForeignKey(
        "reportes.FormatoReporte",
        on_delete=models.PROTECT,
        db_column="formato_num",
        related_name="programaciones_reporte",
        null=True,
        blank=True,
    )
    frecuencia = models.CharField(max_length=10, choices=Frecuencia.choices)
    hora = models.TimeField(default=time(8, 0))
    # 0 = lunes … 6 = domingo. Solo se usa en la frecuencia semanal.
    dia_semana = models.SmallIntegerField(null=True, blank=True)
    # 1–28 para que exista en todos los meses. Solo se usa en la frecuencia mensual.
    dia_mes = models.SmallIntegerField(null=True, blank=True)
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
            models.CheckConstraint(
                condition=Q(hora__minute__in=(0, 30)),
                name="ck_programacion_hora",
            ),
            models.CheckConstraint(
                condition=Q(dia_semana__isnull=True)
                | Q(dia_semana__gte=0, dia_semana__lte=6),
                name="ck_programacion_dia_semana",
            ),
            models.CheckConstraint(
                condition=Q(dia_mes__isnull=True) | Q(dia_mes__gte=1, dia_mes__lte=28),
                name="ck_programacion_dia_mes",
            ),
            models.CheckConstraint(
                condition=~Q(frecuencia="SEMANAL") | Q(dia_semana__isnull=False),
                name="ck_programacion_semanal_dia",
            ),
            models.CheckConstraint(
                condition=~Q(frecuencia="MENSUAL") | Q(dia_mes__isnull=False),
                name="ck_programacion_mensual_dia",
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
        ENRUTADA = "ENRUTADA", "Interpretada por la IA"
        REPETIDA = "REPETIDA", "Petición repetida"
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
    # Respuesta que el superusuario enseñó en la consola de Nico AI para esta pregunta (o una
    # igual de la misma organización). Es aparte de ``aprendida``: esa cuenta los usos y los
    # votos del banco, y un 👎 sobre ella la desactiva. Si la respuesta se borra, la pregunta
    # vuelve a quedar por atender.
    ensenada = models.ForeignKey(
        RespuestaAprendida,
        on_delete=models.SET_NULL,
        db_column="ensenada_num",
        related_name="ensenanzas",
        null=True,
        blank=True,
    )
    fecha_ensenada = models.DateTimeField(null=True, blank=True)
    calificacion = models.SmallIntegerField(null=True, blank=True)  # 1 = 👍, -1 = 👎
    milisegundos = models.PositiveIntegerField(default=0)
    # Tokens de la IA local (Ollama) que usó la respuesta: entrada (prompt) y salida.
    tokens_entrada = models.PositiveIntegerField(default=0)
    tokens_salida = models.PositiveIntegerField(default=0)
    fecha = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "pregunta_agente"
        ordering = ["-fecha"]
        verbose_name = "pregunta a Nico AI"
        verbose_name_plural = "preguntas a Nico AI"
        indexes = [models.Index(fields=["via", "fecha"], name="ix_pregunta_agente_via")]

    def __str__(self):
        return self.pregunta
