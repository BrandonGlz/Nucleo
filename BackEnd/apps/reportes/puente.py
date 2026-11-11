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
import unicodedata
import uuid
from collections import defaultdict, deque

from django.conf import settings

from . import agente

ACTIVO_SEGUNDOS = 30  # sin consultar en este tiempo, el agente del dispositivo está inactivo
ESPERA_TOMAR = 20  # espera larga del ESP
MAX_EN_COLA = 2  # con más peticiones esperando, se responde con la predefinida sin esperar
CALENTAR_CADA = 240  # segundos: el modelo sigue cargado (keep_alive 10 min) mientras haya uso
NUMERO = re.compile(r"\d+(?:[.,]\d+)?")
SISTEMA = (
    "Eres Nico AI, el asistente del dispositivo de monitoreo ambiental {nombre}. Responde "
    "siempre y únicamente en español de México, aunque te escriban en otro idioma, en máximo "
    "dos frases claras, usando solo los datos que se te dan. No inventes cifras. Si los datos "
    "no alcanzan para responder, dilo. Nunca hagas pronósticos ni hables del futuro. Nunca "
    "inventes causas: si preguntan por qué, di solo lo que muestran los datos (si subió, bajó "
    "o salió del rango) y aclara que las lecturas no indican la causa."
)
# Meses y días de la semana: solo pueden aparecer si ya venían en la respuesta base.
FECHAS = re.compile(
    r"\b(" + "|".join(agente.MESES) + r"|lunes|martes|miercoles|jueves|viernes|sabado|domingo|"
    r"lun|mar|mie|jue|vie|sab|dom)\b"
)
# El modelo pequeño tiende a inventar explicaciones: si afirma una causa, se descarta.
CAUSA_INVENTADA = re.compile(
    r"\b(debido a|se debe|a causa|causad|por culpa|provocad|ocasionad|gracias a)", re.I
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

    def pendientes(self, codigo):
        return len(self.colas[codigo])

    def una_vez(self, clave, segundos):
        if time.time() < self.vistos.get(clave, 0):
            return False
        self.vistos[clave] = time.time() + segundos
        return True

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

    def pendientes(self, codigo):
        return self.r.llen(f"puente:cola:{codigo}")

    def una_vez(self, clave, segundos):
        return bool(self.r.set(f"puente:{clave}", 1, ex=segundos, nx=True))

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


def con_puente(dispositivo):
    """El dispositivo tiene ESP32 físico: su agente depende de él y puede usar la IA."""
    return habilitado() and dispositivo.codigo_mqtt in settings.IA_PUENTE_DISPOSITIVOS


def activo(dispositivo):
    """Un dispositivo simulado siempre está activo; uno físico, si su ESP está consultando."""
    return not con_puente(dispositivo) or cola().activo(dispositivo.codigo_mqtt)


def tomar(codigo, espera=ESPERA_TOMAR):
    """Lo llama el ESP: marca su dispositivo como activo y espera una petición."""
    cola().visto(codigo)
    fin = time.time() + espera
    while (resta := fin - time.time()) > 0:
        trabajo = cola().tomar(codigo, max(1, round(resta)))
        if trabajo is None:
            break
        # Una petición que ya venció (el usuario ya recibió la predefinida) no se procesa.
        if trabajo.get("vence", 0) >= time.time():
            cola().visto(codigo)
            return trabajo
    cola().visto(codigo)
    return None


def entregar(codigo, id_, texto=None, error=None, tokens_entrada=0, tokens_salida=0):
    cola().visto(codigo)
    cola().entregar(
        id_,
        {
            "texto": texto,
            "error": error,
            "tokens_entrada": int(tokens_entrada or 0),
            "tokens_salida": int(tokens_salida or 0),
        },
    )


def _tokens(r):
    return {
        "tokens_entrada": r.get("tokens_entrada", 0),
        "tokens_salida": r.get("tokens_salida", 0),
    }


def _cuerpo(dispositivo, mensajes, num_predict, formato=None):
    cuerpo = {
        "model": settings.IA_MODELO_LOCAL,
        "stream": False,
        "keep_alive": "10m",
        # Contexto corto y pocas palabras: en la CPU del servidor, 0.5b responde en 2-5 s.
        # 3 hilos de 4 para que la API y MQTT sigan atendiendo mientras la IA trabaja.
        "options": {
            "num_predict": num_predict,
            "num_ctx": 1024,
            "temperature": 0.2,
            "top_p": 0.9,
            "num_thread": 3,
        },
        "messages": mensajes,
    }
    if formato:
        cuerpo["format"] = formato  # salida estructurada: Ollama solo puede devolver ese JSON
        cuerpo["options"]["temperature"] = 0
    return cuerpo


def calentar(dispositivo):
    """Carga el modelo antes de la primera pregunta (al abrir el chat), una vez cada 4 min."""
    if not con_puente(dispositivo) or not cola().una_vez("calentar", CALENTAR_CADA):
        return
    if cola().pendientes(dispositivo.codigo_mqtt):
        return
    cola().poner(
        dispositivo.codigo_mqtt,
        {
            "id": uuid.uuid4().hex,
            "ruta": "/api/chat",
            "vence": time.time() + 30,
            "calentar": True,
            "cuerpo": _cuerpo(dispositivo, [{"role": "user", "content": "hola"}], 1),
        },
    )


def _limpiar(texto, permitidos, base=""):
    """Máximo dos frases y sin cifras ni fechas inventadas: toda cifra debe venir de los
    datos y todo mes o día de la semana, del texto base. Si no, devuelve ``None``."""
    texto = re.sub(r"\s+", " ", texto.replace("*", "")).strip()
    frases = re.split(r"(?<=[.!?])\s+", texto)
    texto = " ".join(frases[:2])[:320].strip()
    if not agente.es_espanol(texto):  # el modelo respondió en otro idioma
        return None
    if CAUSA_INVENTADA.search(texto):
        return None
    if FECHAS.findall(agente._normalizar(texto)) and not set(
        FECHAS.findall(agente._normalizar(texto))
    ) <= set(FECHAS.findall(agente._normalizar(base))):
        return None
    for n in NUMERO.findall(texto):
        if round(float(n.replace(",", ".")), 1) not in permitidos:
            return None
    return texto or None


def redactar(dispositivo, pregunta, base, datos, espera=None):
    """Pide a la IA, por el ESP del dispositivo, una respuesta corta a partir del texto
    predefinido (``base``) y de las cifras (``datos``). Devuelve el texto o ``None`` si no llegó
    a tiempo, la cola está llena o inventó cifras: entonces se usa la respuesta predefinida.
    Devuelve ``(texto | None, tokens)``."""
    codigo = dispositivo.codigo_mqtt
    if cola().pendientes(codigo) >= MAX_EN_COLA:
        return None, {}
    espera = espera or settings.IA_ESPERA_SEGUNDOS
    cifras = "; ".join(f"{k}={v}" for k, v in datos.items())
    trabajo = {
        "id": uuid.uuid4().hex,
        "ruta": "/api/chat",
        "vence": time.time() + espera,
        "cuerpo": _cuerpo(
            dispositivo,
            [
                # El mensaje de sistema es igual en cada petición del dispositivo: Ollama reutiliza
                # su caché y solo procesa lo nuevo.
                {"role": "system", "content": SISTEMA.format(nombre=dispositivo.nombre)},
                {"role": "user", "content": f"Datos: {base} ({cifras})\nPregunta: {pregunta}"},
            ],
            90,
        ),
    }
    cola().poner(codigo, trabajo)
    r = cola().esperar(trabajo["id"], espera)
    if not r or r.get("error") or not (r.get("texto") or "").strip():
        return None, _tokens(r or {})
    permitidos = {round(float(n.replace(",", ".")), 1) for n in NUMERO.findall(base)}
    permitidos |= {round(float(v), 1) for v in datos.values() if isinstance(v, int | float)}
    permitidos |= {float(n) for n in range(0, 25)}  # «2 frases», «7 días», horas del día…
    return _limpiar(r["texto"], permitidos, base), _tokens(r)


# ── Herramientas: la IA solo elige cuál usar ────────────────────────────────────────────
# Cuando las reglas no entienden la pregunta, el modelo la clasifica en una de estas
# herramientas (JSON forzado con «format»). Con eso se arma la pregunta canónica que las
# reglas sí entienden y la respuesta sale de las funciones de siempre: cifras exactas y una
# sola pasada corta de IA (~20 tokens de salida).
HERRAMIENTAS = ("variable", "alertas", "conexion", "grafica", "comparativa", "reporte", "ninguna")
VARIABLES_IA = ("temperatura", "humedad", "calidad del aire", "ninguna")
PERIODOS_IA = (
    "ahora",
    "hoy",
    "ayer",
    "esta semana",
    "la semana pasada",
    "este mes",
    "el mes pasado",
    "los ultimos 7 dias",
    "los ultimos 30 dias",
    "este año",
)
# Qué cifra se pide de la variable (la regla «_dato_pedido» la reconoce en la pregunta).
DATOS_IA = ("general", "maximo", "minimo", "promedio")
ESQUEMA = {
    "type": "object",
    "properties": {
        "herramienta": {"type": "string", "enum": list(HERRAMIENTAS)},
        "variable": {"type": "string", "enum": list(VARIABLES_IA)},
        "periodo": {"type": "string", "enum": list(PERIODOS_IA)},
        "dato": {"type": "string", "enum": list(DATOS_IA)},
    },
    "required": ["herramienta", "variable", "periodo", "dato"],
}
CLASIFICAR = (
    "Clasifica la petición sobre un dispositivo de monitoreo ambiental. Herramientas: variable "
    "(cómo está o estuvo la temperatura, humedad o calidad del aire), alertas, conexion "
    "(batería, señal, si está en línea), grafica (ver cómo ha ido una variable), comparativa "
    "(comparar dos periodos), reporte (documento PDF), ninguna (no es sobre el ambiente ni los "
    "sensores). Calor o frío es temperatura; aire, CO2 u olor es calidad del aire. «Estos días» "
    "es los ultimos 7 dias. Dato: maximo (lo más alto, el pico), minimo (lo más bajo), "
    "promedio, o general. Ejemplos (herramienta, variable, periodo, dato):\n"
    "¿qué tal anda el ambiente? → variable, ninguna, ahora, general\n"
    "¿cómo ha ido el calor estos días? → grafica, temperatura, los ultimos 7 dias, general\n"
    "¿hasta dónde llegó el bochorno ayer? → variable, humedad, ayer, maximo\n"
    "¿ha sonado algo raro hoy? → alertas, ninguna, hoy, general\n"
    "¿sigue vivo el aparato? → conexion, ninguna, ahora, general\n"
    "¿quién ganó el partido? → ninguna, ninguna, ahora, general\n"
    "Responde solo el JSON."
)

# Palabras del dominio: si la pregunta no tiene ninguna, no vale la pena preguntarle a la IA
# (se contesta «no entendida» al instante y sin tokens).
DOMINIO = re.compile(
    r"temperatur|calor|frio|caliente|grados|humed|seco|aire|co2|eco2|olor|ambiente|clima|"
    r"sensor|lectura|medici|valor|nivel|alerta|alarma|aviso|umbral|limite|rango|bateria|"
    r"senal|wifi|conex|linea|apagad|encendid|vivo|funciona|aparato|equipo|dispositivo|"
    r"reporte|informe|pdf|grafic|tendencia|compar|historial|promedio|maximo|minimo|"
    r"bodega|almacen|area|zona|sala|cuarto|hoy|ayer|semana|mes|dia|hora|raro|normal|bien|mal"
)


def del_dominio(pregunta):
    texto = unicodedata.normalize("NFKD", pregunta.lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return bool(DOMINIO.search(texto))


def _canonica(h, variable, periodo, dato="general"):
    """Pregunta en las palabras que entienden las reglas."""
    de_var = "" if variable == "ninguna" else f" de {variable}"
    de_periodo = "" if periodo == "ahora" else f" de {periodo}".replace(" de el ", " del ")
    return {
        # Sin variable: las reglas responden con la que tuvo más alertas en el periodo.
        "variable": (
            f"¿cómo están las lecturas{de_periodo}?"
            if variable == "ninguna"
            else f"¿cómo está la {variable}{de_periodo}?"
            if dato == "general"
            else f"¿cuál fue el {dato} de {variable}{de_periodo}?"
        ),
        "alertas": f"alertas{de_periodo}",
        "conexion": "estado de conexión",
        "grafica": f"gráfica{de_var}{de_periodo}",
        "comparativa": f"compara{de_var} {de_periodo.strip() or 'de esta semana'}",
        "reporte": f"reporte{de_periodo or ' de esta semana'}",
    }.get(h)


def enrutar(dispositivo, pregunta, espera=None):
    """Pregunta canónica elegida por la IA (o ``None``) y los tokens usados."""
    codigo = dispositivo.codigo_mqtt
    if cola().pendientes(codigo) >= MAX_EN_COLA:
        return None, {}
    espera = espera or settings.IA_ESPERA_SEGUNDOS
    trabajo = {
        "id": uuid.uuid4().hex,
        "ruta": "/api/chat",
        "vence": time.time() + espera,
        "cuerpo": _cuerpo(
            dispositivo,
            [{"role": "system", "content": CLASIFICAR}, {"role": "user", "content": pregunta}],
            40,
            formato=ESQUEMA,
        ),
    }
    cola().poner(codigo, trabajo)
    r = cola().esperar(trabajo["id"], espera)
    if not r or r.get("error"):
        return None, _tokens(r or {})
    try:
        elegido = json.loads(r.get("texto") or "")
        h, v, p = elegido["herramienta"], elegido["variable"], elegido["periodo"]
        dato = elegido.get("dato", "general")
    except (ValueError, KeyError, TypeError):
        return None, _tokens(r)
    if (
        h not in HERRAMIENTAS
        or v not in VARIABLES_IA
        or p not in PERIODOS_IA
        or dato not in DATOS_IA
    ):
        return None, _tokens(r)
    # Periodo y dato pedido los sacan mejor las reglas de la pregunta original: si los
    # encuentran, la IA solo aporta la herramienta y la variable.
    nombra_periodo = agente.periodo_de(pregunta)[2] != agente.periodo_de("")[2]
    if nombra_periodo or agente._dato_pedido(pregunta):
        canonica = _canonica(h, v, "ahora", dato).replace(" de esta semana", "")
        return f"{canonica} · {pregunta}", _tokens(r)
    return _canonica(h, v, p, dato), _tokens(r)
