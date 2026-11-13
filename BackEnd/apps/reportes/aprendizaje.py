"""Aprendizaje de Nico AI a partir de las reacciones de los usuarios, sin reentrenar la IA.

Cada pregunta queda registrada (``PreguntaAgente``) con cómo se resolvió. Cuando alguien da 👍
a una respuesta redactada por la IA, se guarda como plantilla (``RespuestaAprendida``): sus
cifras se cambian por espacios con nombre (``{actual}``, ``{promedio}``…) para rellenarlos con
las lecturas del momento. La siguiente vez que alguien de la organización hace la misma
pregunta, sale del banco al instante. Un 👎 sobre una respuesta del banco la desactiva.
Todo vive en PostgreSQL (disco): no aumenta la memoria que usa la IA.
"""

import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F

from . import agente
from .models import PreguntaAgente, RespuestaAprendida

RELLENO = re.compile(r"^(oye |hola |nico |ai |por favor |porfa |me puedes |puedes )+")
NUMERO = re.compile(r"(?<![\w{])(\d+(?:[.,]\d+)?)(?![\w}])")
ESPACIO = re.compile(r"\{([a-z_]+)\}")


def normalizar(pregunta):
    """Forma comparable de una pregunta: sin acentos, signos, saludos ni espacios de más."""
    texto = agente._normalizar(pregunta)
    texto = re.sub(r"[^a-z0-9ñ ]+", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    return RELLENO.sub("", texto).strip()[:500]


def _como_texto(valor):
    return f"{valor:g}" if isinstance(valor, int | float) else str(valor)


def a_plantilla(texto, datos):
    """Cambia cada cifra del texto por el espacio del dato que vale lo mismo. Si alguna cifra no
    corresponde a un dato (la IA la inventó o la calculó), no se guarda: devuelve ``None``."""
    valores = {}
    for clave, valor in datos.items():
        if isinstance(valor, int | float):
            valores.setdefault(round(float(valor), 1), clave)
    faltan = []

    def cambiar(m):
        numero = round(float(m.group(1).replace(",", ".")), 1)
        if numero in valores:
            return "{" + valores[numero] + "}"
        faltan.append(m.group(1))
        return m.group(0)

    plantilla = NUMERO.sub(cambiar, texto)
    return None if faltan else plantilla


def rellenar(plantilla, datos):
    """Texto con las cifras de ahora; ``None`` si falta algún dato."""
    faltan = [c for c in ESPACIO.findall(plantilla) if datos.get(c) is None]
    if faltan:
        return None
    return ESPACIO.sub(lambda m: _como_texto(datos[m.group(1)]), plantilla)


def buscar(dispositivo, pregunta, tema, datos):
    """Respuesta del banco para la pregunta, ya con las cifras de ahora: ``(aprendida, texto)``."""
    aprendida = RespuestaAprendida.objects.filter(
        organizacion_id=dispositivo.area.organizacion_id,
        pregunta_normalizada=normalizar(pregunta),
        tema=tema or "",
        activa=True,
    ).first()
    if aprendida is None:
        return None, None
    texto = rellenar(aprendida.plantilla, datos)
    return (aprendida, texto) if texto else (None, None)


def respuesta_fija(dispositivo, pregunta):
    """Respuesta escrita en la consola de Nico AI para esta pregunta (tema ``FIJA``)."""
    return RespuestaAprendida.objects.filter(
        organizacion_id=dispositivo.area.organizacion_id,
        pregunta_normalizada=normalizar(pregunta),
        tema="FIJA",
        activa=True,
    ).first()


def ruta_aprendida(dispositivo, pregunta):
    """Herramienta (pregunta canónica) que la IA eligió antes para esta pregunta y recibió 👍."""
    return RespuestaAprendida.objects.filter(
        organizacion_id=dispositivo.area.organizacion_id,
        pregunta_normalizada=normalizar(pregunta),
        tema="RUTA",
        activa=True,
    ).first()


def registrar(usuario, dispositivo, pregunta, via, respuesta, tema="", datos=None, **extra):
    return PreguntaAgente.objects.create(
        usuario=usuario,
        dispositivo=dispositivo,
        pregunta=pregunta[:1000],
        pregunta_normalizada=normalizar(pregunta)[:1000],
        tema=tema or "",
        via=via,
        respuesta=respuesta or "",
        datos=datos or {},
        **extra,
    )


# Solo se aprende de preguntas que se entienden solas y son concretas: ni seguimientos que
# dependen de la pregunta anterior, ni correcciones o comentarios, ni frases muy cortas o largas.
MIN_PALABRAS, MAX_PALABRAS = 3, 25


def apta(registro):
    """True si la pregunta del registro sirve para el banco."""
    if registro.datos.get("contexto"):
        return False
    pregunta = registro.pregunta
    if agente.es_comentario(pregunta) or agente.CORRIGE.search(agente._normalizar(pregunta)):
        return False
    return MIN_PALABRAS <= len(registro.pregunta_normalizada.split()) <= MAX_PALABRAS


def _candidata(registro):
    """Lo que se aprendería de este registro: ``(plantilla, tema)`` o ``(None, None)``."""
    if registro.via == PreguntaAgente.Via.ENRUTADA:
        # Se aprende la ruta: la próxima vez esta pregunta va directo a esa herramienta.
        return registro.datos.get("ruta"), "RUTA"
    if registro.via == PreguntaAgente.Via.IA:
        return a_plantilla(registro.respuesta, registro.datos), registro.tema
    return None, None


def calificar(registro, valor):
    """Guarda la reacción (1, -1 o ``None``) y aprende de ella. Devuelve si la respuesta quedó
    activa en el banco.

    - 👍 a una respuesta de la IA o interpretada por ella, en una pregunta apta, deja una
      candidata en espera; se activa cuando junta ``IA_VOTOS_PARA_APRENDER`` 👍 de ocasiones
      distintas con la misma plantilla o ruta. Si un 👍 llega con otra respuesta, la candidata
      se reemplaza y vuelve a empezar.
    - 👎 a cualquier respuesta de esa pregunta (del banco o de la IA) desactiva lo aprendido.
    """
    anterior = registro.calificacion
    registro.calificacion = valor
    registro.save(update_fields=["calificacion"])
    if valor == anterior:
        return False
    organizacion = registro.dispositivo.area.organizacion_id
    aprendida = registro.aprendida
    if aprendida is not None and registro.via != PreguntaAgente.Via.BANCO:
        # Este registro ya votó por la candidata: quitar y volver a poner el 👍 no cuenta doble.
        if valor == -1:
            RespuestaAprendida.objects.filter(pk=aprendida.pk).update(
                votos_no=F("votos_no") + 1, activa=False, votos_si=0
            )
        return False
    if aprendida is not None:  # respuesta que ya salió del banco
        if valor == 1:
            RespuestaAprendida.objects.filter(pk=aprendida.pk).update(votos_si=F("votos_si") + 1)
        elif valor == -1:
            RespuestaAprendida.objects.filter(pk=aprendida.pk).update(
                votos_no=F("votos_no") + 1, activa=False, votos_si=0
            )
        return False
    plantilla, tema = _candidata(registro)
    if valor == -1 and tema is not None:
        RespuestaAprendida.objects.filter(
            organizacion_id=organizacion,
            pregunta_normalizada=registro.pregunta_normalizada[:500],
            tema=tema,
        ).update(votos_no=F("votos_no") + 1, activa=False, votos_si=0)
        return False
    if valor != 1 or not plantilla or not apta(registro):
        return False
    necesarios = max(1, settings.IA_VOTOS_PARA_APRENDER)
    try:
        with transaction.atomic():
            nueva, creada = RespuestaAprendida.objects.select_for_update().get_or_create(
                organizacion_id=organizacion,
                pregunta_normalizada=registro.pregunta_normalizada[:500],
                tema=tema,
                defaults={
                    "pregunta": registro.pregunta[:500],
                    "plantilla": plantilla,
                    "votos_si": 1,
                    "activa": necesarios <= 1,
                },
            )
            if not creada:
                if nueva.plantilla != plantilla:
                    # Otra respuesta aprobada: la candidata cambia y la cuenta vuelve a empezar.
                    nueva.plantilla, nueva.votos_si = plantilla, 1
                else:
                    nueva.votos_si += 1
                nueva.activa = nueva.votos_si >= necesarios
                nueva.save(update_fields=["plantilla", "votos_si", "activa"])
    except IntegrityError:
        return False
    registro.aprendida = nueva
    registro.save(update_fields=["aprendida"])
    return nueva.activa
