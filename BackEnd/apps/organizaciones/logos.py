"""Logos de las organizaciones: validación, ajuste a 600×200 PNG, guardado y entrega.

Se guardan en ``MEDIA_ROOT/logos/<aleatorio>.png`` (``BackEnd/media`` entra en el respaldo
``nucleo_broker_media``). ``/media`` no se publica: el logo se entrega por la API
(``GET /api/v1/logos/<nombre>``) a cualquier sesión válida. El nombre es aleatorio y cambia
en cada subida, así que se puede guardar en caché sin caducidad.
"""

import io
import re
import secrets
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.organizaciones.models import Organizacion

CARPETA = "logos"
ANCHO = 600
ALTO = 200
TAMANO_MAXIMO = 2 * 1024 * 1024  # 2 MB
# Más píxeles que esto (p. ej. 8000×5000) se rechaza antes de decodificar.
PIXELES_MAXIMOS = 40_000_000
FORMATOS = {"JPEG", "PNG", "WEBP"}
_NOMBRE = re.compile(r"^[0-9a-f]{32}\.png$")


def url_logo(organizacion):
    """Ruta pública del logo (relativa al dominio de la API) o ``None``."""
    if not organizacion.logo:
        return None
    return f"/api/v1/logos/{Path(organizacion.logo).name}"


def _carpeta():
    return Path(settings.MEDIA_ROOT) / CARPETA


def procesar(archivo):
    """Valida que sea PNG, JPEG o WebP de verdad y devuelve un PNG de hasta 600×200.

    No recorta: conserva la proporción y solo reduce si la imagen es más grande que el
    espacio disponible. ``ValidationError`` si el archivo no sirve.
    """
    if archivo.size > TAMANO_MAXIMO:
        raise serializers.ValidationError({"logo": ["El logo no puede pasar de 2 MB."]})
    try:
        imagen = Image.open(archivo)
        if imagen.format not in FORMATOS:
            raise serializers.ValidationError({"logo": ["Sube una imagen PNG, JPEG o WebP."]})
        ancho, alto = imagen.size
        if ancho * alto > PIXELES_MAXIMOS:
            raise serializers.ValidationError({"logo": ["La imagen tiene demasiados píxeles."]})
        imagen.load()
    except serializers.ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise serializers.ValidationError(
            {"logo": ["El archivo no es una imagen válida (PNG, JPEG o WebP)."]}
        ) from None
    imagen = ImageOps.exif_transpose(imagen)  # fotos del teléfono giradas
    con_transparencia = imagen.mode in ("RGBA", "LA", "PA") or (
        imagen.mode == "P" and "transparency" in imagen.info
    )
    imagen = imagen.convert("RGBA" if con_transparencia else "RGB")
    # Sin recortar: solo se reduce si rebasa el espacio del membrete.
    imagen.thumbnail((ANCHO, ALTO), Image.Resampling.LANCZOS)
    salida = io.BytesIO()
    imagen.save(salida, format="PNG", optimize=True)
    return salida.getvalue()


def borrar_archivo(relativa):
    if not relativa:
        return
    ruta = Path(settings.MEDIA_ROOT) / relativa
    if ruta.parent == _carpeta() and _NOMBRE.match(ruta.name):
        ruta.unlink(missing_ok=True)


def guardar(organizacion, contenido):
    """Escribe el logo nuevo, lo asigna a la organización y borra el anterior."""
    carpeta = _carpeta()
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{secrets.token_hex(16)}.png"
    (carpeta / nombre).write_bytes(contenido)
    anterior = organizacion.logo
    organizacion.logo = f"{CARPETA}/{nombre}"
    organizacion.save(update_fields=["logo"])
    borrar_archivo(anterior)


def quitar(organizacion):
    anterior = organizacion.logo
    if not anterior:
        return
    organizacion.logo = None
    organizacion.save(update_fields=["logo"])
    borrar_archivo(anterior)


class LogoView(APIView):
    """Entrega un logo a cualquier sesión válida (web por cookie, app por token)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, nombre):
        if not _NOMBRE.match(nombre):
            raise Http404
        relativa = f"{CARPETA}/{nombre}"
        ruta = _carpeta() / nombre
        if not ruta.is_file() or not Organizacion.objects.filter(logo=relativa).exists():
            raise Http404
        respuesta = FileResponse(ruta.open("rb"), content_type="image/png")
        respuesta["Cache-Control"] = "private, max-age=31536000, immutable"
        return respuesta
