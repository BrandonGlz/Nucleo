"""Configuración de Nico AI que se edita desde la consola (nicoai.bynucleo.com).

- ``DocumentoNico``: el documento del agente (``NICO.md``, por secciones). Si está activo se
  agrega a las instrucciones de la IA local en cada redacción.
- ``AjusteHerramienta``: descripción, propósito y ejemplo de cada herramienta del catálogo, y si
  está activa. Sin ajuste guardado, la herramienta usa lo que dice el código.
- ``AjusteSugerencias``: las sugerencias que aparecen al escribir en el chat (una sola fila).
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


class AjusteSugerencias(models.Model):
    """Sugerencias del chat mientras se escribe: si se muestran, cuántas, de qué fuentes salen,
    cuáles van siempre primero (fijadas) y cuáles nunca (ocultas, por pregunta normalizada)."""

    num = models.PositiveSmallIntegerField(primary_key=True, default=1)
    activas = models.BooleanField(default=True)
    maximo = models.PositiveSmallIntegerField(default=6)
    usar_banco = models.BooleanField(default=True)
    usar_incluidas = models.BooleanField(default=True)
    usar_herramientas = models.BooleanField(default=True)
    usar_frecuentes = models.BooleanField(default=True)
    fijadas = models.JSONField(default=list, blank=True)
    ocultas = models.JSONField(default=list, blank=True)
    actualizado = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="actualizado_por_num",
        related_name="+",
    )

    class Meta:
        db_table = "ajuste_sugerencias"
        verbose_name = "ajuste de sugerencias"
        verbose_name_plural = "ajustes de sugerencias"

    @classmethod
    def actual(cls):
        return cls.objects.get_or_create(num=1)[0]


class NotificacionNico(models.Model):
    """Aviso de la consola de Nico AI para un superusuario (campana de nicoai.<dominio>).

    Las notificaciones de alertas (``alertas.Notificacion``) son el registro de envío de una
    alerta de sensores a un responsable y siempre llevan su alerta; estas son eventos del
    agente, sin organización, y guardan si ya se leyeron. Se crean desde ``avisos.avisar``,
    que también manda el correo según las preferencias de cada superusuario.
    """

    class Tipo(models.TextChoices):
        NO_ENTENDIDA = "NO_ENTENDIDA", "Pregunta no entendida"
        NEGATIVA = "NEGATIVA", "Calificación negativa"
        PUENTE = "PUENTE", "ESP puente"
        CARGA = "CARGA", "IA suspendida por carga"
        APRENDIDA = "APRENDIDA", "Aprendido por el banco"

    class Nivel(models.TextChoices):
        INFO = "INFO", "Información"
        OK = "OK", "Resuelto"
        ADVERTENCIA = "ADVERTENCIA", "Advertencia"
        PELIGRO = "PELIGRO", "Peligro"

    num = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column="usuario_num",
        related_name="notificaciones_nico",
    )
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    nivel = models.CharField(max_length=12, choices=Nivel.choices, default=Nivel.INFO)
    titulo = models.CharField(max_length=160)
    texto = models.CharField(max_length=500, blank=True)
    # Ruta de la consola a la que lleva (p. ej. «/registro?via=NO_ENTENDIDA»).
    enlace = models.CharField(max_length=300, blank=True)
    leida = models.BooleanField(default=False)
    correo_enviado = models.BooleanField(default=False)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notificacion_nico"
        ordering = ["-fecha", "-num"]
        verbose_name = "notificación de Nico AI"
        verbose_name_plural = "notificaciones de Nico AI"
        indexes = [
            models.Index(fields=["usuario", "leida", "fecha"], name="ix_notif_nico_usuario"),
        ]

    def __str__(self):
        return self.titulo


class PreferenciaAvisosNico(models.Model):
    """Qué avisos de Nico AI quiere cada superusuario en la campana y por correo.

    ``tipos`` es ``{tipo: {"consola": bool, "correo": bool}}``; lo que falte toma el valor de
    ``avisos.PREDETERMINADAS``.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        db_column="usuario_num",
        related_name="preferencia_avisos_nico",
    )
    tipos = models.JSONField(default=dict, blank=True)
    actualizado = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "preferencia_avisos_nico"
        verbose_name = "preferencia de avisos de Nico AI"
        verbose_name_plural = "preferencias de avisos de Nico AI"


class MarcaAvisoNico(models.Model):
    """Último estado o aviso de algo que se vigila (ESP puente, IA por carga) o que no debe
    repetirse seguido (la misma pregunta no entendida): evita avisos duplicados aunque nadie
    tenga activada la campana y aunque el proceso se reinicie."""

    clave = models.CharField(max_length=200, primary_key=True)
    valor = models.CharField(max_length=40, blank=True)
    fecha = models.DateTimeField()

    class Meta:
        db_table = "marca_aviso_nico"
        verbose_name = "marca de aviso de Nico AI"
        verbose_name_plural = "marcas de avisos de Nico AI"
