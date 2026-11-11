"""Aprendizaje de Nico AI a partir de las reacciones de los usuarios, sin reentrenar la IA.

Cada pregunta queda registrada (``PreguntaAgente``) con cómo se resolvió. Cuando alguien da 👍
a una respuesta redactada por la IA, se guarda como plantilla (``RespuestaAprendida``): sus
cifras se cambian por espacios con nombre (``{actual}``, ``{promedio}``…) para rellenarlos con
las lecturas del momento. La siguiente vez que alguien de la organización hace la misma
pregunta, sale del banco al instante. Un 👎 sobre una respuesta del banco la desactiva.
Todo vive en PostgreSQL (disco): no aumenta la memoria que usa la IA.
"""

import re

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


def calificar(registro, valor):
    """Guarda la reacción (1, -1 o ``None``) y aprende de ella. Devuelve si quedó en el banco."""
    anterior = registro.calificacion
    registro.calificacion = valor
    registro.save(update_fields=["calificacion"])
    if valor == anterior:
        return False
    aprendida = registro.aprendida
    if aprendida is not None:  # respuesta que ya salió del banco
        if valor == 1:
            RespuestaAprendida.objects.filter(pk=aprendida.pk).update(votos_si=F("votos_si") + 1)
        elif valor == -1:
            RespuestaAprendida.objects.filter(pk=aprendida.pk).update(
                votos_no=F("votos_no") + 1, activa=False
            )
        return False
    if valor != 1 or registro.via != PreguntaAgente.Via.IA:
        return False
    plantilla = a_plantilla(registro.respuesta, registro.datos)
    if plantilla is None:
        return False
    try:
        with transaction.atomic():
            nueva, creada = RespuestaAprendida.objects.get_or_create(
                organizacion_id=registro.dispositivo.area.organizacion_id,
                pregunta_normalizada=registro.pregunta_normalizada[:500],
                tema=registro.tema,
                defaults={"pregunta": registro.pregunta[:500], "plantilla": plantilla},
            )
            if not creada and not nueva.activa:
                # Una respuesta nueva con 👍 sustituye a la que había sido rechazada.
                nueva.plantilla, nueva.activa, nueva.votos_si = plantilla, True, 1
                nueva.save(update_fields=["plantilla", "activa", "votos_si"])
    except IntegrityError:
        return False
    registro.aprendida = nueva
    registro.save(update_fields=["aprendida"])
    return True
