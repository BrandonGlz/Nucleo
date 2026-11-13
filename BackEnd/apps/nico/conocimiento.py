"""Lo que Nico ya sabe responder sin la consola, y qué preguntas piden datos en vivo.

Lo usan el banco (para mostrar las incluidas y proteger las respuestas fijas) y las
sugerencias del chat.
"""

from types import SimpleNamespace

from apps.reportes import aprendizaje, herramientas, interprete, social

from . import configuracion

# Preguntas de ejemplo de la charla que Nico ya trae (``reportes/social.py``).
EJEMPLOS_CHARLA = {
    "identidad": "¿Quién eres?",
    "ayuda": "¿Me ayudas?",
    "gracias": "Gracias",
    "despedida": "Adiós",
    "hora": "¿Qué hora es?",
    "fecha": "¿Qué día es hoy?",
    "control": "Enciende el aire acondicionado",
    "clima_exterior": "¿Va a llover?",
    "emocion_mal": "Me siento cansado",
    "emocion_bien": "Estoy contento",
    "afecto": "Eres el mejor",
    "molestia": "No sirves",
    "risa": "jajaja",
    "acuse": "Ok",
    "idioma": "¿Hablas inglés?",
    "general": "Cuéntame un chiste",
}
NOMBRES_ROL = {
    "ADMIN": "Administrador",
    "SUPER": "Supervisor",
    "ANALISTA": "Analista",
    "OPER": "Operador",
}
# Intenciones que siempre se contestan con datos del momento: una respuesta fija las taparía.
INTENCIONES_DE_DATOS = {
    "ultima",
    "grafica",
    "comparativa",
    "alertas",
    "estado",
    "detalle_alerta",
    "pendientes",
}


def con_mayuscula(texto):
    """Primera letra en mayúscula, aunque empiece con «¿» o «¡»."""
    for i, c in enumerate(texto):
        if c.isalpha():
            return texto[:i] + c.upper() + texto[i + 1 :]
    return texto


def incluidas(fijas=frozenset()):
    """[{id, tipo, tema, pregunta, otras, respuesta, personalizada}]: explicaciones, charla,
    capacidades por rol y consultas con datos (herramientas activas). ``{dispositivo}`` y
    ``{área}`` se rellenan con el dispositivo de cada chat."""
    ejemplo = SimpleNamespace(nombre="{dispositivo}", area=SimpleNamespace(nombre="{área}"))
    lista = []

    def agregar(tipo, tema, pregunta, respuesta, otras=()):
        lista.append(
            {
                "id": f"{tipo}:{tema}",
                "tipo": tipo,
                "tema": tema,
                "pregunta": pregunta,
                "otras": list(otras),
                "respuesta": respuesta,
                "personalizada": aprendizaje.normalizar(pregunta) in fijas,
            }
        )

    banco = herramientas.banco()
    for e in banco["explicaciones"]:
        palabras = e["palabras"]
        agregar(
            "explicacion", e["clave"], f"¿Qué significa «{palabras[0]}»?", e["texto"], palabras[1:]
        )
    for cat, pregunta in EJEMPLOS_CHARLA.items():
        r = social.responder(ejemplo, pregunta)
        if r is not None:
            agregar("charla", cat, pregunta, r["texto"])
    for rol, texto in banco["capacidades"].items():
        agregar("capacidades", NOMBRES_ROL.get(rol, rol), "¿Qué puedes hacer?", texto)
    for h in configuracion.catalogo():
        if h["activa"]:
            agregar(
                "consulta",
                h["nombre"],
                con_mayuscula(h["ejemplo"]),
                "Se responde con los datos del momento: " + h["descripcion"],
            )
    return lista


def pide_datos(pregunta):
    """Motivo por el que la pregunta debe contestarse con datos en vivo (o None). Una respuesta
    fija para ella daría siempre el mismo texto en vez de la lectura del momento."""
    normalizada = aprendizaje.normalizar(pregunta)
    for h in configuracion.catalogo():
        if h["activa"] and aprendizaje.normalizar(h["ejemplo"]) == normalizada:
            return "Es el ejemplo de una herramienta: Nico la responde con los datos del momento."
    p = interprete.interpretar(pregunta)
    if p.intencion in INTENCIONES_DE_DATOS or (p.variables and p.periodo):
        return (
            "Nico responde esa pregunta con las lecturas del momento; una respuesta fija las "
            "taparía. Escríbela como una duda general (por ejemplo «¿qué niveles hay?»)."
        )
    return None


def reemplaza(pregunta):
    """La respuesta incluida que una fija con esta pregunta reemplazaría (o None)."""
    normalizada = aprendizaje.normalizar(pregunta)
    for x in incluidas():
        if x["tipo"] != "consulta" and aprendizaje.normalizar(x["pregunta"]) == normalizada:
            return x["pregunta"]
    return None
