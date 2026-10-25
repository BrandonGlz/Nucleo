"""Modelo de usuario de Núcleo (tabla ``usuario``)."""

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.db.models.functions import Now

from common import roles


class UsuarioManager(BaseUserManager):
    use_in_migrations = False

    def create_user(self, correo, password=None, **campos):
        if not correo:
            raise ValueError("El correo es obligatorio.")
        campos.setdefault("estado_usuario_id", roles.USUARIO_ACTIVO)
        campos.setdefault("rol_id", roles.OPERADOR)
        usuario = self.model(correo=self.normalize_email(correo), **campos)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_superuser(self, correo, password=None, **campos):
        """Crea un administrador de plataforma: el único rol sin organización."""
        campos["rol_id"] = roles.ADMIN_PLATAFORMA
        campos["organizacion"] = None
        campos["area"] = None
        return self.create_user(correo, password, **campos)


class Usuario(AbstractBaseUser):
    """Persona que accede a la aplicación web o móvil.

    Sirve como modelo de usuario de Django. No usa ``PermissionsMixin``: los
    permisos salen del rol (``rol_codigo``) y no hay tablas de grupos propias. Solo el
    administrador de plataforma, que pertenece al equipo de Núcleo, no tiene organización.
    """

    num = models.AutoField(primary_key=True)
    organizacion = models.ForeignKey(
        "organizaciones.Organizacion",
        on_delete=models.PROTECT,
        db_column="organizacion_num",
        related_name="usuarios",
        null=True,
        blank=True,
    )
    area = models.ForeignKey(
        "organizaciones.Area",
        on_delete=models.PROTECT,
        db_column="area_num",
        related_name="usuarios",
        null=True,
        blank=True,
    )
    rol = models.ForeignKey(
        "catalogos.Rol",
        on_delete=models.PROTECT,
        db_column="rol_codigo",
        related_name="usuarios",
    )
    estado_usuario = models.ForeignKey(
        "catalogos.EstadoUsuario",
        on_delete=models.PROTECT,
        db_column="estado_usuario_codigo",
        related_name="usuarios",
        default=roles.USUARIO_ACTIVO,
    )
    nombre = models.CharField(max_length=60)
    primer_apellido = models.CharField(max_length=60)
    segundo_apellido = models.CharField(max_length=60, null=True, blank=True)
    correo = models.EmailField(max_length=150, unique=True)
    telefono = models.CharField(max_length=15, null=True, blank=True)
    last_login = models.DateTimeField(db_column="ultimo_acceso", null=True, blank=True)
    fecha_registro = models.DateTimeField(db_default=Now(), editable=False)

    objects = UsuarioManager()

    USERNAME_FIELD = "correo"
    EMAIL_FIELD = "correo"
    REQUIRED_FIELDS = ["nombre", "primer_apellido"]

    class Meta:
        db_table = "usuario"
        ordering = ["primer_apellido", "nombre"]
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        indexes = [
            models.Index(fields=["organizacion", "area"], name="idx_usuario_organizacion"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(rol=roles.ADMIN_PLATAFORMA, organizacion__isnull=True)
                    | (~Q(rol=roles.ADMIN_PLATAFORMA) & Q(organizacion__isnull=False))
                ),
                name="ck_usuario_adminplat_sin_organizacion",
            ),
        ]

    def __str__(self):
        return f"{self.get_full_name()} <{self.correo}>"

    def clean(self):
        super().clean()
        if self.rol_id == roles.ADMIN_PLATAFORMA:
            if self.organizacion_id or self.area_id:
                raise ValidationError(
                    {"organizacion": "El administrador de plataforma no tiene organización."}
                )
            return
        if not self.organizacion_id:
            raise ValidationError({"organizacion": "Este rol requiere una organización."})
        if (
            self.area_id
            and self.organizacion_id
            and self.area.organizacion_id != self.organizacion_id
        ):
            raise ValidationError(
                {"area": "El área debe pertenecer a la organización del usuario."}
            )
        if self.rol_id in (roles.SUPERVISOR, roles.OPERADOR) and not self.area_id:
            raise ValidationError({"area": "Los supervisores y operadores requieren un área."})

    def get_full_name(self):
        partes = [self.nombre, self.primer_apellido, self.segundo_apellido]
        return " ".join(p for p in partes if p)

    def get_short_name(self):
        return self.nombre

    # --- Estado y permisos derivados del catálogo y del rol ---------------------------------

    @property
    def is_active(self):
        """Cuenta activa de una organización activa (o del equipo de Núcleo)."""
        if self.estado_usuario_id != roles.USUARIO_ACTIVO:
            return False
        return self.organizacion_id is None or self.organizacion.esta_activa

    @property
    def is_staff(self):
        return self.is_active and self.rol_id == roles.ADMIN_PLATAFORMA

    @property
    def is_superuser(self):
        return self.is_staff

    def has_perm(self, perm, obj=None):
        return self.is_staff

    def has_module_perms(self, app_label):
        return self.is_staff

    def tiene_rol(self, *codigos):
        return self.rol_id in codigos


class TelefonoPush(models.Model):
    """Teléfono registrado para recibir notificaciones push con Expo.

    El token se registra al iniciar sesión en la app y se elimina al cerrarla; un
    usuario puede tener varios teléfonos.
    """

    class Plataforma(models.TextChoices):
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    num = models.AutoField(primary_key=True)
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        db_column="usuario_num",
        related_name="telefonos_push",
    )
    token_expo = models.CharField(max_length=255, unique=True)
    plataforma = models.CharField(max_length=10, choices=Plataforma.choices)
    fecha_registro = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "telefono_push"
        ordering = ["usuario", "num"]
        verbose_name = "teléfono push"
        verbose_name_plural = "teléfonos push"
        constraints = [
            models.CheckConstraint(
                condition=Q(plataforma__in=["ANDROID", "IOS"]),
                name="ck_telefono_push_plataforma",
            ),
        ]

    def __str__(self):
        return f"{self.plataforma} · usuario {self.usuario_id}"
