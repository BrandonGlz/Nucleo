"""Umbrales de advertencia y de peligro por variable y dispositivo."""

from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Now
from django.utils import timezone


class Umbral(models.Model):
    """Límites de una variable en un dispositivo.

    Cada lectura se clasifica como Normal (dentro de los límites de advertencia),
    Advertencia (fuera de ellos sin rebasar los de peligro) o Peligro (fuera de los de
    peligro). Se cumple ``peligro_min <= advertencia_min < advertencia_max <= peligro_max``.
    """

    num = models.AutoField(primary_key=True)
    dispositivo = models.ForeignKey(
        "dispositivos.Dispositivo",
        on_delete=models.PROTECT,
        db_column="dispositivo_num",
        related_name="umbrales",
    )
    variable = models.ForeignKey(
        "catalogos.VariableAmbiental",
        on_delete=models.PROTECT,
        db_column="variable_codigo",
        related_name="umbrales",
    )
    configurado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.PROTECT,
        db_column="configurado_por",
        related_name="umbrales_configurados",
    )
    peligro_min = models.DecimalField(max_digits=8, decimal_places=2)
    advertencia_min = models.DecimalField(max_digits=8, decimal_places=2)
    advertencia_max = models.DecimalField(max_digits=8, decimal_places=2)
    peligro_max = models.DecimalField(max_digits=8, decimal_places=2)
    activo = models.BooleanField(db_default=True)
    fecha_actualizacion = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "umbral"
        ordering = ["dispositivo", "variable"]
        verbose_name = "umbral"
        verbose_name_plural = "umbrales"
        constraints = [
            models.UniqueConstraint(
                fields=["dispositivo", "variable"],
                name="uq_umbral_dispositivo_variable",
            ),
            models.CheckConstraint(
                condition=Q(peligro_min__lte=F("advertencia_min"))
                & Q(advertencia_min__lt=F("advertencia_max"))
                & Q(advertencia_max__lte=F("peligro_max")),
                name="ck_umbral_limites",
            ),
        ]

    def __str__(self):
        return (
            f"{self.variable_id} advertencia {self.advertencia_min}–{self.advertencia_max}, "
            f"peligro {self.peligro_min}–{self.peligro_max} · {self.dispositivo}"
        )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            self.fecha_actualizacion = timezone.now()
        super().save(*args, **kwargs)

    def clasificar(self, valor):
        """Devuelve ``(nivel, tipo)`` o ``None`` si el valor es normal.

        ``nivel`` es ``ADVERTENCIA`` o ``PELIGRO``; ``tipo`` es ``POR_ENCIMA`` o ``POR_DEBAJO``.
        """
        if valor > self.peligro_max:
            return "PELIGRO", "POR_ENCIMA"
        if valor < self.peligro_min:
            return "PELIGRO", "POR_DEBAJO"
        if valor > self.advertencia_max:
            return "ADVERTENCIA", "POR_ENCIMA"
        if valor < self.advertencia_min:
            return "ADVERTENCIA", "POR_DEBAJO"
        return None
