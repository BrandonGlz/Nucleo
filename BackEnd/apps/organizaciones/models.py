"""Organizaciones clientes y sus áreas."""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class Organizacion(models.Model):
    """Organización a la que se presta el servicio; aísla los datos de cada cliente.

    Solo inician sesión los usuarios de una organización ``ACTIVA``; el administrador de
    plataforma la da de alta, la suspende o la da de baja.
    """

    class Estado(models.TextChoices):
        ACTIVA = "ACTIVA", "Activa"
        SUSPENDIDA = "SUSPENDIDA", "Suspendida"
        BAJA = "BAJA", "Dada de baja"

    num = models.AutoField(primary_key=True)
    nombre = models.CharField(max_length=120)
    dir_calle = models.CharField(max_length=100, null=True, blank=True)
    dir_numero = models.CharField(max_length=10, null=True, blank=True)
    dir_colonia = models.CharField(max_length=80, null=True, blank=True)
    ciudad = models.CharField(max_length=60, null=True, blank=True)
    telefono = models.CharField(max_length=15, null=True, blank=True)
    estado = models.CharField(max_length=12, choices=Estado.choices, db_default=Estado.ACTIVA)
    fecha_registro = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "organizacion"
        ordering = ["nombre"]
        verbose_name = "organización"
        verbose_name_plural = "organizaciones"
        constraints = [
            models.CheckConstraint(
                condition=Q(estado__in=["ACTIVA", "SUSPENDIDA", "BAJA"]),
                name="ck_organizacion_estado",
            ),
        ]

    def __str__(self):
        return self.nombre

    @property
    def esta_activa(self):
        return self.estado == self.Estado.ACTIVA


class Area(models.Model):
    """Área o punto crítico de una organización donde se instalan dispositivos."""

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        Organizacion,
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="areas",
    )
    nombre = models.CharField(max_length=80)
    descripcion = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        db_table = "area"
        ordering = ["organizacion", "nombre"]
        verbose_name = "área"
        verbose_name_plural = "áreas"
        constraints = [
            models.UniqueConstraint(
                fields=["organizacion", "nombre"],
                name="uq_area_organizacion_nombre",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.organizacion})"
