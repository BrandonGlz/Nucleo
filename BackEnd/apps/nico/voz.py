"""Voz de Nico: convierte a audio (MP3) un fragmento de su respuesta.

Usa Piper, un motor de voz local, con la voz masculina ``es_MX-ald-medium``. Suena igual
en cualquier navegador y no depende de las voces del sistema (en Linux suelen ser
robóticas). El modelo se carga con la primera lectura y se libera tras unos minutos sin
uso (ocupa unos 220 MB). La web pide un fragmento por frase o grupo de frases y
reproduce uno mientras pide el siguiente, así la lectura no se corta.
"""

import io
import logging
import threading
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .transcripcion import PuedeDictar

logger = logging.getLogger(__name__)

LIBERAR_TRAS_S = 600
MAX_CARACTERES = 600

_voz = None
_candado = threading.Lock()
_reloj = None


def _liberar():
    global _voz
    with _candado:
        _voz = None


def _programar_liberacion():
    global _reloj
    if _reloj is not None:
        _reloj.cancel()
    _reloj = threading.Timer(LIBERAR_TRAS_S, _liberar)
    _reloj.daemon = True
    _reloj.start()


def ruta_modelo():
    return Path(settings.NUCLEO_PIPER_DIR).expanduser() / f"{settings.NUCLEO_PIPER_VOZ}.onnx"


def voz():
    global _voz
    with _candado:
        _programar_liberacion()
        if _voz is None:
            from piper import PiperVoice

            _voz = PiperVoice.load(str(ruta_modelo()))
        return _voz


def sintetizar_mp3(texto):
    """MP3 mono de 48 kbps con el texto leído por Nico."""
    import av
    import numpy as np
    from piper import SynthesisConfig

    v = voz()
    # Tono amigable: ritmo un poco más ágil que el base (length_scale < 1) y más variación de
    # entonación y de duración de sílabas (noise_scale y noise_w_scale) para que no suene plano.
    config = SynthesisConfig(
        length_scale=settings.NUCLEO_PIPER_RITMO,
        noise_scale=0.75,
        noise_w_scale=0.9,
    )
    trozos = [c.audio_int16_array for c in v.synthesize(texto, syn_config=config)]
    if not trozos:
        return b""
    muestras = np.concatenate(trozos)
    tasa = v.config.sample_rate
    salida = io.BytesIO()
    contenedor = av.open(salida, "w", format="mp3")
    flujo = contenedor.add_stream("libmp3lame", rate=tasa)
    flujo.bit_rate = 48000
    flujo.layout = "mono"
    cuadro = av.AudioFrame.from_ndarray(muestras.reshape(1, -1), format="s16", layout="mono")
    cuadro.sample_rate = tasa
    for paquete in flujo.encode(cuadro):
        contenedor.mux(paquete)
    for paquete in flujo.encode(None):
        contenedor.mux(paquete)
    contenedor.close()
    return salida.getvalue()


class VozSerializer(serializers.Serializer):
    texto = serializers.CharField(max_length=MAX_CARACTERES)


class LimiteVoz(UserRateThrottle):
    rate = "120/min"


class VozView(APIView):
    """POST {texto}: devuelve ``audio/mpeg`` con el texto leído por Nico."""

    permission_classes = [PuedeDictar]
    throttle_classes = [LimiteVoz]

    def post(self, request):
        entrada = VozSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        try:
            audio = sintetizar_mp3(entrada.validated_data["texto"])
        except Exception:
            logger.exception("No se pudo generar la voz de Nico")
            return Response(
                {"detail": "No se pudo generar la voz."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        respuesta = HttpResponse(audio, content_type="audio/mpeg")
        respuesta["Cache-Control"] = "no-store"
        return respuesta
