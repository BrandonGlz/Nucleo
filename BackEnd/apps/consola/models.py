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


class AlertaSeguridad(models.Model):
    """Alerta de seguridad de la consola (módulo «Alertas» de admin.bynucleo.com).

    Se crea al ocurrir el evento (``alertas.py``): intentos fallidos desde una IP o en una cuenta,
    acceso desde una IP nueva y cuenta bloqueada. ``clave`` identifica el caso (p. ej.
    ``ip_fallidos:203.0.113.9``) y un índice único parcial impide dos alertas nuevas del mismo
    caso: los eventos siguientes actualizan la abierta (``eventos``, ``nivel``, ``ultimo_evento``).
    """

    class Tipo(models.TextChoices):
        IP_FALLIDOS = "ip_fallidos", "Intentos fallidos desde una IP"
        CUENTA_FALLIDOS = "cuenta_fallidos", "Intentos fallidos en una cuenta"
        IP_NUEVA = "ip_nueva", "Acceso desde una IP nueva"
        CUENTA_BLOQUEADA = "cuenta_bloqueada", "Cuenta bloqueada"

    class Nivel(models.TextChoices):
        CRITICO = "critico", "Crítico"
        ADVERTENCIA = "advertencia", "Advertencia"

    class Estado(models.TextChoices):
        NUEVA = "nueva", "Nueva"
        REVISADA = "revisada", "Revisada"
        DESCARTADA = "descartada", "Descartada"

    num = models.BigAutoField(primary_key=True)
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    nivel = models.CharField(max_length=12, choices=Nivel.choices)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.NUEVA)
    clave = models.CharField(max_length=120)
    titulo = models.CharField(max_length=200)
    detalle = models.CharField(max_length=255, blank=True, default="")
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="usuario_num",
        related_name="alertas_seguridad",
        null=True,
        blank=True,
    )
    # Copia del correo: la alerta se entiende aunque la cuenta cambie o se borre.
    usuario_correo = models.CharField(max_length=150, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    eventos = models.PositiveIntegerField(default=1)
    creada = models.DateTimeField(db_default=Now(), editable=False)
    ultimo_evento = models.DateTimeField()
    revisada_por = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.SET_NULL,
        db_column="revisada_por_num",
        related_name="+",
        null=True,
        blank=True,
    )
    fecha_revision = models.DateTimeField(null=True, blank=True)
    nota = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "alerta_seguridad"
        ordering = ["-ultimo_evento", "-num"]
        verbose_name = "alerta de seguridad"
        verbose_name_plural = "alertas de seguridad"
        indexes = [
            models.Index(fields=["estado", "-ultimo_evento"], name="idx_alerta_seg_estado"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(
                    tipo__in=["ip_fallidos", "cuenta_fallidos", "ip_nueva", "cuenta_bloqueada"]
                ),
                name="ck_alerta_seguridad_tipo",
            ),
            models.CheckConstraint(
                condition=models.Q(nivel__in=["critico", "advertencia"]),
                name="ck_alerta_seguridad_nivel",
            ),
            models.CheckConstraint(
                condition=models.Q(estado__in=["nueva", "revisada", "descartada"]),
                name="ck_alerta_seguridad_estado",
            ),
            models.UniqueConstraint(
                fields=["clave"],
                condition=models.Q(estado="nueva"),
                name="uq_alerta_seguridad_abierta",
            ),
        ]

    def __str__(self):
        return f"{self.get_tipo_display()} · {self.nivel} · {self.estado}"


def _niveles_todos():
    return ["critico", "advertencia"]


def _niveles_criticos():
    return ["critico"]


class NotificacionSeguridad(models.Model):
    """Aviso de una alerta de seguridad a un superusuario: la campana de la consola y, según
    sus preferencias, un correo (``correo_enviado``: ``None`` si no se mandó)."""

    num = models.BigAutoField(primary_key=True)
    alerta = models.ForeignKey(
        AlertaSeguridad,
        on_delete=models.CASCADE,
        db_column="alerta_seguridad_num",
        related_name="notificaciones",
    )
    usuario = models.ForeignKey(
        "usuarios.Usuario",
        on_delete=models.CASCADE,
        db_column="usuario_num",
        related_name="notificaciones_seguridad",
    )
    nivel = models.CharField(max_length=12, choices=AlertaSeguridad.Nivel.choices)
    fecha = models.DateTimeField(db_default=Now(), editable=False)
    leida = models.BooleanField(default=False)
    correo_enviado = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = "notificacion_seguridad"
        ordering = ["-fecha", "-num"]
        verbose_name = "notificación de seguridad"
        verbose_name_plural = "notificaciones de seguridad"
        indexes = [
            models.Index(fields=["usuario", "-fecha"], name="idx_notif_seg_usuario"),
        ]

    def __str__(self):
        return f"Alerta {self.alerta_id} → {self.usuario_id}"


class PreferenciaAvisosSeguridad(models.Model):
    """Qué niveles de alerta de seguridad le llegan a cada superusuario en la campana de la
    consola y por correo. Sin fila: campana con todos y correo solo con los críticos."""

    usuario = models.OneToOneField(
        "usuarios.Usuario",
        on_delete=models.CASCADE,
        primary_key=True,
        db_column="usuario_num",
        related_name="preferencia_avisos_seguridad",
    )
    niveles_consola = models.JSONField(default=_niveles_todos, blank=True)
    niveles_correo = models.JSONField(default=_niveles_criticos, blank=True)
    actualizado = models.DateTimeField(db_default=Now())

    class Meta:
        db_table = "preferencia_avisos_seguridad"
        verbose_name = "preferencia de avisos de seguridad"
        verbose_name_plural = "preferencias de avisos de seguridad"

    def __str__(self):
        return f"Avisos de seguridad de {self.usuario_id}"
