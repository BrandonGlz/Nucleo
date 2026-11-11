"""Puente de Nico AI: el ESP32 de cada dispositivo lleva las peticiones a la IA (Ollama).

Hay un agente por dispositivo y su ESP32 es el puente. El ESP consulta al backend por HTTPS
(``GET /api/v1/puente/tomar/``, espera larga de hasta 20 s); si hay una petición para él, la
envía a Ollama a través de Caddy (``/puente-ia/``) y devuelve la respuesta
(``POST /api/v1/puente/entregar/``). Cada consulta marca al dispositivo como activo; si su ESP
deja de consultar (sin corriente o sin red), su agente queda inactivo y la web y la app no
le pueden preguntar.

Con ``IA_PUENTE_CLAVE`` vacía el puente está apagado: el agente responde solo con las
respuestas predefinidas y no depende de ningún ESP.

La cola vive en Redis (``REDIS_URL``) para que la compartan los procesos de daphne; sin Redis
(pruebas y desarrollo) se usa una cola en memoria del proceso.
"""

import json
import re
import threading
import time
import uuid
from collections import defaultdict, deque

from django.conf import settings

from . import agente

ACTIVO_SEGUNDOS = 30  # sin consultar en este tiempo, el agente del dispositivo está inactivo
ESPERA_TOMAR = 20  # espera larga del ESP
SISTEMA = (
    "Eres Nico AI, el asistente del dispositivo de monitoreo ambiental {nombre}. Responde en "
    "español, en máximo dos frases claras, usando solo los datos que se te dan. No inventes "
    "cifras. Si los datos no alcanzan para responder, dilo."
)
# Lo que la plantilla no resuelve y sí necesita redactar: explicar, opinar, recomendar o
# reformular. Lo demás se responde sin IA.
PIDE_IA = re.compile(
    r"\b(por ?que|porque|explica|explicame|significa|recomiend|conviene|deberia|que hago|"
    r"que hacer|es grave|es normal|es malo|es bueno|preocup|resume|resumen corto|"
    r"mas simple|en pocas palabras|que opinas|consejo|sugier|como mejoro|como bajo|como subo)"
)


def habilitado():
    return bool(settings.IA_PUENTE_CLAVE)


def pide_ia(pregunta):
    return bool(PIDE_IA.search(agente._normalizar(pregunta)))


class _Memoria:
    """Cola en memoria (un solo proceso): para pruebas y desarrollo sin Redis."""

    def __init__(self):
        self.cond = threading.Condition()
        self.colas = defaultdict(deque)
        self.respuestas = {}
        self.vistos = {}

    def visto(self, codigo):
        self.vistos[codigo] = time.time()

    def activo(self, codigo):
        return time.time() - self.vistos.get(codigo, 0) < ACTIVO_SEGUNDOS

    def poner(self, codigo, trabajo):
        with self.cond:
            self.colas[codigo].append(json.dumps(trabajo))
            self.cond.notify_all()

    def tomar(self, codigo, espera):
        fin = time.time() + espera
        with self.cond:
            while not self.colas[codigo]:
                resta = fin - time.time()
                if resta <= 0:
                    return None
                self.cond.wait(resta)
            return json.loads(self.colas[codigo].popleft())

    def entregar(self, id_, datos):
        with self.cond:
            self.respuestas[id_] = json.dumps(datos)
            self.cond.notify_all()

    def esperar(self, id_, espera):
        fin = time.time() + espera
        with self.cond:
            while id_ not in self.respuestas:
                resta = fin - time.time()
                if resta <= 0:
                    return None
                self.cond.wait(resta)
            return json.loads(self.respuestas.pop(id_))


class _Redis:
    def __init__(self, url):
        import redis

        self.r = redis.Redis.from_url(url, socket_timeout=ESPERA_TOMAR + 5)

    def visto(self, codigo):
        self.r.set(f"puente:visto:{codigo}", 1, ex=ACTIVO_SEGUNDOS)

    def activo(self, codigo):
        return bool(self.r.exists(f"puente:visto:{codigo}"))

    def poner(self, codigo, trabajo):
        clave = f"puente:cola:{codigo}"
        self.r.rpush(clave, json.dumps(trabajo))
        self.r.expire(clave, 60)

    def tomar(self, codigo, espera):
        r = self.r.blpop([f"puente:cola:{codigo}"], timeout=espera)
        return json.loads(r[1]) if r else None

    def entregar(self, id_, datos):
        clave = f"puente:resp:{id_}"
        self.r.rpush(clave, json.dumps(datos))
        self.r.expire(clave, 60)

    def esperar(self, id_, espera):
        r = self.r.blpop([f"puente:resp:{id_}"], timeout=max(1, round(espera)))
        return json.loads(r[1]) if r else None


_cola = None


def cola():
    global _cola
    if _cola is None:
        _cola = _Redis(settings.REDIS_URL) if settings.REDIS_URL else _Memoria()
    return _cola


def activo(dispositivo):
    return not habilitado() or cola().activo(dispositivo.codigo_mqtt)


def tomar(codigo, espera=ESPERA_TOMAR):
    """Lo llama el ESP: marca su dispositivo como activo y espera una petición."""
    cola().visto(codigo)
    trabajo = cola().tomar(codigo, espera)
    cola().visto(codigo)
    return trabajo


def entregar(codigo, id_, texto=None, error=None):
    cola().visto(codigo)
    cola().entregar(id_, {"texto": texto, "error": error})


def redactar(dispositivo, pregunta, datos, espera=None):
    """Pide a la IA, por el ESP del dispositivo, una respuesta corta a partir de ``datos``
    (el texto predefinido con las cifras). Devuelve el texto o ``None`` si no llegó a tiempo."""
    trabajo = {
        "id": uuid.uuid4().hex,
        "ruta": "/api/chat",
        "cuerpo": {
            "model": settings.IA_MODELO_LOCAL,
            "stream": False,
            "keep_alive": "10m",
            "options": {"num_predict": 90, "num_ctx": 1024, "temperature": 0.3, "num_thread": 3},
            "messages": [
                {"role": "system", "content": SISTEMA.format(nombre=dispositivo.nombre)},
                {"role": "user", "content": f"Datos: {datos}\nPregunta: {pregunta}"},
            ],
        },
    }
    cola().poner(dispositivo.codigo_mqtt, trabajo)
    r = cola().esperar(trabajo["id"], espera or settings.IA_ESPERA_SEGUNDOS)
    if not r or r.get("error") or not (r.get("texto") or "").strip():
        return None
    return r["texto"].strip()
