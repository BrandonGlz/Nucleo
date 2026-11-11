"""Agente de consulta: responde preguntas sobre un dispositivo con sus datos reales.

Hay un agente por dispositivo (cada ESP32). Mientras no haya un servicio de IA para
conversar, el agente reconoce el tema de la pregunta (una variable, las alertas o la
conexión) y arma la respuesta con las lecturas de TimescaleDB y las alertas de PostgreSQL;
no inventa cifras.
"""

import re
import unicodedata
from collections import Counter
from datetime import timedelta
from difflib import SequenceMatcher

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


def datos_de(dispositivo, pregunta):
    """Cifras con nombre del tema de la pregunta (últimos 7 días), redondeadas como se muestran.

    Son los datos que recibe la IA y los que rellenan las respuestas aprendidas.
    """
    tema = _tema(pregunta)
    desde = timezone.now() - PERIODO
    datos = {}
    if tema in ORDEN_VARIABLES:
        sensores = list(dispositivo.sensores.values_list("num", flat=True))
        lecturas = Lectura.objects.filter(
            sensor_num__in=sensores, variable_codigo=tema, estabilizada=True, fecha_hora__gte=desde
        )
        resumen = lecturas.aggregate(
            promedio=Avg("valor"), minimo=Min("valor"), maximo=Max("valor")
        )
        ultima = lecturas.order_by("-fecha_hora").values_list("valor", flat=True).first()
        umbral = dispositivo.umbrales.filter(variable_id=tema, activo=True).first()
        dec = 0 if tema == "AIRE" else 1
        for clave, valor in (("actual", ultima), *resumen.items()):
            if valor is not None:
                datos[clave] = round(float(valor), dec)
        if umbral is not None:
            datos["limite_min"] = float(umbral.advertencia_min)
            datos["limite_max"] = float(umbral.advertencia_max)
            datos["lecturas_sobre_max"] = lecturas.filter(valor__gt=umbral.advertencia_max).count()
    if tema in (*ORDEN_VARIABLES, "ALERTAS", "GENERICA"):
        datos["alertas_7_dias"] = Alerta.objects.filter(
            umbral__dispositivo=dispositivo, fecha_hora__gte=desde
        ).count()
    return datos


def con_contexto(pregunta, anterior):
    """Completa un seguimiento corto con la pregunta anterior de la conversación.

    «¿y el dashboard?» o «¿y el mes pasado?» no nombran variable ni tema: se responden sobre
    lo que se preguntó antes («dame un dashboard de la temperatura»). Si la pregunta ya tiene
    tema propio («¿y la humedad?»), va sola.
    """
    if not anterior or _tema(pregunta) is not None or len(pregunta.split()) > 8:
        return pregunta
    if _tema(anterior) is None:
        return pregunta
    return f"{anterior} {pregunta}"


def responder(dispositivo, pregunta):
    """Respuesta del agente del dispositivo: ``{"texto", "picos"?, "serie"?, ...}``."""
    tema = _tema(pregunta)
    desde = timezone.now() - PERIODO
    if tema is None:
        return {
            "texto": f"Solo puedo responder sobre {dispositivo.nombre} y sus sensores. "
            "Para un reporte, pídelo así: «reporte de esta semana» o «reporte de octubre»."
        }
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


# ── Reportes pedidos al agente (SRS 3.2.12) ─────────────────────────────────────────────
PALABRAS_REPORTE = ("reporte", "informe", "resumen")
VERBOS_REPORTE = (
    "genera",
    "generar",
    "generame",
    "hazme",
    "haz",
    "crea",
    "crear",
    "creame",
    "dame",
    "manda",
    "mandame",
)
PALABRAS_PERIODO = ("semana", "semanal", "mes", "mensual", "hoy", "ayer", "dias", "quincena")
MESES = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)


def pide_reporte(pregunta):
    """True si la petición es un reporte: «reporte», «informe» o «resumen» (también con errores de
    dedo, como «repote»), o un verbo de crear con un periodo («genera el de la semana»)."""
    texto = _normalizar(pregunta)
    if any(p in texto for p in PALABRAS_REPORTE):
        return True
    palabras = re.findall(r"[a-z]+", texto)
    if any(
        SequenceMatcher(None, w, p).ratio() >= 0.8
        for w in palabras
        for p in PALABRAS_REPORTE
        if len(w) >= 5
    ):
        return True
    return any(v in palabras for v in VERBOS_REPORTE) and any(p in texto for p in PALABRAS_PERIODO)


def periodo_de(pregunta, ahora=None):
    """Periodo que nombra la petición: ``(inicio, fin, descripcion)`` en hora local.

    Entiende «hoy», «ayer», «esta semana», «semana pasada», «este mes», «mes pasado»,
    «últimos N días» y el nombre de un mes (con año opcional). Sin periodo, los últimos 7 días.
    """
    ahora = timezone.localtime(ahora or timezone.now())
    hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    texto = _normalizar(pregunta)

    def mes(anio, numero):
        inicio = hoy.replace(year=anio, month=numero, day=1)
        if numero == 12:
            fin = inicio.replace(year=anio + 1, month=1)
        else:
            fin = inicio.replace(month=numero + 1)
        return inicio, min(fin, ahora), f"{MESES[numero - 1]} de {anio}"

    if re.search(r"ultimas?\s+24\s*h|ultimo dia|ultimas? horas", texto):
        return ahora - timedelta(days=1), ahora, "las últimas 24 horas"
    dias = re.search(r"ultim[oa]s?\s+(\d{1,3})\s+dias", texto)
    if dias:
        n = max(1, min(int(dias.group(1)), 366))
        return ahora - timedelta(days=n), ahora, f"los últimos {n} días"
    if "ayer" in texto:
        return hoy - timedelta(days=1), hoy, "ayer"
    if "hoy" in texto:
        return hoy, ahora, "hoy"
    if "semana pasada" in texto:
        lunes = hoy - timedelta(days=hoy.weekday())
        return lunes - timedelta(days=7), lunes, "la semana pasada"
    if "esta semana" in texto:
        return hoy - timedelta(days=hoy.weekday()), ahora, "esta semana"
    if "mes pasado" in texto:
        anterior = hoy.replace(day=1) - timedelta(days=1)
        return mes(anterior.year, anterior.month)
    if "este mes" in texto or "mensual" in texto:
        return mes(hoy.year, hoy.month)
    if "quincena" in texto:
        return ahora - timedelta(days=15), ahora, "los últimos 15 días"
    for i, nombre in enumerate(MESES, start=1):
        if nombre in texto:
            anio = re.search(r"\b(20\d{2})\b", texto)
            anio = int(anio.group(1)) if anio else hoy.year
            if not re.search(r"\b20\d{2}\b", texto) and i > hoy.month:
                anio -= 1  # «octubre» en enero se refiere al octubre pasado
            return mes(anio, i)
    return ahora - PERIODO, ahora, "los últimos 7 días"


def generar_reporte(usuario, dispositivo, pregunta):
    """Genera, con las mismas cifras que la sección Reportes, el reporte del área del dispositivo.

    Solo pueden pedirlo administradores, supervisores y analistas; el agente no modifica nada
    más. Si la IA no está disponible, no se guarda y se avisa.
    """
    from apps.reportes import ia, servicios
    from apps.reportes.models import Reporte

    if usuario.rol_id not in (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA):
        return {
            "texto": "Los reportes los generan administradores, supervisores y analistas. "
            "Puedo responderte sobre las lecturas y alertas de tu dispositivo."
        }
    inicio, fin, descripcion = periodo_de(pregunta)
    if inicio >= fin:
        return {"texto": f"Ese periodo ({descripcion}) todavía no tiene datos."}
    area = dispositivo.area
    try:
        reporte = servicios.generar_reporte(
            usuario.organizacion, area, inicio, fin, Reporte.Origen.AGENTE, usuario=usuario
        )
    except ia.IANoDisponible:
        return {
            "texto": "No pude redactar el reporte: el servicio de IA no está disponible por "
            "ahora. El monitoreo y las alertas siguen funcionando."
        }
    return {
        "texto": (
            f"Listo: generé el reporte de {area.nombre} de {descripcion} "
            f"({timezone.localtime(inicio):%d/%m/%Y} – {timezone.localtime(fin):%d/%m/%Y}). "
            "Puedes visualizarlo aquí o descargarlo en PDF."
        ),
        "reporte": resumen_reporte(reporte, f"{area.nombre} · {descripcion}"),
    }


ORDEN_VARIABLES = ("TEMP", "HUM", "AIRE")


def resumen_reporte(reporte, titulo):
    """Lo que la web y la app muestran del reporte en el chat: cifras clave por variable y
    el primer párrafo del análisis. El reporte completo sigue en la sección Reportes."""
    cifras = reporte.cifras or {}
    variables = cifras.get("variables") or {}
    alertas = cifras.get("alertas") or {}
    por_variable = alertas.get("por_variable") or {}
    dias = max(1, round((reporte.periodo_fin - reporte.periodo_inicio) / timedelta(days=1)))
    return {
        "num": reporte.pk,
        "titulo": titulo,
        "periodo_inicio": reporte.periodo_inicio.isoformat(),
        "periodo_fin": reporte.periodo_fin.isoformat(),
        "dias": dias,
        "lecturas": sum(v.get("muestras") or 0 for v in variables.values()),
        "alertas": alertas.get("total", 0),
        "peligro": (alertas.get("por_nivel") or {}).get("PELIGRO", 0),
        "variables": [
            {
                "variable": codigo,
                "nombre": variables[codigo].get("nombre", codigo),
                "unidad": variables[codigo].get("unidad", ""),
                "promedio": variables[codigo].get("promedio"),
                "minimo": variables[codigo].get("minimo"),
                "maximo": variables[codigo].get("maximo"),
                "alertas": por_variable.get(codigo, 0),
            }
            for codigo in ORDEN_VARIABLES
            if codigo in variables
        ],
        "resumen": (reporte.contenido or "").split("\n\n")[0].strip(),
    }
