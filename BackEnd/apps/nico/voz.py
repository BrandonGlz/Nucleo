"""Voz de Nico: convierte a audio (MP3) un fragmento de su respuesta.

Usa Supertonic 2, un motor de voz local y abierto (ONNX, solo CPU), con la voz masculina ``M3``
(``NUCLEO_SUPERTONIC_ESTILO``): grave, tranquila y con entonación natural; lee el español con
seseo, como en México. Como respaldo se puede volver a Piper (``NUCLEO_VOZ_MOTOR=piper``). Solo
la usa la app móvil: suena igual en cualquier teléfono y no depende de las voces del sistema.

Antes de sintetizar, el texto se normaliza (``texto_voz.normalizar``): cifras, unidades, siglas,
fechas y horas pasan a palabras. Después se recortan los silencios de los bordes y se iguala el
volumen, así los fragmentos se encadenan sin saltos. El modelo se carga con la primera lectura y
se libera tras unos minutos sin uso (unos 330 MB con Supertonic); la app lo precalienta (GET) en
cuanto sabe que Nico va a hablar. Pide un fragmento por frase o grupo de frases (el primero,
corto) y reproduce uno mientras pide el siguiente.
"""

import io
import logging
import threading
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from common import roles

from .texto_voz import normalizar

logger = logging.getLogger(__name__)
# Supertonic anuncia en INFO cada modelo que carga; basta con sus avisos y errores.
logging.getLogger("supertonic").setLevel(logging.WARNING)

LIBERAR_TRAS_S = 600
MAX_CARACTERES = 600
SUPERTONIC_MODELO = "supertonic-2"
# Pausa entre oraciones cuando el motor las genera por separado (Piper, o textos largos en
# Supertonic): la de una lectura tranquila, sin que se sienta cortada.
PAUSA_ENTRE_ORACIONES_S = 0.28
# Silencio que se deja al principio y al final de cada fragmento: lo justo para no cortar la primera
# consonante. Sumado al cambio de fragmento en la app da la pausa natural entre oraciones.
MARGEN_INICIO_S = 0.05
MARGEN_FINAL_S = 0.08
VOLUMEN_RMS = 0.1  # unos -20 dBFS: igual en todos los fragmentos
TASA_MP3 = 22050

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


def _opciones_onnx():
    import onnxruntime as ort

    opciones = ort.SessionOptions()
    # Sin la reserva de memoria de ONNX Runtime: lo que usa cada lectura se devuelve al terminar
    # (Daphne tiene un tope de memoria).
    opciones.enable_cpu_mem_arena = False
    return opciones


class PuedeUsarVoz(BasePermission):
    """Quien puede usar Nico AI puede oír su voz (la app móvil la pide al servidor)."""

    message = "No tienes acceso a Nico AI."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        return u.is_superuser or (u.rol_id in roles.TODOS and u.puede_usar_agente)


class VozSupertonic:
    def __init__(self, carpeta):
        import onnxruntime as ort
        from supertonic.core import Supertonic
        from supertonic.loader import (
            load_configs,
            load_text_processor,
            load_voice_style_from_name,
        )

        opciones = _opciones_onnx()
        sesiones = [
            ort.InferenceSession(
                str(carpeta / "onnx" / f"{nombre}.onnx"),
                sess_options=opciones,
                providers=["CPUExecutionProvider"],
            )
            for nombre in ("duration_predictor", "text_encoder", "vector_estimator", "vocoder")
        ]
        self.motor = Supertonic(load_configs(carpeta), load_text_processor(carpeta), *sesiones)
        self.estilo = load_voice_style_from_name(carpeta, settings.NUCLEO_SUPERTONIC_ESTILO)
        self.tasa = self.motor.sample_rate

    def sintetizar(self, texto):
        import numpy as np
        from supertonic.utils import chunk_text

        procesador = self.motor.text_processor
        # Los signos de apertura (¡ ¿) le hacen saltarse a veces la primera palabra: la entonación
        # sale igual de los de cierre.
        texto = texto.replace("¡", "").replace("¿", "")
        _, raros = procesador.validate_text(texto)
        for caracter in raros:
            texto = texto.replace(caracter, " ")
        trozos = []
        for parte in chunk_text(texto, 300):
            audio = self._generar(parte)
            # En frases cortas el modelo a veces se come el principio (sale casi en silencio): si lo
            # audible ocupa menos de la mitad de lo generado, se repite una vez y se queda la mejor.
            if len(parte) < 120 and _audible(audio, self.tasa) < 0.5 * audio.size:
                otra = self._generar(parte)
                if _audible(otra, self.tasa) > _audible(audio, self.tasa):
                    audio = otra
            trozos.append(audio)
        return _unir(trozos, self.tasa) if trozos else np.zeros(0, dtype=np.float32)

    def _generar(self, parte):
        audio, _ = self.motor(
            [parte],
            self.estilo,
            settings.NUCLEO_SUPERTONIC_PASOS,
            settings.NUCLEO_SUPERTONIC_RITMO,
            "es",
        )
        return audio.reshape(-1)


class VozPiper:
    def __init__(self, ruta):
        import json

        import onnxruntime as ort
        from piper import PiperConfig, PiperVoice

        config = json.loads(Path(f"{ruta}.json").read_text(encoding="utf-8"))
        self.voz = PiperVoice(
            session=ort.InferenceSession(
                str(ruta), sess_options=_opciones_onnx(), providers=["CPUExecutionProvider"]
            ),
            config=PiperConfig.from_dict(config),
        )
        self.tasa = self.voz.config.sample_rate

    def sintetizar(self, texto):
        import numpy as np
        from piper import SynthesisConfig

        # Ritmo un poco más ágil que el base y algo de variación de entonación para que no suene
        # plano. El volumen se iguala después, sobre todo el fragmento.
        config = SynthesisConfig(
            length_scale=settings.NUCLEO_PIPER_RITMO,
            noise_scale=0.7,
            noise_w_scale=0.85,
            normalize_audio=False,
        )
        trozos = [c.audio_float_array for c in self.voz.synthesize(texto, syn_config=config)]
        return _unir(trozos, self.tasa) if trozos else np.zeros(0, dtype=np.float32)


def _unir(trozos, tasa):
    """Une oraciones con una pausa natural entre ellas (Piper las devuelve pegadas)."""
    import numpy as np

    pausa = np.zeros(int(PAUSA_ENTRE_ORACIONES_S * tasa), dtype=np.float32)
    salida = []
    for i, trozo in enumerate(trozos):
        if i:
            salida.append(pausa)
        salida.append(_recortar(np.asarray(trozo, dtype=np.float32), tasa, 0.0, 0.0))
    return np.concatenate(salida)


def _audible(audio, tasa):
    """Muestras entre el primer y el último sonido audible."""
    return _recortar(audio, tasa, 0.0, 0.0).size


def _recortar(audio, tasa, inicio_s, final_s):
    """Quita el silencio de los bordes y deja solo el margen indicado."""
    import numpy as np

    if not audio.size:
        return audio
    umbral = max(float(np.max(np.abs(audio))) * 0.02, 1e-4)
    sonoro = np.flatnonzero(np.abs(audio) > umbral)
    if not sonoro.size:
        return audio[:0]
    desde = max(int(sonoro[0]) - int(inicio_s * tasa), 0)
    hasta = min(int(sonoro[-1]) + 1 + int(final_s * tasa), audio.size)
    return audio[desde:hasta]


def pulir(audio, tasa):
    """Recorta bordes, iguala el volumen y suaviza la entrada y la salida (sin chasquidos)."""
    import numpy as np

    audio = _recortar(np.asarray(audio, dtype=np.float32), tasa, MARGEN_INICIO_S, MARGEN_FINAL_S)
    if not audio.size:
        return audio
    pico = float(np.max(np.abs(audio)))
    sonoro = audio[np.abs(audio) > pico * 0.05]
    rms = float(np.sqrt(np.mean(sonoro**2))) if sonoro.size else 0.0
    if rms > 0:
        audio = audio * min(VOLUMEN_RMS / rms, 0.95 / pico)
    rampa = min(int(0.005 * tasa), audio.size // 2)
    if rampa:
        curva = np.linspace(0.0, 1.0, rampa, dtype=np.float32)
        audio[:rampa] *= curva
        audio[-rampa:] *= curva[::-1]
    return np.clip(audio, -1.0, 1.0)


def a_mp3(audio, tasa):
    """MP3 mono de 48 kbps a partir de muestras en coma flotante (-1 a 1).

    Se codifica a 22.05 kHz (a 48 kbps el MP3 corta los agudos por encima de unos 11 kHz de todos
    modos) y con la calidad rápida de LAME: tarda menos de la mitad y suena igual.
    """
    import av
    import numpy as np

    muestras = (np.asarray(audio, dtype=np.float32) * 32767).astype(np.int16)
    salida = io.BytesIO()
    contenedor = av.open(salida, "w", format="mp3")
    flujo = contenedor.add_stream("libmp3lame", rate=TASA_MP3, options={"compression_level": "7"})
    flujo.bit_rate = 48000
    flujo.layout = "mono"
    cuadro = av.AudioFrame.from_ndarray(muestras.reshape(1, -1), format="s16", layout="mono")
    cuadro.sample_rate = tasa
    cuadros = [cuadro]
    if tasa != TASA_MP3:
        remuestreo = av.AudioResampler(format="s16p", layout="mono", rate=TASA_MP3)
        cuadros = remuestreo.resample(cuadro) + remuestreo.resample(None)
    for c in cuadros:
        for paquete in flujo.encode(c):
            contenedor.mux(paquete)
    for paquete in flujo.encode(None):
        contenedor.mux(paquete)
    contenedor.close()
    return salida.getvalue()


def carpeta_voces():
    return Path(settings.NUCLEO_VOZ_DIR).expanduser()


def ruta_modelo():
    if settings.NUCLEO_VOZ_MOTOR == "piper":
        return carpeta_voces() / f"{settings.NUCLEO_PIPER_VOZ}.onnx"
    return carpeta_voces() / SUPERTONIC_MODELO


def voz():
    global _voz
    with _candado:
        _programar_liberacion()
        if _voz is None:
            ruta = ruta_modelo()
            _voz = VozPiper(ruta) if settings.NUCLEO_VOZ_MOTOR == "piper" else VozSupertonic(ruta)
        return _voz


def precalentar():
    """Carga el modelo y hace una lectura corta, así la primera respuesta no espera la carga."""
    try:
        nuevo = _voz is None
        v = voz()
        if nuevo:
            v.sintetizar("Hola.")  # la primera inferencia reserva memoria y tarda el doble
    except Exception:
        logger.exception("No se pudo precalentar la voz de Nico")


def sintetizar_mp3(texto):
    """MP3 con el texto leído por Nico (vacío si no hay nada que leer)."""
    texto = normalizar(texto)
    if not texto:
        return b""
    v = voz()
    audio = pulir(v.sintetizar(texto), v.tasa)
    return a_mp3(audio, v.tasa) if audio.size else b""


class VozSerializer(serializers.Serializer):
    texto = serializers.CharField(max_length=MAX_CARACTERES)


class LimiteVoz(UserRateThrottle):
    rate = "120/min"


class VozView(APIView):
    """POST {texto}: devuelve ``audio/mpeg`` con el texto leído por Nico.

    GET: precalienta la voz (carga el modelo en segundo plano) y responde 204 al momento. La app lo
    pide en cuanto sabe que Nico va a hablar (al dictar o al enviar la pregunta).
    """

    permission_classes = [PuedeUsarVoz]
    throttle_classes = [LimiteVoz]

    def perform_content_negotiation(self, request, force=False):
        # La app pide «Accept: audio/mpeg»; la API solo tiene el renderizador JSON (para
        # los errores), así que sin forzar respondería 406 antes de llegar a generar el audio.
        return super().perform_content_negotiation(request, force=True)

    def get(self, request):
        threading.Thread(target=precalentar, daemon=True).start()
        return HttpResponse(status=204)

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
