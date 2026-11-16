"""Integración con sistemas externos de cada organización.

- ``TokenAPI``: llave de solo lectura para consultar dispositivos, sensores, lecturas y alertas
  de la organización desde otro sistema. Solo se guarda su SHA-256; la llave completa se muestra
  una vez al crearla.
- ``Webhook``: URL HTTPS a la que Núcleo avisa de las alertas, con el cuerpo firmado con
  HMAC-SHA256. El secreto va cifrado porque hace falta para firmar.
"""

from django.db import models
from django.db.models import Q
from django.db.models.functions import Now

from common.cifrado import CampoCifrado


class TokenAPI(models.Model):
    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.CASCADE,
        db_column="organizacion_num",
        related_name="tokens_api",
    )
    nombre = models.CharField(max_length=80)
    # Inicio visible de la llave, para reconocerla en la lista.
    prefijo = models.CharField(max_length=12, unique=True)
    clave_hash = models.CharField(max_length=64)
    creado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="creado_por_num",
        related_name="tokens_api_creados",
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)
    fecha_expiracion = models.DateTimeField(null=True, blank=True)
    ultimo_uso = models.DateTimeField(null=True, blank=True)
    activo = models.BooleanField(db_default=True, default=True)

    class Meta:
        db_table = "token_api"
        ordering = ["-fecha_creacion"]
        verbose_name = "token de API"
        verbose_name_plural = "tokens de API"

    def __str__(self):
        return f"{self.nombre} ({self.prefijo}…)"


class Webhook(models.Model):
    class Evento(models.TextChoices):
        ALERTA_NUEVA = "alerta.nueva", "Alerta nueva"
        ALERTA_ATENDIDA = "alerta.atendida", "Alerta atendida"
        ALERTA_DESCARTADA = "alerta.descartada", "Alerta descartada"

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.CASCADE,
        db_column="organizacion_num",
        related_name="webhooks",
    )
    nombre = models.CharField(max_length=80)
    url = models.URLField(max_length=300)
    secreto = CampoCifrado()
    eventos = models.JSONField(default=list)
    activo = models.BooleanField(db_default=True, default=True)
    creado_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="creado_por_num",
        related_name="webhooks_creados",
        null=True,
        blank=True,
    )
    fecha_creacion = models.DateTimeField(db_default=Now(), editable=False)
    ultimo_envio = models.DateTimeField(null=True, blank=True)
    ultimo_estado = models.CharField(max_length=120, blank=True, default="")
    fallos_consecutivos = models.PositiveSmallIntegerField(db_default=0, default=0)

    class Meta:
        db_table = "webhook"
        ordering = ["-fecha_creacion"]
        verbose_name = "webhook"
        verbose_name_plural = "webhooks"
        constraints = [
            models.CheckConstraint(
                condition=Q(url__startswith="https://"), name="ck_webhook_url_https"
            ),
        ]

    def __str__(self):
        return f"{self.nombre} → {self.url}"
