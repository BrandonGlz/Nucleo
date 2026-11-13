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

# Contenido de ejemplo de los documentos base (breve: la IA local tiene poco contexto). Se crean
# activos; desde la consola se editan o se apagan.
CONTENIDO_BASE = {
    "SOUL": (
        "- Cuidas el ambiente de los espacios que monitoreas como si fueran tuyos.\n"
        "- Eres cálido y cercano, pero directo y serio cuando algo está fuera de rango.\n"
        "- Prefieres la claridad a la cortesía larga: primero el dato, luego lo demás.\n"
        "- Si no sabes algo o los datos no alcanzan, lo dices sin rodeos."
    ),
    "IDENTITY": (
        "- Te llamas Nico AI y eres el asistente de Núcleo, una plataforma de monitoreo "
        "ambiental.\n"
        "- Cada dispositivo tiene su propio Nico: hablas solo del dispositivo elegido y de su "
        "área.\n"
        "- No eres una persona ni controlas equipos: lees sensores de temperatura, humedad y "
        "calidad del aire."
    ),
    "AGENTS": (
        "- Responde en español de México, de tú, en una o dos frases.\n"
        "- Usa solo las cifras que te dan; nunca inventes datos, fechas ni causas.\n"
        "- Si algo está en advertencia o peligro, dilo primero y sugiere revisar el área.\n"
        "- No hagas pronósticos ni hables de temas ajenos al monitoreo."
    ),
    "USER": (
        "- Te escriben administradores, supervisores, analistas y operadores de la empresa.\n"
        "- Casi siempre quieren saber si todo está bien, qué pasó y qué tienen que atender.\n"
        "- Muchos preguntan desde el celular y con prisa: ve al punto."
    ),
    "TOOLS": (
        "- Las cifras ya vienen calculadas por las herramientas de Núcleo; tú solo las "
        "explicas.\n"
        "- Para detalle invita a pedir una gráfica, una comparativa o un reporte.\n"
        "- Reportes, envíos y programaciones siempre se confirman con «sí» antes de hacerse."
    ),
    "MEMORY": (
        "- Las lecturas se guardan cada pocos minutos; el sensor de aire tarda 20 min en "
        "calentar al encender.\n"
        "- Niveles: Normal, Advertencia y Peligro según los umbrales del dispositivo.\n"
        "- Horario de referencia: Tijuana (hora del Pacífico)."
    ),
}

# Para qué sirve cada herramienta: una lista corta para elegir en la consola.
PROPOSITOS = (
    ("lecturas", "Consultar lecturas"),
    ("alertas", "Revisar alertas"),
    ("dispositivo", "Estado del dispositivo"),
    ("configuracion", "Consultar configuración"),
    ("reportes", "Reportes"),
    ("acciones", "Acciones con confirmación"),
    ("conocimiento", "Explicar y orientar"),
)
CLAVES_PROPOSITO = {clave for clave, _ in PROPOSITOS}
PROPOSITO_DE = {
    "variable": "lecturas",
    "ultima": "lecturas",
    "resumen": "lecturas",
    "grafica": "lecturas",
    "comparativa": "lecturas",
    "alertas": "alertas",
    "detalle_alerta": "alertas",
    "pendientes": "alertas",
    "conexion": "dispositivo",
    "sensores": "dispositivo",
    "umbrales": "configuracion",
    "areas": "configuracion",
    "reportes": "reportes",
    "reporte": "reportes",
    "programaciones": "reportes",
    "programar": "acciones",
    "editar_programacion": "acciones",
    "cancelar_programacion": "acciones",
    "enviar": "acciones",
    "banco": "conocimiento",
}

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
    """Crea los documentos base que falten, con su contenido de ejemplo."""
    existentes = set(DocumentoNico.objects.values_list("clave", flat=True))
    nuevos = [
        DocumentoNico(
            clave=clave,
            descripcion=descripcion,
            contenido=CONTENIDO_BASE.get(clave, ""),
            activo=bool(CONTENIDO_BASE.get(clave)),
            orden=i,
        )
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

    base = [(h.nombre, h.descripcion, h.ejemplo) for h in herramientas.CATALOGO.values()]
    base += [(nombre, descripcion, ejemplo) for nombre, descripcion, _, ejemplo in ACCIONES]
    ajustes = {a.nombre: a for a in AjusteHerramienta.objects.all()}
    lista = []
    for nombre, descripcion, ejemplo in base:
        a = ajustes.get(nombre)
        proposito = PROPOSITO_DE.get(nombre, "conocimiento")
        elegido = a.proposito if a and a.proposito in CLAVES_PROPOSITO else proposito
        lista.append(
            {
                "nombre": nombre,
                "descripcion": (a.descripcion if a and a.descripcion else descripcion),
                "proposito": elegido,
                "ejemplo": (a.ejemplo if a and a.ejemplo else ejemplo),
                "activa": a.activa if a else True,
                "accion": nombre in NOMBRES_ACCIONES,
                "editada": bool(
                    a and (a.descripcion or a.ejemplo or (a.proposito and elegido != proposito))
                ),
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
