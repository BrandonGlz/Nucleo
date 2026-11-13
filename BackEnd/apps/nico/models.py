"""Configuración de Nico AI que se edita desde la consola (nicoai.bynucleo.com).

- ``DocumentoNico``: los archivos del agente (SOUL, IDENTITY, AGENTS…). Los activos se agregan a
  las instrucciones de la IA local en cada redacción.
- ``AjusteHerramienta``: descripción, propósito y ejemplo de cada herramienta del catálogo, y si
  está activa. Sin ajuste guardado, la herramienta usa lo que dice el código.
"""

from django.conf import settings
from django.db import models


class DocumentoNico(models.Model):
    num = models.AutoField(primary_key=True)
    # Nombre del archivo, en mayúsculas y sin extensión: SOUL, IDENTITY, AGENTS…
    clave = models.CharField(max_length=40, unique=True)
    descripcion = models.CharField(max_length=200, blank=True)
    contenido = models.TextField(blank=True)
    activo = models.BooleanField(default=False)
    orden = models.PositiveSmallIntegerField(default=0)
    actualizado = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        db_column="actualizado_por_num",
        related_name="+",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "documento_nico"
        ordering = ["orden", "clave"]
        verbose_name = "documento de Nico AI"
        verbose_name_plural = "documentos de Nico AI"

    def __str__(self):
        return f"{self.clave}.md"


class AjusteHerramienta(models.Model):
    nombre = models.CharField(max_length=40, primary_key=True)
    descripcion = models.TextField(blank=True)
    proposito = models.TextField(blank=True)
    ejemplo = models.CharField(max_length=200, blank=True)
    activa = models.BooleanField(default=True)
    actualizado = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        db_column="actualizado_por_num",
        related_name="+",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "ajuste_herramienta"
        verbose_name = "ajuste de herramienta"
        verbose_name_plural = "ajustes de herramientas"

    def __str__(self):
        return self.nombre
