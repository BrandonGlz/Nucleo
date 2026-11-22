"""Avisos de la campana: lo que pasa en dispositivos, usuarios, reportes y Nico AI.

Las alertas de medición siguen en ``apps.alertas`` (``Alerta`` y ``Notificacion``); un aviso
es la otra mitad de la campana: un mensaje corto para un usuario con la ruta de la web a la
que lleva.
"""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class Aviso(models.Model):
    """Mensaje de la campana para un usuario. ``leido_en`` vacío = sin leer."""

    class Tipo(models.TextChoices):
        DISPOSITIVO = "DISPOSITIVO", "Dispositivo"
        USUARIO = "USUARIO", "Usuario"
        REPORTE = "REPORTE", "Reporte"
        NICO = "NICO", "Nico AI"

    class Nivel(models.TextChoices):
        INFO = "INFO", "Información"
        ADVERTENCIA = "ADVERTENCIA", "Advertencia"
        PELIGRO = "PELIGRO", "Peligro"

    num = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.CASCADE,
        db_column="usuario_num",
        related_name="avisos",
    )
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    nivel = models.CharField(max_length=12, choices=Nivel.choices, db_default=Nivel.INFO)
    titulo = models.CharField(max_length=120)
    detalle = models.CharField(max_length=300, blank=True, db_default="")
    ruta = models.CharField(max_length=200, blank=True, db_default="")
    fecha_hora = models.DateTimeField(db_default=Now(), editable=False)
    leido_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "aviso"
        ordering = ["-fecha_hora", "-num"]
        verbose_name = "aviso"
        verbose_name_plural = "avisos"
        indexes = [
            models.Index(fields=["usuario", "-fecha_hora"], name="idx_aviso_usuario"),
            models.Index(
                fields=["usuario"],
                condition=Q(leido_en__isnull=True),
                name="idx_aviso_no_leido",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(tipo__in=["DISPOSITIVO", "USUARIO", "REPORTE", "NICO"]),
                name="ck_aviso_tipo",
            ),
            models.CheckConstraint(
                condition=Q(nivel__in=["INFO", "ADVERTENCIA", "PELIGRO"]),
                name="ck_aviso_nivel",
            ),
            models.CheckConstraint(
                condition=Q(ruta="") | Q(ruta__startswith="/"),
                name="ck_aviso_ruta",
            ),
        ]

    def __str__(self):
        return f"Aviso {self.num} · {self.tipo} · {self.titulo}"

    @property
    def leido(self):
        return self.leido_en is not None
