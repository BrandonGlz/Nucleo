"""Dictado por voz de respaldo: convierte a texto el audio que graba la web.

La web usa primero el dictado del navegador (Chrome, Edge, Safari). En los que no lo
traen o lo tienen sin servicio (Brave, Firefox, Chromium), graba el audio y lo manda
aquí; Whisper (``faster-whisper``) lo transcribe en el propio servidor, sin servicios
externos. El modelo se carga al primer dictado y se libera tras unos minutos sin uso
(ocupa unos 300 MB).
"""

import logging
import threading

from django.conf import settings
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from common import roles

logger = logging.getLogger(__name__)

MAX_BYTES = 6 * 1024 * 1024  # unos 3 minutos de opus; el dictado dura segundos
# Pista con el vocabulario de Núcleo: mejora nombres propios y términos del dominio.
PISTA = (
    "Pregunta para Nico, el asistente de Núcleo, sobre sensores, temperatura, humedad, "
    "calidad del aire, CO2, alertas, umbrales, áreas, laboratorio y dispositivos."
)

LIBERAR_TRAS_S = 600

_modelo = None
_candado = threading.Lock()
_reloj = None


def _liberar():
    global _modelo
    with _candado:
        _modelo = None


def _programar_liberacion():
    global _reloj
    if _reloj is not None:
        _reloj.cancel()
    _reloj = threading.Timer(LIBERAR_TRAS_S, _liberar)
    _reloj.daemon = True
    _reloj.start()


def modelo():
    global _modelo
    with _candado:
        _programar_liberacion()
        if _modelo is None:
            from faster_whisper import WhisperModel

            _modelo = WhisperModel(
                settings.NUCLEO_WHISPER_MODELO,
                device="cpu",
                compute_type="int8",
                cpu_threads=settings.NUCLEO_WHISPER_HILOS,
            )
        return _modelo


def transcribir(archivo):
    """Texto del audio (cualquier formato que lea FFmpeg: webm, ogg, mp4, wav)."""
    segmentos, _ = modelo().transcribe(
        archivo,
        language="es",
        beam_size=1,
        vad_filter=True,
        initial_prompt=PISTA,
        condition_on_previous_text=False,
    )
    return " ".join(s.text.strip() for s in segmentos).strip()


class PuedeDictar(BasePermission):
    message = "No tienes acceso a Nico AI."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        return u.is_superuser or (u.rol_id in roles.TODOS and u.puede_usar_agente)


class LimiteDictado(UserRateThrottle):
    rate = "30/min"


class TranscribirView(APIView):
    """POST multipart ``audio``: devuelve ``{texto}``."""

    permission_classes = [PuedeDictar]
    parser_classes = [MultiPartParser]
    throttle_classes = [LimiteDictado]

    def post(self, request):
        audio = request.FILES.get("audio")
        if audio is None or not audio.size:
            return Response({"audio": ["Falta el audio."]}, status=status.HTTP_400_BAD_REQUEST)
        if audio.size > MAX_BYTES:
            return Response(
                {"audio": ["El audio es demasiado largo."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            texto = transcribir(audio)
        except Exception:
            logger.exception("No se pudo transcribir el dictado")
            return Response(
                {"detail": "No se pudo convertir el audio a texto."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"texto": texto})
