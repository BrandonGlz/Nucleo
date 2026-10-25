"""Alertas generadas por lecturas fuera de umbral y sus notificaciones."""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class Alerta(models.Model):
    """Se crea cuando una lectura entra en Advertencia o Peligro.

    La lectura vive en TimescaleDB (``nucleo_iot``) y no puede enlazarse con una llave
    foránea: la alerta conserva su ``lectura_num``, su valor y su fecha y hora, de modo que
    se consulta completa sin depender de la otra base. Un índice único parcial impide otra
    alerta pendiente del mismo umbral y nivel.
    """

    class Nivel(models.TextChoices):
        ADVERTENCIA = "ADVERTENCIA", "Advertencia"
        PELIGRO = "PELIGRO", "Peligro"

    class Tipo(models.TextChoices):
        POR_ENCIMA = "POR_ENCIMA", "Por encima del límite"
        POR_DEBAJO = "POR_DEBAJO", "Por debajo del límite"

    class Estado(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        ATENDIDA = "ATENDIDA", "Atendida"
        DESCARTADA = "DESCARTADA", "Descartada"

    num = models.BigAutoField(primary_key=True)
    umbral = models.ForeignKey(
        "umbrales.Umbral",
        on_delete=models.PROTECT,
        db_column="umbral_num",
        related_name="alertas",
    )
    atendida_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="atendida_por",
        related_name="alertas_atendidas",
        null=True,
        blank=True,
    )
    lectura_num = models.BigIntegerField()
    lectura_fecha_hora = models.DateTimeField()
    lectura_valor = models.DecimalField(max_digits=8, decimal_places=2)
    nivel = models.CharField(max_length=12, choices=Nivel.choices)
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    estado = models.CharField(max_length=12, choices=Estado.choices, db_default=Estado.PENDIENTE)
    fecha_hora = models.DateTimeField(db_default=Now(), editable=False)
    fecha_atencion = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "alerta"
        ordering = ["-fecha_hora"]
        verbose_name = "alerta"
        verbose_name_plural = "alertas"
        indexes = [
            models.Index(fields=["estado", "-fecha_hora"], name="idx_alerta_estado"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(nivel__in=["ADVERTENCIA", "PELIGRO"]),
                name="ck_alerta_nivel",
            ),
            models.CheckConstraint(
                condition=Q(tipo__in=["POR_ENCIMA", "POR_DEBAJO"]),
                name="ck_alerta_tipo",
            ),
            models.CheckConstraint(
                condition=Q(estado__in=["PENDIENTE", "ATENDIDA", "DESCARTADA"]),
                name="ck_alerta_estado",
            ),
            models.UniqueConstraint(
                fields=["umbral", "nivel"],
                condition=Q(estado="PENDIENTE"),
                name="uq_alerta_pendiente",
            ),
        ]

    def __str__(self):
        return f"Alerta {self.num} · {self.nivel} · {self.tipo} · {self.estado}"


class Notificacion(models.Model):
    """Aviso enviado por una alerta a un responsable.

    El correo va a los supervisores del área (o a los administradores si no hay supervisor)
    y el push a cada teléfono registrado. ``fecha_envio`` comprueba el límite de 2 minutos.
    """

    class Canal(models.TextChoices):
        CORREO = "CORREO", "Correo electrónico"
        PUSH = "PUSH", "Notificación push"

    class EstadoEnvio(models.TextChoices):
        ENVIADA = "ENVIADA", "Enviada"
        FALLIDA = "FALLIDA", "Fallida"

    num = models.BigAutoField(primary_key=True)
    alerta = models.ForeignKey(
        Alerta,
        on_delete=models.PROTECT,
        db_column="alerta_num",
        related_name="notificaciones",
    )
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="usuario_num",
        related_name="notificaciones",
    )
    telefono_push = models.ForeignKey(
        "usuarios.TelefonoPush",
        on_delete=models.SET_NULL,
        db_column="telefono_push_num",
        related_name="notificaciones",
        null=True,
        blank=True,
    )
    canal = models.CharField(max_length=10, choices=Canal.choices)
    estado_envio = models.CharField(max_length=10, choices=EstadoEnvio.choices)
    fecha_envio = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "notificacion"
        ordering = ["-fecha_envio"]
        verbose_name = "notificación"
        verbose_name_plural = "notificaciones"
        constraints = [
            models.CheckConstraint(
                condition=Q(canal__in=["CORREO", "PUSH"]),
                name="ck_notificacion_canal",
            ),
            models.CheckConstraint(
                condition=Q(estado_envio__in=["ENVIADA", "FALLIDA"]),
                name="ck_notificacion_estado_envio",
            ),
            models.CheckConstraint(
                condition=Q(canal="PUSH") | Q(telefono_push__isnull=True),
                name="ck_notificacion_telefono_solo_push",
            ),
        ]

    def __str__(self):
        return f"{self.canal} → {self.usuario_id} ({self.estado_envio})"
