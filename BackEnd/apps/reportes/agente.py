"""Agente de consulta: responde preguntas sobre un dispositivo con sus datos reales.

Hay un agente por dispositivo (cada ESP32). Mientras no haya un servicio de IA para
conversar, el agente reconoce el tema de la pregunta (una variable, las alertas o la
conexión) y arma la respuesta con las lecturas de TimescaleDB y las alertas de PostgreSQL;
no inventa cifras.
"""

import unicodedata
from collections import Counter
from datetime import timedelta

from django.db.models import Avg, Count, Max, Min
from django.db.models.functions import TruncDay
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.catalogos.models import VariableAmbiental
from apps.mediciones.models import Lectura
from common import roles

DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
PERIODO = timedelta(days=7)
TEMAS = [
    ("CONEXION", ("conex", "bateri", "senal", "linea", "desconect", "apag")),
    ("ALERTAS", ("alerta", "aviso", "incidente")),
    ("TEMP", ("temperatura", "calor", "frio", "grados")),
    ("HUM", ("humedad", "humed")),
    ("AIRE", ("aire", "co2", "eco2", "calidad", "ppm", "ventila")),
]
# Palabras que indican una pregunta sobre lecturas sin nombrar la variable: se usa la
# variable con más alertas del periodo.
GENERICAS = ("pico", "lectura", "sensor", "medicion", "valor", "dispositivo", "umbral", "rango")


def _normalizar(texto):
    sin_acentos = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in sin_acentos if unicodedata.category(c) != "Mn")


def _tema(pregunta):
    texto = _normalizar(pregunta)
    for tema, claves in TEMAS:
        if any(c in texto for c in claves):
            return tema
    if any(c in texto for c in GENERICAS):
        return "GENERICA"
    return None


def _fmt(valor, unidad):
    decimales = 0 if unidad == "ppm" else 1
    return f"{float(valor):.{decimales}f} {unidad}"


def _cuando(fecha):
    local = timezone.localtime(fecha)
    return f"{DIAS[local.weekday()]} {local.day} · {local:%H:%M}"


def _franja(horas):
    """Momento del día en que se concentran los picos."""
    if not horas:
        return ""
    hora = Counter(horas).most_common(1)[0][0]
    if 6 <= hora < 12:
        return "por la mañana"
    if 12 <= hora < 19:
        return "por la tarde"
    return "por la noche"


def _conexion(dispositivo):
    estado = dispositivo.estado_dispositivo.nombre.lower()
    ultima = dispositivo.ultima_conexion
    hace = "nunca ha enviado lecturas"
    if ultima:
        minutos = int((timezone.now() - ultima).total_seconds() // 60)
        hace = (
            "envió su última lectura hace menos de un minuto"
            if minutos < 1
            else (
                f"envió su última lectura hace {minutos} min"
                if minutos < 120
                else f"envió su última lectura el {_cuando(ultima)}"
            )
        )
    bateria = (
        f" La batería está al {dispositivo.nivel_bateria} %."
        if dispositivo.nivel_bateria is not None
        else ""
    )
    return {
        "texto": f"{dispositivo.nombre} está {estado} y {hace}, con muestreo cada "
        f"{dispositivo.intervalo_muestreo_seg} s.{bateria}"
    }


def _alertas(dispositivo, desde):
    alertas = Alerta.objects.filter(umbral__dispositivo=dispositivo, fecha_hora__gte=desde)
    total = alertas.count()
    if not total:
        return {"texto": f"{dispositivo.nombre} no tuvo alertas en los últimos 7 días."}
    por_variable = dict(alertas.values_list("umbral__variable__nombre").annotate(n=Count("num")))
    principal = max(por_variable, key=por_variable.get)
    pendientes = alertas.filter(estado=Alerta.Estado.PENDIENTE).count()
    peligro = alertas.filter(nivel=Alerta.Nivel.PELIGRO).count()
    texto = (
        f"{dispositivo.nombre} tuvo {total} alertas en los últimos 7 días ({peligro} de peligro). "
        f"La mayoría fue de {principal.lower()} ({por_variable[principal]})."
    )
    texto += (
        (" Queda 1 sin atender." if pendientes == 1 else f" Quedan {pendientes} sin atender.")
        if pendientes
        else " Todas están atendidas."
    )
    return {"texto": texto}


def _variable(dispositivo, codigo, desde):
    variable = VariableAmbiental.objects.get(pk=codigo)
    umbral = dispositivo.umbrales.filter(variable_id=codigo, activo=True).first()
    sensores = list(dispositivo.sensores.values_list("num", flat=True))
    lecturas = Lectura.objects.filter(
        sensor_num__in=sensores, variable_codigo=codigo, estabilizada=True, fecha_hora__gte=desde
    )
    resumen = lecturas.aggregate(promedio=Avg("valor"), minimo=Min("valor"), maximo=Max("valor"))
    nombre = variable.nombre.lower()
    if resumen["promedio"] is None:
        return {
            "texto": f"{dispositivo.nombre} no tiene lecturas de {nombre} en los últimos 7 días."
        }

    unidad = variable.unidad
    ultima = lecturas.order_by("-fecha_hora").first()
    por_dia = list(
        lecturas.annotate(dia=TruncDay("fecha_hora"))
        .values("dia")
        .annotate(maximo=Max("valor"))
        .order_by("dia")
    )
    base = (
        f"Ahora marca {_fmt(ultima.valor, unidad)}. En los últimos 7 días promedió "
        f"{_fmt(resumen['promedio'], unidad)}, con mínimo de {_fmt(resumen['minimo'], unidad)} "
        f"y máximo de {_fmt(resumen['maximo'], unidad)}."
    )
    if umbral is None:
        return {"texto": f"{base} Este dispositivo no tiene umbral de {nombre} configurado."}

    limite = umbral.advertencia_max
    picos = []
    dias_vistos = set()
    for lectura in lecturas.filter(valor__gt=limite).order_by("-valor")[:500]:
        dia = timezone.localtime(lectura.fecha_hora).date()
        if dia in dias_vistos:
            continue
        dias_vistos.add(dia)
        picos.append(lectura)
        if len(picos) == 3:
            break
    sobre = lecturas.filter(valor__gt=limite).count()
    if not picos:
        return {
            "texto": f"La {nombre} de {dispositivo.nombre} se mantuvo dentro del rango "
            f"({float(umbral.advertencia_min):g}–{float(limite):g} {unidad}). {base}"
        }
    franja = _franja([timezone.localtime(p.fecha_hora).hour for p in picos])
    return {
        "texto": (
            f"Hubo {sobre} lecturas sobre el máximo de {nombre} ({float(limite):g} {unidad}) "
            f"esta semana en {dispositivo.nombre}, en {len(dias_vistos)} días distintos; "
            f"la mayoría {franja}. La más alta fue de {_fmt(picos[0].valor, unidad)} el "
            f"{_cuando(picos[0].fecha_hora)}. {base}"
        ),
        "picos": [{"cuando": _cuando(p.fecha_hora), "valor": float(p.valor)} for p in picos],
        "serie": [float(d["maximo"]) for d in por_dia],
        "etiquetas": [DIAS[timezone.localtime(d["dia"]).weekday()] for d in por_dia],
        "unidad": unidad,
        "maximo": float(limite),
    }


def responder(dispositivo, pregunta):
    """Respuesta del agente del dispositivo: ``{"texto", "picos"?, "serie"?, ...}``."""
    tema = _tema(pregunta)
    desde = timezone.now() - PERIODO
    if tema is None:
        return {"texto": f"Solo puedo responder sobre {dispositivo.nombre} y sus sensores."}
    if tema == "CONEXION":
        return _conexion(dispositivo)
    if tema == "ALERTAS":
        return _alertas(dispositivo, desde)
    if tema == "GENERICA":
        conteo = (
            Alerta.objects.filter(umbral__dispositivo=dispositivo, fecha_hora__gte=desde)
            .values_list("umbral__variable_id")
            .annotate(n=Count("num"))
            .order_by("-n")
            .first()
        )
        tema = conteo[0] if conteo else roles.VARIABLE_TEMPERATURA
    return _variable(dispositivo, tema, desde)
