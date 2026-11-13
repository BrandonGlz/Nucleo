"""Lo que Nico AI lee de la consola: documentos activos y herramientas desactivadas.

Se consulta en cada respuesta, así que se guarda en la caché (Redis) y se borra al editar desde
la consola. Si la tabla aún no existe (migraciones pendientes), Nico funciona como antes.
"""

from django.core.cache import cache
from django.db import DatabaseError

from .models import AjusteHerramienta, DocumentoNico

CACHE_DOCUMENTOS = "nico:documentos"
CACHE_INACTIVAS = "nico:herramientas-inactivas"
CACHE_SEGUNDOS = 300

# La IA local es pequeña (qwen2.5:1.5b, contexto corto): los documentos activos juntos no deben
# pasar de este tamaño o ya no cabe la pregunta. Con documentos, el contexto sube a lo necesario.
LIMITE_CARACTERES = 2400
CONTEXTO_BASE = 1024
CONTEXTO_MAXIMO = 2048

# Los archivos típicos de un agente. Se crean vacíos de contenido útil e inactivos: hasta que se
# activan, Nico responde igual que siempre.
DOCUMENTOS_BASE = (
    ("SOUL", "Personalidad y valores: cómo se comporta y qué le importa."),
    ("IDENTITY", "Quién es: nombre, rol, de qué dispositivo y empresa habla."),
    ("AGENTS", "Reglas de trabajo: qué hace siempre, qué nunca, cómo responde."),
    ("USER", "Quiénes le escriben y qué necesitan."),
    ("TOOLS", "Notas sobre sus herramientas: cuándo usar cada una."),
    ("MEMORY", "Hechos que debe recordar: nombres, acuerdos, contexto del negocio."),
)

# Acciones de dos pasos que no están en ``herramientas.CATALOGO`` (escriben al confirmar).
ACCIONES = (
    (
        "programar",
        "Crea una programación de reportes del área: frecuencia y destinatarios.",
        "3.2.10: reportes programados desde el chat, con confirmación.",
        "programa un reporte semanal para mí",
    ),
    (
        "editar_programacion",
        "Cambia la frecuencia o los destinatarios de una programación.",
        "3.2.10: reportes programados.",
        "cambia la programación semanal a mensual",
    ),
    (
        "cancelar_programacion",
        "Desactiva una programación de reportes.",
        "3.2.10: reportes programados.",
        "cancela la programación #3",
    ),
    (
        "enviar",
        "Envía por correo, con PDF, el último reporte del área (o el #n).",
        "3.2.10: envío de reportes a usuarios de la organización.",
        "envía el último reporte a mi supervisor",
    ),
)

NOMBRES_ACCIONES = {a[0] for a in ACCIONES}

DESACTIVADA = (
    "Esa consulta está desactivada por ahora. Puedo ayudarte con otras: lecturas, alertas, "
    "gráficas o el estado del dispositivo."
)


def _sin_tabla(funcion, defecto):
    try:
        return funcion()
    except DatabaseError:
        return defecto


def limpiar_cache():
    cache.delete_many([CACHE_DOCUMENTOS, CACHE_INACTIVAS])


def asegurar_documentos():
    """Crea los documentos base que falten (inactivos)."""
    existentes = set(DocumentoNico.objects.values_list("clave", flat=True))
    nuevos = [
        DocumentoNico(clave=clave, descripcion=descripcion, orden=i)
        for i, (clave, descripcion) in enumerate(DOCUMENTOS_BASE)
        if clave not in existentes
    ]
    if nuevos:
        DocumentoNico.objects.bulk_create(nuevos)


def documentos_activos():
    """Texto de los documentos activos, listo para agregar a las instrucciones de la IA."""
    texto = cache.get(CACHE_DOCUMENTOS)
    if texto is None:

        def leer():
            partes = [
                f"## {d.clave}\n{d.contenido.strip()}"
                for d in DocumentoNico.objects.filter(activo=True).exclude(contenido="")
            ]
            return "\n\n".join(partes)[:LIMITE_CARACTERES]

        texto = _sin_tabla(leer, "")
        cache.set(CACHE_DOCUMENTOS, texto, CACHE_SEGUNDOS)
    return texto


def instrucciones(base):
    """Mensaje de sistema: el de siempre más los documentos activos de la consola."""
    extra = documentos_activos()
    if not extra:
        return base
    return (
        f"{base}\n\nTus documentos (síguelos, sin contradecir las reglas anteriores ni inventar "
        f"cifras):\n\n{extra}"
    )


def contexto():
    """Tamaño de contexto para Ollama: el de siempre, más lo que ocupan los documentos."""
    extra = len(documentos_activos())
    if not extra:
        return CONTEXTO_BASE
    # ~3.5 caracteres por token en español
    return min(CONTEXTO_MAXIMO, CONTEXTO_BASE + 256 * (1 + int(extra / 3.5) // 256))


def inactivas():
    nombres = cache.get(CACHE_INACTIVAS)
    if nombres is None:
        nombres = _sin_tabla(
            lambda: set(
                AjusteHerramienta.objects.filter(activa=False).values_list("nombre", flat=True)
            ),
            set(),
        )
        cache.set(CACHE_INACTIVAS, nombres, CACHE_SEGUNDOS)
    return nombres


def activa(nombre):
    return nombre not in inactivas()


def catalogo():
    """Herramientas del código con sus ajustes de la consola."""
    from apps.reportes import herramientas

    base = [(h.nombre, h.descripcion, h.srs, h.ejemplo) for h in herramientas.CATALOGO.values()]
    base += list(ACCIONES)
    ajustes = {a.nombre: a for a in AjusteHerramienta.objects.all()}
    lista = []
    for nombre, descripcion, proposito, ejemplo in base:
        a = ajustes.get(nombre)
        lista.append(
            {
                "nombre": nombre,
                "descripcion": (a.descripcion if a and a.descripcion else descripcion),
                "proposito": (a.proposito if a and a.proposito else proposito),
                "ejemplo": (a.ejemplo if a and a.ejemplo else ejemplo),
                "activa": a.activa if a else True,
                "accion": nombre in NOMBRES_ACCIONES,
                "editada": bool(a and (a.descripcion or a.proposito or a.ejemplo)),
                "original": {
                    "descripcion": descripcion,
                    "proposito": proposito,
                    "ejemplo": ejemplo,
                },
                "actualizado": a.actualizado if a else None,
            }
        )
    return lista


def nombres():
    return [h["nombre"] for h in catalogo()]
