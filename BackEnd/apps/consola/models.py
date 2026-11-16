"""Política de seguridad que se ajusta desde la consola de administración (admin.bynucleo.com)."""

from django.db import models
from django.db.models.functions import Now


class PoliticaSeguridad(models.Model):
    """Una sola fila (num = 1). Si no existe, se crea con los valores del ``.env``
    (``politicas.politica()``), así una instalación nueva se comporta como antes."""

    num = models.SmallAutoField(primary_key=True)
    dias_sesion = models.PositiveSmallIntegerField()
    intentos_login_por_minuto = models.PositiveSmallIntegerField()
    roles_2fa_obligatorio = models.JSONField(default=list, blank=True)
    dias_auditoria = models.PositiveSmallIntegerField()
    ota_todos = models.BooleanField(default=False)
    actualizado = models.DateTimeField(db_default=Now())
    actualizado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="actualizado_por_num",
        related_name="+",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "politica_seguridad"
        verbose_name = "política de seguridad"
        verbose_name_plural = "política de seguridad"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(dias_sesion__gte=1, dias_sesion__lte=90),
                name="ck_politica_dias_sesion",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    intentos_login_por_minuto__gte=3, intentos_login_por_minuto__lte=60
                ),
                name="ck_politica_intentos",
            ),
            models.CheckConstraint(
                condition=models.Q(dias_auditoria__gte=30, dias_auditoria__lte=3650),
                name="ck_politica_dias_auditoria",
            ),
        ]

    def __str__(self):
        return "Política de seguridad"
