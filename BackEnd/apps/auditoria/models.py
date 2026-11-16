from django.db import models
from django.db.models import Q
from django.db.models.functions import Now


class RegistroAuditoria(models.Model):
    """Bitácora de auditoría: quién hizo qué, cuándo y desde dónde.

    Guarda los cambios que hacen las personas (por la API o el admin de Django) en los datos de
    configuración y los eventos de la cuenta (inicios de sesión, contraseña, verificación en dos
    pasos, tokens de integración). Los cambios automáticos del sistema (lecturas, estados de los
    dispositivos) no se registran. La organización sirve para que cada administrador vea solo
    la bitácora de la suya.
    """

    class Accion(models.TextChoices):
        CREAR = "CREAR", "Creación"
        MODIFICAR = "MODIFICAR", "Modificación"
        ELIMINAR = "ELIMINAR", "Eliminación"
        LOGIN = "LOGIN", "Inicio de sesión"
        LOGIN_FALLIDO = "LOGIN_FALLIDO", "Inicio de sesión fallido"
        LOGOUT = "LOGOUT", "Cierre de sesión"
        RECUPERAR = "RECUPERAR", "Recuperación de contraseña"
        SEGUNDO_FACTOR = "SEGUNDO_FACTOR", "Verificación en dos pasos"
        INTEGRACION = "INTEGRACION", "Integración"
        EXPORTAR = "EXPORTAR", "Exportación de datos"

    num = models.BigAutoField(primary_key=True)
    fecha_hora = models.DateTimeField(db_default=Now(), editable=False)
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="usuario_num",
        related_name="registros_auditoria",
        null=True,
        blank=True,
    )
    # Copia del correo: la bitácora se entiende aunque la cuenta cambie de correo.
    usuario_correo = models.CharField(max_length=150, blank=True, default="")
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.SET_NULL,
        db_column="organizacion_num",
        related_name="registros_auditoria",
        null=True,
        blank=True,
    )
    accion = models.CharField(max_length=20, choices=Accion.choices)
    recurso = models.CharField(max_length=40, blank=True, default="")
    recurso_num = models.CharField(max_length=40, blank=True, default="")
    descripcion = models.CharField(max_length=255, blank=True, default="")
    cambios = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "registro_auditoria"
        ordering = ["-fecha_hora", "-num"]
        verbose_name = "registro de auditoría"
        verbose_name_plural = "bitácora de auditoría"
        indexes = [
            models.Index(fields=["organizacion", "-fecha_hora"], name="idx_auditoria_organizacion"),
            models.Index(fields=["usuario", "-fecha_hora"], name="idx_auditoria_usuario"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    accion__in=[
                        "CREAR",
                        "MODIFICAR",
                        "ELIMINAR",
                        "LOGIN",
                        "LOGIN_FALLIDO",
                        "LOGOUT",
                        "RECUPERAR",
                        "SEGUNDO_FACTOR",
                        "INTEGRACION",
                        "EXPORTAR",
                    ]
                ),
                name="ck_registro_auditoria_accion",
            ),
        ]

    def __str__(self):
        return f"{self.fecha_hora:%Y-%m-%d %H:%M} {self.usuario_correo or 'sistema'} {self.accion}"
