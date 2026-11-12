"""Puente de Nico AI: el ESP32 de cada dispositivo es la llave de su agente.

Hay un agente por dispositivo y su ESP32 lo habilita, con poca carga para que los sensores
vayan primero:

- **Vida:** el ESP publica un latido por MQTT cada 20 s (``nucleo/devices/<c>/latido``, con su
  diagnóstico de red) y deja como último mensaje ``{"estado": "offline"}``: si se apaga o pierde
  la red, el broker lo publica y el agente se desactiva al instante. Sin latido ni lecturas en
  ``ACTIVO_SEGUNDOS``, también queda inactivo.
- **Puente:** cada petición a la IA pasa por el ESP. El servidor le publica ``{id, reto}`` en
  ``.../puente/peticion`` y el ESP responde en ``.../puente/autoriza`` con la firma HMAC-SHA256
  de ``codigo:id:reto`` hecha con ``IA_PUENTE_CLAVE``. Solo con esa firma el servidor llama a
  Ollama (``IA_OLLAMA_URL``). El ESP no carga con la IA: firma unos bytes y sigue midiendo.
- **Respaldo:** si la red bloquea MQTT, el ESP consulta ``GET /api/v1/puente/tomar/`` por HTTPS
  con la clave cada 10 s; esa consulta lo marca activo y autoriza lo que esté esperando.

El diagnóstico del ESP (red, señal, reconexiones, última falla, memoria libre) se guarda por
dispositivo para distinguir una red que falla de un ESP que falla
(``manage.py puente_diagnostico``).

Con ``IA_PUENTE_CLAVE`` vacía el puente está apagado: el agente responde solo con las
respuestas predefinidas y no depende de ningún ESP.

La cola vive en Redis (``REDIS_URL``) para que la compartan los procesos de daphne; sin Redis
(pruebas y desarrollo) se usa una cola en memoria del proceso.
"""

import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import unicodedata
import uuid
from collections import defaultdict, deque

from django.conf import settings

from . import agente

# Sin consultar en este tiempo, el agente del dispositivo está inactivo. 75 s toleran un corte
# breve del Wi-Fi del ESP (reconectar y volver a consultar) sin que el agente se apague en la web.
ACTIVO_SEGUNDOS = 75
# Tiempo máximo para que el ESP firme una petición: por MQTT tarda menos de 1 s; por el
# respaldo HTTPS (consulta cada 10 s) puede tardar hasta la siguiente consulta.
ESPERA_AUTORIZA = 12
MAX_EN_COLA = 2  # con más peticiones esperando, se responde con la predefinida sin esperar
CALENTAR_CADA = 600  # segundos: el modelo sigue cargado (keep_alive 30 min) mientras haya uso
NUMERO = re.compile(r"\d+(?:[.,]\d+)?")
SISTEMA = (
    "Eres Nico AI, el compañero de monitoreo y gestión del dispositivo ambiental {nombre}: "
    "cercano, atento y práctico, hablas de tú y con calidez, como un colega que cuida el "
    "dispositivo; directo y serio cuando algo está fuera de rango. Responde "
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
    """Estado en memoria (un solo proceso): para pruebas y desarrollo sin Redis."""

    def __init__(self):
        self.cond = threading.Condition()
        self.vistos = {}
        self.en_curso = defaultdict(int)
        self.salida = deque()
        self.retos = {}
        self.diags = {}
        self.autorizados = set()
        self.esperando = defaultdict(set)

    def visto(self, codigo):
        self.vistos[codigo] = time.time()

    def olvidar(self, codigo):
        self.vistos.pop(codigo, None)

    def activo(self, codigo):
        return time.time() - self.vistos.get(codigo, 0) < ACTIVO_SEGUNDOS

    def una_vez(self, clave, segundos):
        if time.time() < self.vistos.get(clave, 0):
            return False
        self.vistos[clave] = time.time() + segundos
        return True

    def pendientes(self, codigo):
        return self.en_curso[codigo]

    def empezar(self, codigo):
        self.en_curso[codigo] += 1

    def terminar(self, codigo):
        self.en_curso[codigo] = max(0, self.en_curso[codigo] - 1)

    def publicar(self, topico, carga):
        with self.cond:
            self.salida.append((topico, carga))
            self.cond.notify_all()

    def siguiente_salida(self, espera):
        fin = time.time() + espera
        with self.cond:
            while not self.salida:
                resta = fin - time.time()
                if resta <= 0:
                    return None
                self.cond.wait(resta)
            return self.salida.popleft()

    def guardar_diag(self, codigo, valor):
        self.diags[codigo] = (time.time() + DIAG_SEGUNDOS, valor)

    def diag(self, codigo):
        vence, valor = self.diags.get(codigo, (0, None))
        return valor if time.time() < vence else None

    def guardar_reto(self, id_, codigo, reto):
        self.retos[id_] = (codigo, reto)
        self.esperando[codigo].add(id_)

    def reto_de(self, id_):
        return self.retos.get(id_)

    def esperando_de(self, codigo):
        return list(self.esperando[codigo])

    def autorizar(self, id_):
        with self.cond:
            self.autorizados.add(id_)
            self.cond.notify_all()

    def esperar_autorizacion(self, id_, espera):
        fin = time.time() + espera
        with self.cond:
            while id_ not in self.autorizados:
                resta = fin - time.time()
                if resta <= 0:
                    break
                self.cond.wait(resta)
            ok = id_ in self.autorizados
            self.autorizados.discard(id_)
            codigo, _ = self.retos.pop(id_, (None, None))
            if codigo:
                self.esperando[codigo].discard(id_)
            return ok


class _Redis:
    def __init__(self, url):
        import redis

        self.r = redis.Redis.from_url(url, socket_timeout=ESPERA_AUTORIZA + 10)

    def visto(self, codigo):
        self.r.set(f"puente:visto:{codigo}", 1, ex=ACTIVO_SEGUNDOS)

    def olvidar(self, codigo):
        self.r.delete(f"puente:visto:{codigo}")

    def activo(self, codigo):
        return bool(self.r.exists(f"puente:visto:{codigo}"))

    def una_vez(self, clave, segundos):
        return bool(self.r.set(f"puente:{clave}", 1, ex=segundos, nx=True))

    def pendientes(self, codigo):
        return int(self.r.get(f"puente:curso:{codigo}") or 0)

    def empezar(self, codigo):
        self.r.incr(f"puente:curso:{codigo}")
        self.r.expire(f"puente:curso:{codigo}", 120)

    def terminar(self, codigo):
        if self.r.decr(f"puente:curso:{codigo}") < 0:
            self.r.set(f"puente:curso:{codigo}", 0, ex=120)

    def publicar(self, topico, carga):
        self.r.rpush("puente:salida", json.dumps([topico, carga]))
        self.r.expire("puente:salida", 60)

    def siguiente_salida(self, espera):
        r = self.r.blpop(["puente:salida"], timeout=max(1, round(espera)))
        return tuple(json.loads(r[1])) if r else None

    def guardar_diag(self, codigo, valor):
        self.r.set(f"puente:diag:{codigo}", json.dumps(valor), ex=DIAG_SEGUNDOS)

    def diag(self, codigo):
        v = self.r.get(f"puente:diag:{codigo}")
        return json.loads(v) if v else None

    def guardar_reto(self, id_, codigo, reto):
        self.r.set(f"puente:reto:{id_}", json.dumps([codigo, reto]), ex=60)
        self.r.sadd(f"puente:esperando:{codigo}", id_)
        self.r.expire(f"puente:esperando:{codigo}", 60)

    def reto_de(self, id_):
        v = self.r.get(f"puente:reto:{id_}")
        return tuple(json.loads(v)) if v else None

    def esperando_de(self, codigo):
        return [v.decode() for v in self.r.smembers(f"puente:esperando:{codigo}")]

    def autorizar(self, id_):
        self.r.rpush(f"puente:ok:{id_}", 1)
        self.r.expire(f"puente:ok:{id_}", 60)

    def esperar_autorizacion(self, id_, espera):
        ok = bool(self.r.blpop([f"puente:ok:{id_}"], timeout=max(1, round(espera))))
        reto = self.reto_de(id_)
        if reto:
            self.r.srem(f"puente:esperando:{reto[0]}", id_)
        self.r.delete(f"puente:reto:{id_}")
        return ok


_cola = None


def cola():
    global _cola
    if _cola is None:
        _cola = _Redis(settings.REDIS_URL) if settings.REDIS_URL else _Memoria()
    return _cola


def con_puente(dispositivo):
    """El dispositivo tiene ESP32 físico: su agente depende de él y puede usar la IA."""
    from apps.reportes import carga

    return (
        habilitado()
        and dispositivo.codigo_mqtt in settings.IA_PUENTE_DISPOSITIVOS
        and not carga.ia_suspendida()
    )


def activo(dispositivo):
    """Un dispositivo simulado siempre está activo; uno físico, si su ESP late."""
    return not con_puente(dispositivo) or cola().activo(dispositivo.codigo_mqtt)


# ── Lo que llega del ESP ─────────────────────────────────────────────────────────────────
DIAG_SEGUNDOS = 7 * 24 * 3600


def registrar_diagnostico(codigo, diag):
    """Guarda el último diagnóstico que mandó el ESP (``clave=valor;...``)."""
    if not diag:
        return
    datos = {}
    for parte in str(diag)[:400].split(";"):
        clave, _, valor = parte.partition("=")
        if clave.strip():
            datos[clave.strip()[:20]] = valor.strip()[:60]
    # En Redis (no en la caché del proceso): lo escribe escuchar_mqtt y lo leen la API y
    # el comando puente_diagnostico.
    cola().guardar_diag(codigo, {"datos": datos, "hora": time.time()})


def diagnostico(codigo):
    return cola().diag(codigo)


def firma(codigo, id_, reto):
    """La que calcula el ESP con la clave del puente: prueba que la petición pasó por él."""
    mensaje = f"{codigo}:{id_}:{reto}".encode()
    return hmac.new(settings.IA_PUENTE_CLAVE.encode(), mensaje, hashlib.sha256).hexdigest()


def recibir_latido(codigo, carga):
    """Latido del ESP por MQTT (o lecturas): marca el dispositivo activo. ``estado=offline``
    es su último mensaje (lo publica el broker al perderlo): se desactiva al instante."""
    if isinstance(carga, dict) and carga.get("estado") == "offline":
        cola().olvidar(codigo)
        return
    cola().visto(codigo)
    if isinstance(carga, dict):
        registrar_diagnostico(codigo, carga.get("diag"))


def recibir_autorizacion(codigo, carga):
    """El ESP firmó la petición: el servidor ya puede usar la IA para ella."""
    id_ = str(carga.get("id", ""))
    reto = cola().reto_de(id_)
    if not reto or reto[0] != codigo:
        return False
    if not hmac.compare_digest(str(carga.get("firma", "")), firma(codigo, id_, reto[1])):
        return False
    cola().visto(codigo)
    cola().autorizar(id_)
    return True


def latido_https(codigo, diag=None):
    """Respaldo cuando la red bloquea MQTT: el ESP consulta por HTTPS con la clave del
    puente. La consulta misma lo marca activo y autoriza lo que esté esperando."""
    cola().visto(codigo)
    registrar_diagnostico(codigo, diag)
    autorizadas = 0
    for id_ in cola().esperando_de(codigo):
        cola().autorizar(id_)
        autorizadas += 1
    return autorizadas


# ── Ejecución ────────────────────────────────────────────────────────────────────────────
def _llamar_ia(trabajo, espera):
    """Llama a Ollama desde el servidor."""
    import urllib.request

    peticion = urllib.request.Request(
        settings.IA_OLLAMA_URL.rstrip("/") + trabajo["ruta"],
        data=json.dumps(trabajo["cuerpo"]).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=espera) as r:
            datos = json.loads(r.read())
    except Exception as e:  # noqa: BLE001 - cualquier falla se informa como error
        return {"texto": None, "error": f"Sin respuesta de la IA: {e}"}
    return {
        "texto": (datos.get("message") or {}).get("content", ""),
        "error": None,
        "tokens_entrada": int(datos.get("prompt_eval_count") or 0),
        "tokens_salida": int(datos.get("eval_count") or 0),
    }


def _autorizar(codigo, trabajo):
    """Pide al ESP que firme la petición y espera su firma (por MQTT llega en menos de un
    segundo; por el respaldo HTTPS, en la siguiente consulta)."""
    reto = secrets.token_hex(8)
    cola().guardar_reto(trabajo["id"], codigo, reto)
    cola().publicar(
        settings.MQTT_TOPIC_PUENTE_PETICION.format(codigo_mqtt=codigo),
        {"id": trabajo["id"], "reto": reto},
    )
    return cola().esperar_autorizacion(trabajo["id"], ESPERA_AUTORIZA)


def _tokens(r):
    return {
        "tokens_entrada": r.get("tokens_entrada", 0),
        "tokens_salida": r.get("tokens_salida", 0),
    }


def _cuerpo(dispositivo, mensajes, num_predict, formato=None):
    cuerpo = {
        "model": settings.IA_MODELO_LOCAL,
        "stream": False,
        "keep_alive": "30m",
        # Contexto corto y pocas palabras: en la CPU del servidor, 1.5b responde en 4-6 s (dos
        # a la vez, ~13 s).
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


# Respuestas de la IA ya redactadas: la misma petición (mismo modelo, instrucciones, hechos y
# mensaje) en los siguientes 15 min se contesta sin volver a ocupar el modelo. Con el modelo
# compartido entre plataformas, esto evita repetir trabajo cuando varios preguntan lo mismo.
CACHE_IA_SEGUNDOS = 15 * 60


def _ejecutar(codigo, trabajo, espera):
    """Pide la firma del ESP y, con ella, ejecuta la IA en el servidor. Si la misma petición ya
    se hizo, la toma de la caché (sin IA, pero también con el ESP vivo)."""
    from django.core.cache import cache

    cuerpo = trabajo["cuerpo"]
    clave = (
        "nico-ia:"
        + hashlib.sha256(
            json.dumps(
                [cuerpo["model"], cuerpo["messages"], cuerpo.get("format")], sort_keys=True
            ).encode()
        ).hexdigest()
    )
    guardada = cache.get(clave)
    if guardada is not None:
        return {**guardada, "tokens_entrada": 0, "tokens_salida": 0, "en_cache": True}
    cola().empezar(codigo)
    try:
        if not _autorizar(codigo, trabajo):
            return {"texto": None, "error": "El ESP no autorizó la petición a tiempo."}
        r = _llamar_ia(trabajo, espera)
    finally:
        cola().terminar(codigo)
    if r and not r.get("error") and (r.get("texto") or "").strip():
        cache.set(clave, r, CACHE_IA_SEGUNDOS)
    return r


def calentar(dispositivo):
    """Carga el modelo antes de la primera pregunta (al abrir el chat), una vez cada 10 min.
    Solo con el ESP vivo; no hace falta su firma porque no responde nada a nadie."""
    if not con_puente(dispositivo) or not activo(dispositivo):
        return
    if not cola().una_vez("calentar", CALENTAR_CADA):
        return
    trabajo = {
        "ruta": "/api/chat",
        "cuerpo": _cuerpo(dispositivo, [{"role": "user", "content": "hola"}], 1),
    }
    threading.Thread(target=_llamar_ia, args=(trabajo, 60), daemon=True).start()


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
    """Pide a la IA del servidor, con la firma del ESP del dispositivo, una respuesta corta a
    partir del texto predefinido (``base``) y de las cifras (``datos``). Devuelve el texto o
    ``None`` si no llegó a tiempo, la cola está llena o inventó cifras: entonces se usa la
    respuesta predefinida.
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
                {
                    "role": "user",
                    "content": f"Texto base: {base}\nCifras: {cifras}\nPregunta: {pregunta}\n"
                    "Responde la pregunta reescribiendo el texto base de forma más clara y breve. "
                    "No agregues cifras, fechas ni causas que no estén en el texto base.",
                },
            ],
            70,  # dos frases cortas: menos tokens, menos espera con el modelo 1.5b
        ),
    }
    r = _ejecutar(codigo, trabajo, espera)
    if not r or r.get("error") or not (r.get("texto") or "").strip():
        return None, _tokens(r or {})
    permitidos = {round(float(n.replace(",", ".")), 1) for n in NUMERO.findall(base)}
    permitidos |= {round(float(v), 1) for v in datos.values() if isinstance(v, int | float)}
    # Las que dio el usuario («¿es grave si llega a 29?»): repetirlas no es inventar.
    permitidos |= {round(float(n.replace(",", ".")), 1) for n in NUMERO.findall(pregunta)}
    permitidos |= {float(n) for n in range(0, 25)}  # «2 frases», «7 días», horas del día…
    return _limpiar(r["texto"], permitidos, base), _tokens(r)


# El modelo pequeño no conversa bien con una instrucción abierta: se le pide explicar los
# hechos con sus palabras, con un ejemplo, y ``_fiel`` descarta lo que agregue.
CONVERSAR = (
    "Contesta al mensaje del usuario explicando los hechos con tus palabras, en máximo dos "
    "frases. No saludes ni hables de ti. Menciona lo principal de los hechos y no agregues nada "
    "que no esté en ellos.\n"
    "Ejemplo:\n"
    "Hechos: No hay un área «bodega 2» registrada en tu organización. Un administrador puede "
    "darla de alta en Empresa y áreas.\n"
    "Usuario: pero sí existe\n"
    "Respuesta: Entiendo, pero «bodega 2» no aparece registrada en tu organización; si existe, "
    "un administrador puede darla de alta en Empresa y áreas."
)
# Palabras de enlace que la IA puede usar aunque no estén en los hechos.
NEUTRAS = frozenset(
    "entiendo comprendo claro gracias aparece aparecen registrada registrado existe existen "
    "puede pueden puedes podrias debes debe deberia revisar reviso revise segun ahora todavia "
    "sigue siguen tambien entonces mientras cuando donde quieres quieras necesitas ayudarte "
    "consultar consultarla consultarlo indica indican muestra muestran marca marcan tienes "
    "tiene tienen sobre desde hasta porque aunque mismo misma estos estas esos esas lecturas "
    "lectura datos sensores sensor dispositivo cualquier momento verdad".split()
)
SALUDO_IA = re.compile(
    r"\b(hola|estoy bien|como estas|soy nico|en que (te )?puedo ayudar|buen(os|as) (dias|tardes|"
    r"noches))\b"
)


def _palabras(texto):
    return [w for w in re.findall(r"[a-zñ]+", agente._normalizar(texto)) if len(w) >= 5]


def _relaciones(texto, hechos, entidades):
    """Cada frase de la IA solo junta lugares o dispositivos que los hechos ya juntan en una
    misma frase («Moldeo» con «Núcleo A-01» no, si los hechos no los relacionan)."""
    frases_hechos = [agente._normalizar(f) for f in re.split(r"(?<=[.;!?])\s+", hechos)]
    for frase in re.split(r"(?<=[.;!?])\s+", agente._normalizar(texto)):
        presentes = [e for e in entidades if e and e in frase]
        for i, a in enumerate(presentes):
            for b in presentes[i + 1 :]:
                if not any(a in f and b in f for f in frases_hechos):
                    return False
    return True


def _fiel(texto, hechos, mensaje="", contexto=""):
    """La respuesta de la IA solo dice lo que dicen los hechos: cada palabra con contenido
    viene de los hechos, del mensaje del usuario o de las palabras de enlace, retoma lo
    principal de los hechos y no es charla («¡Hola! Estoy bien»)."""
    if SALUDO_IA.search(agente._normalizar(texto)):
        return False
    # La conversación anterior (ya verificada) también vale: da continuidad al chat.
    raices = {w[:5] for w in _palabras(f"{hechos} {mensaje} {contexto}")}
    propias = [w for w in _palabras(texto) if w not in NEUTRAS]
    if any(w[:5] not in raices for w in propias):
        return False
    claves = {w[:5] for w in _palabras(hechos) if w not in NEUTRAS}
    usadas = {w[:5] for w in propias} & claves
    return len(usadas) >= min(3, len(claves))


def conversar(dispositivo, mensaje, hechos, historial=(), espera=None):
    """Respuesta conversacional de la IA (insistencias, comentarios, observaciones, dudas)
    a partir de ``hechos``: el texto que ya armaron las reglas y las herramientas. Pasa por
    ``_limpiar``: si inventa cifras, fechas o causas, se usa el texto de las reglas.
    Devuelve ``(texto | None, tokens)``."""
    codigo = dispositivo.codigo_mqtt
    if cola().pendientes(codigo) >= MAX_EN_COLA:
        return None, {}
    espera = espera or settings.IA_ESPERA_SEGUNDOS
    charla = "\n".join(f"Usuario: {p}\nNico AI: {r}" for p, r in historial)
    trabajo = {
        "id": uuid.uuid4().hex,
        "ruta": "/api/chat",
        "vence": time.time() + espera,
        "cuerpo": _cuerpo(
            dispositivo,
            [
                {"role": "system", "content": SISTEMA.format(nombre=dispositivo.nombre)},
                {
                    "role": "user",
                    "content": f"{CONVERSAR}\n\n"
                    + (f"Conversación reciente:\n{charla}\n" if charla else "")
                    + f"Hechos: {hechos}\nUsuario: {mensaje}\nRespuesta:",
                },
            ],
            70,  # dos frases cortas: menos tokens, menos espera con el modelo 1.5b
        ),
    }
    r = _ejecutar(codigo, trabajo, espera)
    if not r or r.get("error") or not (r.get("texto") or "").strip():
        return None, _tokens(r or {})
    permitidos = {round(float(n.replace(",", ".")), 1) for n in NUMERO.findall(hechos)}
    permitidos |= {float(n) for n in range(0, 25)}
    texto = _limpiar(r["texto"], permitidos, hechos)
    contexto = " ".join(f"{p} {r}" for p, r in historial)
    from apps.organizaciones.models import Area

    entidades = [agente._normalizar(dispositivo.nombre)] + [
        agente._normalizar(a.nombre)
        for a in Area.objects.filter(organizacion_id=dispositivo.area.organizacion_id)
    ]
    if texto and not (
        _fiel(texto, hechos, mensaje, contexto) and _relaciones(texto, hechos, entidades)
    ):
        texto = None
    return texto, _tokens(r)


# ── Herramientas: la IA solo elige cuál usar ────────────────────────────────────────────
# Cuando las reglas no entienden la pregunta, el modelo la clasifica en una de estas
# herramientas (JSON forzado con «format»). Con eso se arma la pregunta canónica que las
# reglas sí entienden y la respuesta sale de las funciones de siempre: cifras exactas y una
# sola pasada corta de IA (~20 tokens de salida).
# Las del catálogo de ``herramientas.CATALOGO`` que la IA puede elegir.
HERRAMIENTAS = (
    "variable",
    "alertas",
    "conexion",
    "grafica",
    "comparativa",
    "reporte",
    "umbrales",
    "reportes_generados",
    "sensores",
    "areas",
    "ninguna",
)
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
    "(comparar dos periodos), reporte (generar un documento PDF), umbrales (límites "
    "configurados), reportes_generados (reportes que ya existen), sensores (qué sensores "
    "tiene), areas (qué áreas hay), ninguna (no es sobre el ambiente ni los sensores). "
    "Calor o frío es temperatura; "
    "aire, CO2 u olor es calidad del aire. «Estos días» "
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
    r"bodega|almacen|area|zona|sala|cuarto|hoy|ayer|semana|mes|dia|hora|raro|normal|bien|mal|"
    r"registr|ultim|reciente"
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
        # Sin variable: las reglas responden con el resumen de las tres variables.
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
        "umbrales": f"¿cuáles son los umbrales{de_var}?",
        "reportes_generados": "¿qué reportes hay?",
        "sensores": "¿qué sensores tiene?",
        "areas": "¿qué áreas tengo?",
    }.get(h)


# Pistas de cada herramienta en la pregunta: la IA solo puede elegir entre las que tienen
# alguna pista (más «variable» y «ninguna», que siempre están). Así el modelo pequeño no
# manda «¿qué tan alto llegó?» a «alertas» ni pide un reporte que nadie pidió.
PISTAS = {
    "alertas": r"alert|alarma|aviso|sono|raro|problema|falla|incidente|anomal",
    "conexion": r"conect|conex|vivo|prendid|encendid|apagad|funciona|responde|senal|bateri|"
    r"internet|wifi|red\b|en linea",
    "grafica": r"grafic|ver\b|veo|muestr|ensen|dibuj|tendencia|evoluc|como ha ido|como va|"
    r"como fue|historial",
    "comparativa": r"compar|contra|\bvs\b|diferencia|antes|cambi[oa]",
    "reporte": r"reporte|informe|pdf|documento",
    "umbrales": r"umbral|limite|rango|permitid|configur|aceptable",
    "reportes_generados": r"reportes|informes|generad|anterior",
    "sensores": r"sensor|instalad|modelo|calibr",
    "areas": r"area|zona|departamento|sucursal|bodega|donde",
}


def herramientas_posibles(pregunta):
    texto = agente._normalizar(pregunta)
    return ["variable", *[h for h, p in PISTAS.items() if re.search(p, texto)], "ninguna"]


def enrutar(dispositivo, pregunta, espera=None):
    """Pregunta canónica elegida por la IA (o ``None``) y los tokens usados."""
    codigo = dispositivo.codigo_mqtt
    posibles = herramientas_posibles(pregunta)
    esquema = json.loads(json.dumps(ESQUEMA))
    esquema["properties"]["herramienta"]["enum"] = posibles
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
            formato=esquema,
        ),
    }
    r = _ejecutar(codigo, trabajo, espera)
    if not r or r.get("error"):
        return None, _tokens(r or {})
    try:
        elegido = json.loads(r.get("texto") or "")
        h, v, p = elegido["herramienta"], elegido["variable"], elegido["periodo"]
        dato = elegido.get("dato", "general")
    except (ValueError, KeyError, TypeError):
        return None, _tokens(r)
    if h not in posibles or v not in VARIABLES_IA or p not in PERIODOS_IA or dato not in DATOS_IA:
        return None, _tokens(r)
    # Periodo y dato pedido los sacan mejor las reglas de la pregunta original: si los
    # encuentran, la IA solo aporta la herramienta y la variable.
    nombra_periodo = agente.periodo_de(pregunta)[2] != agente.periodo_de("")[2]
    if nombra_periodo or agente._dato_pedido(pregunta):
        canonica = _canonica(h, v, "ahora", dato).replace(" de esta semana", "")
        return f"{canonica} · {pregunta}", _tokens(r)
    return _canonica(h, v, p, dato), _tokens(r)
