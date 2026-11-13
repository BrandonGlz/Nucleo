"""Convierte una sección del documento de la consola en respuestas del banco, una sola vez.

Mandar los documentos en cada petición a la IA cuesta: en la CPU del servidor cada token nuevo
se procesa más lento cuanto más largo es lo que va antes (~3-4 s más por respuesta, aunque estén
en la caché de Ollama). En cambio, la IA los lee aquí una vez, en segundo plano y sin el límite
de 20 s del chat, y propone pares de pregunta y respuesta. El superusuario elige cuáles guardar
y quedan como respuestas fijas: se contestan al instante, sin IA.

Se hace por sección: a la IA local le va mejor un texto corto (más rápido y sin mezclar temas).
El estado vive en la caché de Django (``nico:generar:<num>:<sección>``) mientras la consola lo
consulta.
"""

import json
import threading
import time
import uuid

from django.core.cache import cache

from apps.dispositivos.models import Dispositivo
from apps.reportes import puente
from common import roles

from . import configuracion

ESPERA = 240  # segundos: la IA tarda ~1-2 min en leer el documento y escribir las respuestas
MAX_PARES = 8
DURA = 3600  # lo que se conserva el resultado para revisarlo

INSTRUCCION = (
    "Lee el documento de Nico AI, el asistente de monitoreo ambiental de Núcleo, y escribe hasta "
    f"{MAX_PARES} preguntas que un usuario le haría a Nico y que el documento contesta, cada una "
    "con su respuesta en primera persona, como Nico, en español de México, de tú y en una o dos "
    "frases. Usa solo lo que dice el documento: no inventes cifras, nombres ni funciones."
)
ESQUEMA = {
    "type": "object",
    "properties": {
        "pares": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pregunta": {"type": "string"},
                    "respuesta": {"type": "string"},
                },
                "required": ["pregunta", "respuesta"],
            },
        }
    },
    "required": ["pares"],
}


def _clave(num, seccion):
    return f"nico:generar:{num}:{seccion.lower()}"


def estado(num, seccion=""):
    return cache.get(_clave(num, seccion)) or {"estado": "sin_generar", "propuestas": []}


def texto_de(documento, seccion):
    """El texto a convertir: la sección pedida (o el documento completo si no se indica)."""
    if not seccion:
        return documento.contenido.strip()
    for titulo, texto in configuracion.secciones(documento.contenido):
        if titulo.lower() == seccion.lower():
            return f"## {titulo}\n{texto}" if texto else ""
    return ""


def _agente():
    """El dispositivo con ESP conectado: su firma autoriza el uso de la IA."""
    for d in Dispositivo.objects.select_related("area").exclude(
        estado_dispositivo_id=roles.DISPOSITIVO_BAJA
    ):
        if puente.con_puente(d) and puente.activo(d):
            return d
    return None


def _limpiar(texto):
    """Pares válidos y sin repetir a partir de la salida JSON de la IA."""
    try:
        pares = json.loads(texto).get("pares", [])
    except (ValueError, AttributeError):
        return []
    vistos, limpios = set(), []
    for p in pares:
        if not isinstance(p, dict):
            continue
        pregunta = " ".join(str(p.get("pregunta", "")).split())[:200]
        respuesta = " ".join(str(p.get("respuesta", "")).split())[:600]
        clave = pregunta.lower()
        if len(pregunta) < 4 or len(respuesta) < 4 or clave in vistos:
            continue
        vistos.add(clave)
        limpios.append({"pregunta": pregunta, "respuesta": respuesta})
    return limpios[:MAX_PARES]


def _generar(texto, dispositivo):
    trabajo = {
        "id": uuid.uuid4().hex,
        "ruta": "/api/chat",
        "vence": time.time() + ESPERA,
        "cuerpo": puente._cuerpo(
            dispositivo,
            [
                {"role": "system", "content": INSTRUCCION},
                {"role": "user", "content": texto},
            ],
            600,
            formato=ESQUEMA,
        ),
    }
    r = puente._ejecutar(dispositivo.codigo_mqtt, trabajo, ESPERA)
    if not r or r.get("error"):
        return {"estado": "error", "error": (r or {}).get("error") or "La IA no respondió."}
    propuestas = _limpiar(r.get("texto") or "")
    if not propuestas:
        return {"estado": "error", "error": "La IA no propuso respuestas útiles; intenta de nuevo."}
    return {"estado": "listo", "propuestas": propuestas}


def iniciar(documento, seccion=""):
    """Empieza a generar en segundo plano. Devuelve el estado inicial (o el error)."""
    texto = texto_de(documento, seccion)
    if not texto:
        return {"estado": "error", "error": "La sección está vacía."}
    clave = _clave(documento.num, seccion)
    actual = estado(documento.num, seccion)
    if actual["estado"] == "generando":
        return actual
    dispositivo = _agente()
    if dispositivo is None:
        return {
            "estado": "error",
            "error": "El ESP del agente no está conectado: sin él no se usa la IA.",
        }
    inicio = {"estado": "generando", "propuestas": [], "desde": time.time()}
    cache.set(clave, inicio, DURA)

    def correr():
        try:
            resultado = _generar(texto, dispositivo)
        except Exception as e:  # noqa: BLE001 - el error se muestra en la consola
            resultado = {"estado": "error", "error": f"No se pudo generar: {e}"}
        cache.set(
            clave,
            {**resultado, "propuestas": resultado.get("propuestas", [])},
            DURA,
        )

    threading.Thread(target=correr, daemon=True).start()
    return inicio
