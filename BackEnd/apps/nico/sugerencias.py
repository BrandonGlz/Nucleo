"""Sugerencias del chat mientras el usuario escribe.

El servidor manda una lista corta (~150 frases) al abrir el chat y la web la filtra con cada
letra, sin pedir nada más. Salen de:

- fijadas en la consola (siempre primero),
- el banco: respuestas fijas de la empresa del dispositivo,
- lo que Nico ya trae: explicaciones y «¿Qué puedes hacer?»,
- los ejemplos de las herramientas activas (las acciones, solo para quien puede usarlas),
- las preguntas frecuentes de la empresa que no se calificaron como no útiles.

``AjusteSugerencias`` decide si se muestran, cuántas y de qué fuentes; las ocultas nunca salen.
"""

from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Max, Q
from django.utils import timezone

from apps.reportes import aprendizaje, herramientas
from apps.reportes.models import PreguntaAgente, RespuestaAprendida

from . import configuracion, conocimiento
from .models import AjusteSugerencias

TIPOS = {
    "fijada": "Destacada",
    "respuesta": "Respuesta",
    "consulta": "Consulta",
    "frecuente": "Frecuente",
}
LIMITE = 150
FRECUENTES = 25
DIAS_FRECUENTES = 60
CACHE_SEGUNDOS = 300
CLAVE_VERSION = "nico:sugerencias:version"


def limpiar_cache():
    """Las listas guardadas dejan de valer (cambió el banco, una herramienta o el ajuste)."""
    try:
        cache.incr(CLAVE_VERSION)
    except ValueError:
        cache.set(CLAVE_VERSION, 1, None)


def _version():
    return cache.get_or_set(CLAVE_VERSION, 1, None)


def _frecuentes(organizacion_id):
    desde = timezone.now() - timedelta(days=DIAS_FRECUENTES)
    filas = (
        PreguntaAgente.objects.filter(
            dispositivo__area__organizacion_id=organizacion_id, fecha__gte=desde
        )
        .exclude(via=PreguntaAgente.Via.NO_ENTENDIDA)
        .exclude(calificacion=-1)
        .exclude(Q(datos__has_key="precarga") | Q(datos__has_key="contexto"))
        .values("pregunta_normalizada")
        .annotate(veces=Count("num"), texto=Max("pregunta"))
        .filter(veces__gte=2)
        .order_by("-veces")[:FRECUENTES]
    )
    return [f["texto"] for f in filas if 6 <= len(f["texto"]) <= 120]


def candidatas(usuario, organizacion_id, ajuste):
    """[(texto, tipo)] en orden de prioridad, antes de quitar ocultas y repetidas."""
    lista = [(t, "fijada") for t in ajuste.fijadas]
    if ajuste.usar_banco:
        fijas = RespuestaAprendida.objects.filter(
            organizacion_id=organizacion_id, tema="FIJA", activa=True
        ).values_list("pregunta", flat=True)
        lista += [(t, "respuesta") for t in fijas]
    if ajuste.usar_herramientas:
        puede_acciones = herramientas._puede_reportes(usuario)
        for h in configuracion.catalogo():
            if h["activa"] and (puede_acciones or not h["accion"]):
                lista.append((conocimiento.con_mayuscula(h["ejemplo"]), "consulta"))
    if ajuste.usar_incluidas:
        for x in conocimiento.incluidas():
            if x["tipo"] in ("explicacion", "capacidades"):
                lista.append((x["pregunta"], "respuesta"))
    if ajuste.usar_frecuentes:
        lista += [(t, "frecuente") for t in _frecuentes(organizacion_id)]
    return lista


def para(usuario, dispositivo):
    """{activas, maximo, sugerencias: [{texto, tipo, etiqueta}]} para el chat de ese
    dispositivo."""
    ajuste = AjusteSugerencias.actual()
    if not ajuste.activas:
        return {"activas": False, "maximo": ajuste.maximo, "sugerencias": []}
    org = dispositivo.area.organizacion_id
    clave = f"nico:sugerencias:{_version()}:{org}:{usuario.rol_id}"
    sugerencias = cache.get(clave)
    if sugerencias is None:
        ocultas = set(ajuste.ocultas)
        vistas, sugerencias = set(), []
        for texto, tipo in candidatas(usuario, org, ajuste):
            texto = " ".join(str(texto).split())
            normalizada = aprendizaje.normalizar(texto)
            if not normalizada or normalizada in ocultas or normalizada in vistas:
                continue
            vistas.add(normalizada)
            sugerencias.append({"texto": texto, "tipo": tipo, "etiqueta": TIPOS[tipo]})
            if len(sugerencias) >= LIMITE:
                break
        cache.set(clave, sugerencias, CACHE_SEGUNDOS)
    return {"activas": True, "maximo": ajuste.maximo, "sugerencias": sugerencias}
