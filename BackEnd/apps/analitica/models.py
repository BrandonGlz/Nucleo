"""Tableros de analítica con versiones.

Un tablero es la configuración visual (páginas y tarjetas) de un tablero de KPIs. Cada
cambio de esa configuración crea una ``VersionTablero`` nueva; nunca se edita una versión.
Las plantillas del sistema no tienen organización y no se editan: se duplican.
"""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class TableroAnalitica(models.Model):
    """Tablero de KPIs compartido por una organización o plantilla del sistema."""

    class Plantilla(models.TextChoices):
        EJECUTIVO = "EJECUTIVO", "Ejecutivo"
        AMBIENTAL = "AMBIENTAL", "Calidad ambiental"
        ALERTAS = "ALERTAS", "Alertas y respuesta"
        OPERACION = "OPERACION", "Disponibilidad y operación"

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="tableros_analitica",
        null=True,
        blank=True,
    )
    nombre = models.CharField(max_length=80)
    descripcion = models.CharField(max_length=200, blank=True, default="")
    plantilla = models.CharField(max_length=12, choices=Plantilla.choices, blank=True)
    predeterminado = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)
    creado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creado_por",
        related_name="tableros_analitica_creados",
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "tablero_analitica"
        ordering = ["nombre"]
        verbose_name = "tablero de analítica"
        verbose_name_plural = "tableros de analítica"
        constraints = [
            models.CheckConstraint(
                condition=(
                    (Q(plantilla="") & Q(organizacion__isnull=False))
                    | (~Q(plantilla="") & Q(organizacion__isnull=True))
                ),
                name="ck_tablero_plantilla_sin_org",
            ),
            models.UniqueConstraint(
                fields=["organizacion"],
                condition=Q(predeterminado=True, activo=True),
                name="uq_tablero_predeterminado",
            ),
            models.UniqueConstraint(
                fields=["organizacion", "nombre"],
                condition=Q(activo=True),
                name="uq_tablero_nombre",
            ),
        ]

    def version_actual(self):
        """La última versión guardada del tablero."""
        return self.versiones.order_by("-numero").first()

    def __str__(self):
        return f"{self.nombre} ({self.organizacion or 'plantilla'})"


class VersionTablero(models.Model):
    """Configuración de un tablero en un momento dado.

    Las versiones no se editan: cada «Guardar» agrega una nueva y se puede restaurar una
    anterior creando otra versión igual a ella.
    """

    num = models.AutoField(primary_key=True)
    tablero = models.ForeignKey(
        TableroAnalitica,
        on_delete=models.PROTECT,
        db_column="tablero_num",
        related_name="versiones",
    )
    numero = models.PositiveIntegerField()
    conf = models.JSONField()
    creada_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="creada_por",
        related_name="versiones_tablero_creadas",
        null=True,
        blank=True,
    )
    fecha = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "version_tablero"
        ordering = ["tablero", "numero"]
        verbose_name = "versión de tablero"
        verbose_name_plural = "versiones de tablero"
        constraints = [
            models.UniqueConstraint(
                fields=["tablero", "numero"],
                name="uq_version_tablero_numero",
            ),
        ]

    def __str__(self):
        return f"{self.tablero.nombre} · versión {self.numero}"
