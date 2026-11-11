"""Lo que está fuera de la burbuja del agente: conversación y peticiones que no son de datos.

Nico AI conversa como un asistente normal, pero solo trabaja con su dispositivo. Aquí se
reconocen los mensajes que no piden datos (quién eres, gracias, adiós, cómo te sientes, ayuda, la
hora, chistes o cultura general, encender equipos, el clima de afuera) y se responden con un
texto fijo, breve y amable que regresa la conversación a lo que sí puede hacer. Se revisa antes
que las herramientas, para que «enciende el aire acondicionado» no se confunda con la calidad
del aire ni «el clima de afuera» con el estado del dispositivo. No usa la IA.
"""

import re

from django.utils import timezone

from . import agente

DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
    "octubre", "noviembre", "diciembre",
)  # fmt: skip

# Cada categoría: patrón (sobre el texto normalizado, sin signos) y si exige que no haya tema.
CATEGORIAS = (
    (
        "control",
        r"\b(enciende|encender|prende|prender|apaga|apagar|activa|activar|desactiva|reinicia|"
        r"reiniciar|abre|abrir|cierra|cerrar|sube|baja|pon|regula|ajusta)\b.*\b(aire "
        r"acondicionado|clima|minisplit|ventilador|ventilacion|extractor|calefaccion|calefactor|"
        r"luz|luces|dispositivo|equipo|nucleo|esp|ventana|puerta|alarma|humidificador|"
        r"deshumidificador|temperatura)\b",
    ),
    (
        "clima_exterior",
        r"\b(clima|tiempo|temperatura|lluvia)\b.*\b(afuera|exterior|de la ciudad|en la calle|"
        r"de hoy en|en tijuana|del pronostico)\b|\b(va a llover|pronostico del clima|"
        r"pronostico del tiempo)\b",
    ),
    (
        "identidad",
        r"\b(quien eres|que eres|como te llamas|cual es tu nombre|eres (un )?(robot|humano|"
        r"persona|ia|bot|inteligencia artificial)|quien te (creo|hizo|programo)|eres real)\b",
    ),
    ("despedida", r"^(adios|bye|hasta luego|hasta pronto|nos vemos|chao|me voy)( nico( ai)?)?$"),
    (
        "gracias",
        r"^(muchas |mil )?gracias( por (todo|tu ayuda|la ayuda|la informacion|eso))?( nico)?$|"
        r"^(te agradezco|muy amable)",
    ),
    (
        "ayuda",
        r"^(necesito ayuda|ayuda|ayudame|me ayudas|me puedes ayudar|puedes ayudarme|no se que "
        r"(preguntar|pedir|hacer)|que te puedo preguntar|como te uso|como funcionas)( por favor)?$",
    ),
    ("hora", r"\b(que hora es|que horas son|me dices la hora)\b"),
    ("fecha", r"\b(que dia es( hoy)?|que fecha es( hoy)?|en que fecha estamos)\b"),
    (
        "emocion_mal",
        r"\b(me siento|estoy|ando)( muy| algo| un poco)? (triste|mal|cansad[oa]|aburrid[oa]|"
        r"estresad[oa]|enojad[oa]|preocupad[oa]|deprimid[oa]|solo|sola)\b",
    ),
    (
        "emocion_bien",
        r"\b(me siento|estoy|ando)( muy| bien)? (feliz|contento|contenta|bien|content[oa]|"
        r"emocionad[oa])\b",
    ),
    ("afecto", r"^(te quiero|te amo|eres (el|la) mejor|eres genial|me caes bien|buen trabajo)\b"),
    (
        "molestia",
        r"\b(eres|que) (tont[oa]|inutil|malo|mala|pesim[oa]|lent[oa]|torpe)\b|\bno sirves\b|"
        r"\bno entiendes nada\b",
    ),
    ("risa", r"^(ja|je|ji)+[ajei]*$|^(lol|xd|jsjs+|ajaja+)$"),
    ("acuse", r"^(ok|okay|okey|va|sale|vale|entendido|de acuerdo|ok va|va pues|ya|bueno)( va)?$"),
    ("idioma", r"\b(hablas|sabes|entiendes) (ingles|frances|otro idioma|otros idiomas)\b"),
    (
        "general",
        r"\b(chiste|poema|cancion|cuento|historia de|receta|pelicula|serie|musica|futbol|partido|"
        r"politica|presidente|capital de|traduce|tarea|matematicas|cuanto es \d|resuelve|"
        r"programa en|codigo de|noticias|horoscopo|religion|novia|novio)\b",
    ),
)


def categoria(pregunta):
    texto = agente._normalizar(pregunta).strip(" ¡!¿?.,")
    texto = re.sub(r"[¡!¿?.,]", "", texto)
    for nombre, patron in CATEGORIAS:
        if re.search(patron, texto):
            # Lo de datos («aquí estoy preocupado por la temperatura») va a las herramientas.
            if nombre not in ("control", "clima_exterior") and agente._tema(pregunta) is not None:
                continue
            return nombre
    return None


def responder(dispositivo, pregunta):
    """``{"texto", "social"}`` si el mensaje es conversación o está fuera de la burbuja; si no,
    None."""
    cat = categoria(pregunta)
    if cat is None:
        return None
    d = dispositivo.nombre
    ahora = timezone.localtime()
    ofrecer = f"¿Revisamos algo de {d}? Por ejemplo: «¿cómo está ahora?» o «alertas de hoy»."
    textos = {
        "control": f"No puedo encender, apagar ni ajustar equipos: solo leo los sensores de {d}. "
        "Eso se hace directamente en el equipo. Si quieres, te digo cómo está el ambiente "
        "ahora para decidir.",
        "clima_exterior": f"No tengo el clima de afuera: solo mido el ambiente donde está {d} "
        f"(área {dispositivo.area.nombre}). ¿Quieres que te diga cómo está ahí ahora?",
        "identidad": f"Soy Nico AI, el asistente de Núcleo para {d}. No soy una persona: reviso "
        "sus lecturas, alertas, conexión y reportes con los datos registrados. " + ofrecer,
        "despedida": f"¡Hasta luego! Aquí estaré cuando necesites revisar {d}.",
        "gracias": f"¡Con gusto! Si necesitas algo más de {d}, aquí estoy.",
        "ayuda": f"Claro. Puedo decirte cómo está {d} ahora, cómo estuvo una variable "
        "(«temperatura de ayer»), sus alertas, su conexión y sensores, sus umbrales, o "
        "generarte un reporte («reporte de esta semana»). ¿Qué quieres revisar?",
        "hora": f"Son las {ahora:%H:%M} (hora de Tijuana). {ofrecer}",
        "fecha": f"Hoy es {DIAS[ahora.weekday()]} {ahora.day} de {MESES[ahora.month - 1]} de "
        f"{ahora.year}. {ofrecer}",
        "emocion_mal": "Lamento que te sientas así. Yo solo puedo ayudarte con los datos de "
        f"{d}, pero si te sirve, lo revisamos juntos: «¿cómo está ahora?».",
        "emocion_bien": f"¡Qué bueno! {ofrecer}",
        "afecto": f"¡Gracias! Me alegra ayudarte. {ofrecer}",
        "molestia": "Lamento no haberte ayudado como esperabas. Dime con tus palabras qué "
        f"necesitas de {d} y lo reviso; si una respuesta estuvo mal, márcala con 👎 para "
        "corregirla.",
        "risa": f"😄 {ofrecer}",
        "acuse": f"Va. Si necesitas algo más de {d}, dime.",
        "idioma": f"Solo respondo en español y sobre {d}. ¿Qué quieres revisar?",
        "general": f"Eso no lo puedo hacer. Solo puedo responder sobre {d}: sus sensores, "
        f"alertas y reportes. {ofrecer}",
    }
    r = {"texto": textos[cat], "social": cat}
    if cat in ("clima_exterior", "control"):
        r["propuesta"] = f"¿cómo está {d} ahora?"
    if cat == "control":
        r["codigo"] = "fuera_de_alcance"
    return r


PASOS = {
    "control": "Vi que pides actuar sobre un equipo: solo leo sensores",
    "clima_exterior": "Vi que preguntas por el clima de afuera: solo mido el área del dispositivo",
    "hora": "Consulté la hora del servidor (Tijuana)",
    "fecha": "Consulté la fecha del servidor (Tijuana)",
    "general": "Vi que tu mensaje está fuera de lo que puedo revisar",
    "idioma": "Vi que preguntas por otro idioma",
}


def paso(cat):
    return PASOS.get(cat, "Respondí tu mensaje y te dije qué puedo revisar")
