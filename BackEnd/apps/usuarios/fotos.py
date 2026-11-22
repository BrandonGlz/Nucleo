"""Fotos de perfil: validación, recorte a 256×256 en WebP, guardado y entrega.

Se guardan en ``MEDIA_ROOT/fotos/<aleatorio>.webp`` (``BackEnd/media`` entra en el respaldo
``nucleo_broker_media``). ``/media`` no se publica: la foto se entrega por la API
(``GET /api/v1/fotos/<nombre>``) a cualquier sesión válida. El nombre es aleatorio y cambia en
cada subida, así que se puede guardar en caché sin caducidad.
"""

import io
import re
import secrets
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.usuarios.models import Usuario

CARPETA = "fotos"
LADO = 256
TAMANO_MAXIMO = 5 * 1024 * 1024  # 5 MB
# Más píxeles que esto (p. ej. 8000×5000) se rechaza antes de decodificar: evita bombas de
# descompresión con archivos pequeños que se expanden a gigas en memoria.
PIXELES_MAXIMOS = 40_000_000
FORMATOS = {"JPEG", "PNG", "WEBP"}
_NOMBRE = re.compile(r"^[0-9a-f]{32}\.webp$")


def url_foto(usuario):
    """Ruta pública de la foto (relativa al dominio de la API) o ``None``."""
    if not usuario.foto:
        return None
    return f"/api/v1/fotos/{Path(usuario.foto).name}"


def _carpeta():
    return Path(settings.MEDIA_ROOT) / CARPETA


def procesar(archivo):
    """Valida que sea JPEG, PNG o WebP de verdad (por su contenido, no por la extensión) y
    devuelve los bytes WebP 256×256 con recorte centrado. ``ValidationError`` si no sirve."""
    if archivo.size > TAMANO_MAXIMO:
        raise serializers.ValidationError({"foto": ["La foto no puede pasar de 5 MB."]})
    try:
        imagen = Image.open(archivo)
        if imagen.format not in FORMATOS:
            raise serializers.ValidationError({"foto": ["Sube una imagen JPEG, PNG o WebP."]})
        ancho, alto = imagen.size
        if ancho * alto > PIXELES_MAXIMOS:
            raise serializers.ValidationError({"foto": ["La imagen tiene demasiados píxeles."]})
        imagen.load()
    except serializers.ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise serializers.ValidationError(
            {"foto": ["El archivo no es una imagen válida (JPEG, PNG o WebP)."]}
        ) from None
    imagen = ImageOps.exif_transpose(imagen)  # fotos del teléfono giradas
    con_transparencia = imagen.mode in ("RGBA", "LA", "PA") or (
        imagen.mode == "P" and "transparency" in imagen.info
    )
    imagen = imagen.convert("RGBA" if con_transparencia else "RGB")
    imagen = ImageOps.fit(imagen, (LADO, LADO), method=Image.Resampling.LANCZOS)
    salida = io.BytesIO()
    imagen.save(salida, format="WEBP", quality=85, method=4)
    return salida.getvalue()


def borrar_archivo(relativa):
    if not relativa:
        return
    ruta = Path(settings.MEDIA_ROOT) / relativa
    if ruta.parent == _carpeta() and _NOMBRE.match(ruta.name):
        ruta.unlink(missing_ok=True)


def guardar(usuario, contenido):
    """Escribe la foto nueva, la asigna al usuario y borra la anterior."""
    carpeta = _carpeta()
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{secrets.token_hex(16)}.webp"
    (carpeta / nombre).write_bytes(contenido)
    anterior = usuario.foto
    usuario.foto = f"{CARPETA}/{nombre}"
    usuario.save(update_fields=["foto"])
    borrar_archivo(anterior)


def quitar(usuario):
    anterior = usuario.foto
    if not anterior:
        return
    usuario.foto = None
    usuario.save(update_fields=["foto"])
    borrar_archivo(anterior)


class MiFotoView(APIView):
    """``POST`` (multipart, campo ``foto``) cambia la foto de perfil propia y ``DELETE`` la quita.

    Cada persona solo cambia la suya: no recibe el usuario, usa el de la sesión. Responde el
    usuario actualizado (como ``/auth/yo/``).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def _respuesta(self, request, codigo=status.HTTP_200_OK):
        from apps.usuarios.serializers import UsuarioSerializer

        datos = UsuarioSerializer(request.user, context={"request": request}).data
        return Response(datos, status=codigo)

    def post(self, request):
        archivo = request.FILES.get("foto")
        if archivo is None:
            raise serializers.ValidationError({"foto": ["Adjunta la foto en el campo «foto»."]})
        guardar(request.user, procesar(archivo))
        return self._respuesta(request)

    def delete(self, request):
        quitar(request.user)
        return self._respuesta(request)


class FotoView(APIView):
    """Entrega una foto de perfil a cualquier sesión válida (web por cookie, app por token)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, nombre):
        if not _NOMBRE.match(nombre):
            raise Http404
        relativa = f"{CARPETA}/{nombre}"
        ruta = _carpeta() / nombre
        if not ruta.is_file() or not Usuario.objects.filter(foto=relativa).exists():
            raise Http404
        respuesta = FileResponse(ruta.open("rb"), content_type="image/webp")
        respuesta["Cache-Control"] = "private, max-age=31536000, immutable"
        return respuesta
