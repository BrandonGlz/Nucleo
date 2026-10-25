"""Catálogos de la base de datos: roles, estados y variables ambientales."""

from django.db import models
from django.db.models import F


class Catalogo(models.Model):
    """Estructura común de los catálogos con llave primaria de texto."""

    codigo = models.CharField(max_length=10, primary_key=True)
    nombre = models.CharField(max_length=30, unique=True)
    descripcion = models.CharField(max_length=150, null=True, blank=True)

    class Meta:
        abstract = True
        ordering = ["codigo"]

    def __str__(self):
        return self.nombre


class Rol(Catalogo):
    """Roles: Administrador de plataforma, Administrador, Supervisor, Analista y Operador."""

    class Meta(Catalogo.Meta):
        db_table = "rol"
        verbose_name = "rol"
        verbose_name_plural = "roles"


class EstadoUsuario(Catalogo):
    """Estado de la cuenta: Activo, Inactivo o Bloqueado."""

    class Meta(Catalogo.Meta):
        db_table = "estado_usuario"
        verbose_name = "estado de usuario"
        verbose_name_plural = "estados de usuario"


class EstadoDispositivo(Catalogo):
    """Estado del dispositivo: En línea, Calentando, Sin conexión, Batería baja, etc."""

    class Meta(Catalogo.Meta):
        db_table = "estado_dispositivo"
        verbose_name = "estado de dispositivo"
        verbose_name_plural = "estados de dispositivo"


class EstadoSensor(Catalogo):
    """Estado del sensor: Operando, Requiere calibración o Falla."""

    class Meta(Catalogo.Meta):
        db_table = "estado_sensor"
        verbose_name = "estado de sensor"
        verbose_name_plural = "estados de sensor"


class VariableAmbiental(models.Model):
    """Variable que se mide, con su unidad y el rango físico que acepta el backend."""

    codigo = models.CharField(max_length=10, primary_key=True)
    nombre = models.CharField(max_length=50)
    unidad = models.CharField(max_length=15)
    rango_min = models.DecimalField(max_digits=8, decimal_places=2)
    rango_max = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        db_table = "variable_ambiental"
        ordering = ["codigo"]
        verbose_name = "variable ambiental"
        verbose_name_plural = "variables ambientales"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rango_min__lt=F("rango_max")),
                name="ck_variable_rango",
            ),
        ]

    def __str__(self):
        return f"{self.nombre} ({self.unidad})"
