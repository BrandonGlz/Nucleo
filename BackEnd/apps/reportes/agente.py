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
from apps.organizaciones.models import Area

DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
PERIODO = timedelta(days=7)
TEMAS = [
    (
        "CONEXION",
        (
            "conex",
            "conect",
            "bateri",
            "senal",
            "linea",
            "apag",
            "sigue vivo",
            "prendid",
            "encendid",
        ),
    ),
    ("ALERTAS", ("alerta", "aviso", "incidente")),
    ("TEMP", ("temperatura", "calor", "frio", "grados", "calient", "fresco", "helad", "templad")),
    ("HUM", ("humedad", "humed", "bochorno", "seco", "reseco", "vapor", "condensa")),
    (
        "AIRE",
        (
            "aire",
            "co2",
            "eco2",
            "calidad",
            "ppm",
            "ventila",
            "olor",
            "viciado",
            "encerrado",
            "respira",
        ),
    ),
]
# Palabras que indican una pregunta sobre lecturas sin nombrar la variable: se usa la
# variable con más alertas del periodo.
GENERICAS = (
    "pico",
    "lectura",
    "sensor",
    "medicion",
    "valor",
    "dispositivo",
    "umbral",
    "rango",
    "ambiente",
    "condiciones",
)


def _n(cantidad, singular, plural=None):
    """«1 alerta», «3 alertas»."""
    return f"{cantidad} {singular if cantidad == 1 else plural or singular + 's'}"


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
    # Errores de dedo («temperatrua», «humeda», «alertsa»): palabra parecida a una clave larga.
    palabras = [w for w in re.findall(r"[a-z]+", texto) if len(w) >= 5]
    for tema, claves in TEMAS:
        for clave in claves:
            if len(clave) >= 5 and any(
                SequenceMatcher(None, w, clave).ratio() >= 0.8 for w in palabras
            ):
                return tema
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


def _en(descripcion):
    """«en los últimos 7 días», pero «hoy», «ayer» y «el 3 de noviembre» sin «en»."""
    if descripcion in ("hoy", "ayer") or descripcion.startswith("el ") and " de " in descripcion:
        return descripcion
    return f"en {descripcion}"


def _En(descripcion):
    texto = _en(descripcion)
    return texto[0].upper() + texto[1:]


def _sin_lecturas(dispositivo, nombre, descripcion, sensores, codigo, hasta):
    """No hay lecturas en el periodo pedido: se dice así (no se responde con otro periodo) y se
    indica cuándo fue la última, si la hay."""
    previa = (
        Lectura.objects.filter(
            sensor_num__in=sensores, variable_codigo=codigo, fecha_hora__lt=hasta
        )
        .order_by("-fecha_hora")
        .values_list("fecha_hora", flat=True)
        .first()
    )
    texto = f"{dispositivo.nombre} no tiene lecturas de {nombre} {_en(descripcion)}."
    if descripcion == "hoy":
        texto = f"Hoy todavía no hay lecturas de {nombre} de {dispositivo.nombre}."
    if previa:
        texto += f" La última es del {_cuando(previa)}. ¿Quieres que te la muestre?"
        # Si responde «sí», se le da esa última medición (continuidad del chat).
        return {"texto": texto, "propuesta": f"última medición de {nombre}"}
    return {"texto": texto}


def _alertas(dispositivo, desde, hasta=None, descripcion="los últimos 7 días"):
    alertas = Alerta.objects.filter(umbral__dispositivo=dispositivo, fecha_hora__gte=desde)
    if hasta is not None:
        alertas = alertas.filter(fecha_hora__lt=hasta)
    total = alertas.count()
    if not total:
        return {"texto": f"{dispositivo.nombre} no tuvo alertas {_en(descripcion)}."}
    por_variable = dict(alertas.values_list("umbral__variable__nombre").annotate(n=Count("num")))
    principal = max(por_variable, key=por_variable.get)
    pendientes = alertas.filter(estado=Alerta.Estado.PENDIENTE).count()
    peligro = alertas.filter(nivel=Alerta.Nivel.PELIGRO).count()
    texto = (
        f"{dispositivo.nombre} tuvo {_n(total, 'alerta')} {_en(descripcion)} "
        f"({peligro} de peligro). "
        f"La mayoría fue de {principal.lower()} ({por_variable[principal]})."
    )
    texto += (
        (" Queda 1 sin atender." if pendientes == 1 else f" Quedan {pendientes} sin atender.")
        if pendientes
        else " Todas están atendidas."
    )
    return {"texto": texto}


def _variable(dispositivo, codigo, desde, hasta=None, descripcion="los últimos 7 días", pide=None):
    variable = VariableAmbiental.objects.get(pk=codigo)
    umbral = dispositivo.umbrales.filter(variable_id=codigo, activo=True).first()
    sensores = list(dispositivo.sensores.values_list("num", flat=True))
    lecturas = Lectura.objects.filter(
        sensor_num__in=sensores, variable_codigo=codigo, estabilizada=True, fecha_hora__gte=desde
    )
    if hasta is not None:
        lecturas = lecturas.filter(fecha_hora__lt=hasta)
    resumen = lecturas.aggregate(promedio=Avg("valor"), minimo=Min("valor"), maximo=Max("valor"))
    nombre = variable.nombre.lower()
    if resumen["promedio"] is None:
        return _sin_lecturas(
            dispositivo, nombre, descripcion, sensores, codigo, hasta or timezone.now()
        )

    unidad = variable.unidad
    ultima = lecturas.order_by("-fecha_hora").first()
    por_dia = list(
        lecturas.annotate(dia=TruncDay("fecha_hora"))
        .values("dia")
        .annotate(maximo=Max("valor"))
        .order_by("dia")
    )
    # «Ahora marca» solo si el periodo llega hasta hoy; si no, la última lectura del periodo.
    reciente = timezone.now() - ultima.fecha_hora < timedelta(hours=2)
    ahora = (
        f"Ahora marca {_fmt(ultima.valor, unidad)}."
        if reciente
        else f"Su última lectura del periodo fue {_fmt(ultima.valor, unidad)} el "
        f"{_cuando(ultima.fecha_hora)}."
    )
    base = (
        f"{ahora} {_En(descripcion)} promedió "
        f"{_fmt(resumen['promedio'], unidad)}, con mínimo de {_fmt(resumen['minimo'], unidad)} "
        f"y máximo de {_fmt(resumen['maximo'], unidad)}."
    )
    # «¿Cuál fue la máxima?», «¿a qué hora fue la mínima?»: el dato pedido va primero, con cuándo.
    if pide in ("maximo", "minimo"):
        extremo = lecturas.order_by("-valor" if pide == "maximo" else "valor").first()
        palabra = "máxima" if pide == "maximo" else "mínima"
        directo = (
            f"La {palabra} de {nombre} {_en(descripcion)} fue {_fmt(extremo.valor, unidad)}, "
            f"el {_cuando(extremo.fecha_hora)}."
        )
        return {"texto": f"{directo} {base}"}
    if pide == "promedio":
        return {
            "texto": f"{_En(descripcion)}, la {nombre} de {dispositivo.nombre} promedió "
            f"{_fmt(resumen['promedio'], unidad)}. {ahora}"
        }
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
            f"Hubo {_n(sobre, 'lectura')} sobre el máximo de {nombre} ({float(limite):g} {unidad}) "
            f"{_en(descripcion)} en {dispositivo.nombre}, "
            f"en {_n(len(dias_vistos), 'día', 'días distintos')}; "
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
    desde, hasta, _ = periodo_de(pregunta)
    datos = {}
    if tema in ORDEN_VARIABLES:
        sensores = list(dispositivo.sensores.values_list("num", flat=True))
        lecturas = Lectura.objects.filter(
            sensor_num__in=sensores,
            variable_codigo=tema,
            estabilizada=True,
            fecha_hora__gte=desde,
            fecha_hora__lt=hasta,
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
            umbral__dispositivo=dispositivo, fecha_hora__gte=desde, fecha_hora__lt=hasta
        ).count()
    return datos


# Nico AI solo entiende y responde en español. Palabras muy comunes de cada idioma: si la
# pregunta tiene más de otro idioma que de español, no se procesa.
ESPANOL = frozenset(
    "el la los las un una de del que y en es por para con como cual cuales cuanto cuanta "
    "esta estan este fue hay hoy ayer dame muestra muestrame mi mis se lo le al me sobre "
    "temperatura humedad aire alertas alerta reporte grafica semana mes dias cuando donde "
    "porque hola gracias quiero puedes ver ultimo ultima pasada pasado sin mas menos les "
    "qual".split()
)
OTROS = frozenset(
    "the what how is are was were show give me please my of and in to for with which when "
    "where why does do did can could would should this that these those it its last week "
    "month today yesterday temperature humidity air quality alerts alert report chart graph "
    "hello hi thanks thank you current now level levels data device average maximum "
    "minimum le les des est une avec pour quel quelle der die das und ist ein eine mit wie "
    "os um uma com quais voce".split()
)


def es_espanol(texto):
    """``False`` si el texto está claramente en otro idioma (inglés, francés, alemán, portugués)."""
    palabras = re.findall(r"[a-zñ]+", _normalizar(texto))
    if not palabras:
        return True
    esp = sum(w in ESPANOL for w in palabras)
    otros = sum(w in OTROS and w not in ESPANOL for w in palabras)
    return not ((otros >= 2 and otros > esp) or (esp == 0 and otros >= 1))


SOLO_ESPANOL = (
    "Solo entiendo y respondo en español. Escribe tu pregunta en español, por ejemplo: "
    "«¿Cómo está la temperatura?» o «Genera el reporte de esta semana»."
)


def _fecha_en(texto, hoy):
    """Fecha concreta del texto («el 3 de noviembre», «3 de nov de 2026», «03/11/2026») a las
    00:00 locales, o ``None``. Sin año es el de este año (puede quedar en el futuro)."""
    m = re.search(
        r"\b(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")(?:\s+(?:de|del)\s+(\d{4}))?", texto
    )
    if m:
        dia, mes, anio = int(m.group(1)), MESES.index(m.group(2)) + 1, m.group(3)
    else:
        m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{4}))?\b", texto)
        if not m:
            return None
        dia, mes, anio = int(m.group(1)), int(m.group(2)), m.group(3)
    try:
        return hoy.replace(year=int(anio) if anio else hoy.year, month=mes, day=dia)
    except ValueError:
        return None


# Lo que se pregunta del futuro no tiene lecturas: no se responde (ni la IA hace pronósticos).
FUTURO = re.compile(
    r"\b(pasado manana|proxim[oa]s?|que viene|siguiente (semana|mes|ano|dia)|futuro|"
    r"pronostic\w*|predic\w*|prever|va a (subir|bajar|haber|estar|ser|llegar|pasar|llover)|"
    r"van a (subir|bajar|haber|estar|ser|llegar|pasar)|vaya a (subir|bajar|haber|llegar)|"
    r"(subira|bajara|pasara|ocurrira|llegara|marcara|alcanzara|aumentara|disminuira|empeorara|mejorara)|"
    r"dentro de (\d+|un|una|unos|unas|poco|pocos) ?(minutos?|horas?|dias?|semanas?|meses|anos?)?\b)"
)


def pide_futuro(pregunta, ahora=None):
    """True si la pregunta es sobre algo que todavía no pasa: «mañana», «la próxima semana»,
    «¿subirá la humedad?», o una fecha, mes o año posterior a hoy."""
    ahora = timezone.localtime(ahora or timezone.now())
    hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    texto = f" {_normalizar(pregunta)} "
    # «mañana» es futuro, salvo «por/en/de/esta la mañana» (la parte del día).
    if re.search(r"(?<!la )(?<!esta )\bmanana\b", texto):
        return True
    if FUTURO.search(texto):
        return True
    fecha = _fecha_en(texto, hoy)
    if fecha is not None and fecha > hoy:
        return True
    for anio in re.findall(r"\b(20\d{2})\b", texto):
        anio = int(anio)
        if anio > hoy.year:
            return True
        if anio == hoy.year:
            for i, nombre in enumerate(MESES, start=1):
                if re.search(rf"\b{nombre}\s+(de\s+|del\s+)?{anio}", texto) and i > hoy.month:
                    return True
    return False


# «te pedí la última medición», «me refería al aire», «no de los últimos 7 días»: el usuario
# corrige la respuesta anterior; la corrección se completa con el tema de la pregunta anterior.
CORRIGE = re.compile(
    r"\b(te pedi|te dije|yo pedi|lo que pedi|me referia|quise decir|quiero decir|mas bien)\b|"
    r"\bno (de|del|en|es|era|sobre|para|la|el|los|las) "
)
# «no de los últimos 7 días»: lo negado no se pide (se quita antes de interpretar).
NEGADO = re.compile(r",?\s*\bno (?:de|del|en|es|era|sobre|para|la|el|los|las) [^,.;!?]*", re.I)
# Comentarios sobre las respuestas («solo dame eso cuando te lo pida», «te equivocaste»).
COMENTARIO = re.compile(
    r"\b(solo dame|cuando te lo pid|no te pedi|eso no (es|era)|te equivocaste|no es lo que|"
    r"no me sirve|esta mal|estas mal|no entendiste|no era eso|no te entend|deja de|no hagas)"
)
# Palabras de la pregunta anterior que dan su tema e intención a una corrección.
ARRASTRE = re.compile(
    r"^(temperatura|calor|frio|grados|humedad|bochorno|aire|co2|eco2|calidad|olor|alertas?|"
    r"bateria|senal|conexion|grafic[ao]s?|dashboard|tablero|compara\w*|maxim[oa]|minim[oa]|"
    r"promedio|reporte|informe)$"
)


# ── Entender antes de responder ─────────────────────────────────────────────────────────
VOCALES = set("aeiou")


def _al_azar(w):
    w = _normalizar(w)
    if not re.fullmatch(r"[a-zñ]+", w) or w in ("co2", "eco2", "ppm"):
        return False
    pocas_vocales = len(w) >= 7 and sum(c in VOCALES for c in w) / len(w) < 0.25
    return len(w) >= 22 or pocas_vocales or (len(w) >= 7 and bool(re.search(r"[^aeiou]{5,}", w)))


def sin_sentido(texto):
    """Palabras tecleadas al azar («anskjndiaidsbajswdbjbk») y el texto sin ellas."""
    raras = [w for w in texto.split() if _al_azar(w.strip("¿?¡!.,;:"))]
    limpio = " ".join(w for w in texto.split() if w not in raras)
    return raras, limpio


# «¿qué sensores tiene?», «el primer sensor», «sensor 2».
SENSORES = re.compile(
    r"\b(que|cuales|cuantos) sensores|\bsensores (tiene|hay|instalados)|\blista de sensores|"
    r"\b(primer|segundo|tercer|cuarto)o? sensor|\bsensor (\d)\b|\bsensor (uno|dos|tres)\b|"
    r"\bcomo (estan|esta|van|funcionan) (los |sus |el |mis )?sensor(es)?\b|"
    r"\bestado de (los |sus |mis )?sensores\b"
)
ORDINALES = {"primer": 1, "segundo": 2, "tercer": 3, "cuarto": 4, "uno": 1, "dos": 2, "tres": 3}


def _variables_del_sensor(sensor):
    funcion = _normalizar(sensor.funcion or "")
    return [
        c
        for c, palabra in (("TEMP", "temperatura"), ("HUM", "humedad"), ("AIRE", "aire"))
        if palabra in funcion
    ]


def sensores(dispositivo, pregunta):
    """Los sensores del dispositivo, o uno por su orden («el primer sensor») con su lectura."""
    m = SENSORES.search(_normalizar(pregunta))
    if not m:
        return None
    lista = list(dispositivo.sensores.select_related("estado_sensor").order_by("num"))
    if not lista:
        return {"texto": f"{dispositivo.nombre} no tiene sensores registrados."}

    def ficha(i, s):
        calibrado = f", calibrado el {s.fecha_calibracion:%d/%m/%Y}" if s.fecha_calibracion else ""
        estado = s.estado_sensor.nombre.lower() if hasattr(s.estado_sensor, "nombre") else ""
        return f"{i}) {s.modelo}: {(s.funcion or 'sin función registrada').lower()}" + (
            f" ({estado}{calibrado})" if estado or calibrado else ""
        )

    orden = m.group(3) or m.group(4) or m.group(5)
    if orden:
        n = int(orden) if orden.isdigit() else ORDINALES[orden]
        if n > len(lista):
            return {
                "texto": f"{dispositivo.nombre} solo tiene {_n(len(lista), 'sensor', 'sensores')}: "
                + "; ".join(ficha(i, s) for i, s in enumerate(lista, 1))
                + "."
            }
        s = lista[n - 1]
        lectura = ultima_medicion(dispositivo, _variables_del_sensor(s)) or ""
        return {"texto": f"Sensor {ficha(n, s)[3:]}. {lectura}".strip()}
    return {
        "texto": f"{dispositivo.nombre} tiene {_n(len(lista), 'sensor', 'sensores')}: "
        + "; ".join(ficha(i, s) for i, s in enumerate(lista, 1))
        + ". Pregúntame por uno, por ejemplo «el primer sensor», o por una variable."
    }


NO_LUGAR = {
    "tengo",
    "hay",
    "tiene",
    "tienes",
    "existen",
    "existe",
    "puedo",
    "son",
    "registradas",
    "disponibles",
    "tenemos",
    "con",
    "sin",
    "estan",
    "de",
    "del",
    "la",
    "el",
    "mi",
    "su",
    "tu",
    "esta",
    "este",
    "esa",
    "ese",
    "actual",
    "que",
    "donde",
    "completa",
    "completo",
    "toda",
    "todo",
    "entera",
    "general",
    "y",
    "o",
    "en",
}
LUGAR = re.compile(
    r"\b(?:area|zona|sala|departamento|sucursal|seccion)s?\s+(?:de\s+|del\s+)?([a-z0-9ñ]+)"
)
OTRO_DISPOSITIVO = re.compile(r"\b(nc-\d{3,5})\b|\bnucleo\s+([a-z]-?\d{1,3})\b")


def _parecido(a, b):
    if a == b:
        return True
    if min(len(a), len(b)) < 3:  # «a», «de»: no sirven para comparar nombres
        return False
    return a.startswith(b) or b.startswith(a) or SequenceMatcher(None, a, b).ratio() >= 0.8


def areas_visibles(usuario):
    """Áreas con dispositivos que el usuario puede ver, con sus dispositivos."""
    from common.scoping import dispositivos_visibles

    areas = {}
    for d in (
        dispositivos_visibles(usuario).select_related("area").order_by("area__nombre", "nombre")
    ):
        areas.setdefault(d.area.nombre, []).append(d.nombre)
    return areas


def _lista_areas(usuario, con_dispositivos=False):
    areas = areas_visibles(usuario) if usuario is not None else {}
    if not areas:
        return ""
    if not con_dispositivos:
        return "Las áreas que puedes consultar son: " + ", ".join(areas) + "."
    return (
        "Las áreas que puedes consultar son: "
        + "; ".join(f"{a} ({', '.join(ds)})" for a, ds in areas.items())
        + "."
    )


# Observación sobre el ambiente, no pregunta: «aquí hace mucho calor», «huele raro».
OBSERVA = re.compile(
    r"^(aqui |aca |ahorita |ahora |hoy |siento que |creo que |como que )*(hace|se siente|siento|"
    r"esta|huele|hay|anda|se nota|me estoy)\b"
)
# El usuario reporta una falla del equipo: estado del dispositivo y de sus sensores.
FALLA = re.compile(
    r"\b(falla|fallando|no funciona|no sirve|descompuest|no marca|no mide|no lee|marca mal|"
    r"mide mal|se trabo|se congelo|no actualiza|no se actualiza|no manda|no envia|averiad)"
)


def es_observacion(pregunta):
    texto = _normalizar(pregunta).strip(" ¡!.")
    return "?" not in pregunta and bool(OBSERVA.match(texto))


def reporta_falla(pregunta):
    return bool(FALLA.search(_normalizar(pregunta)))


def lugar_pedido(dispositivo, pregunta):
    """Área o dispositivo ajeno que nombra la pregunta: ``(tipo, nombre, otra_area)`` con tipo
    ``"no_existe"``, ``"otra_area"`` o ``"otro_dispositivo"``; ``None`` si es sobre este."""
    texto = _normalizar(pregunta)
    propia = dispositivo.area
    for nombre in LUGAR.findall(texto):
        if nombre in NO_LUGAR:
            continue
        if any(_parecido(nombre, w) for w in re.findall(r"[a-z0-9ñ]+", _normalizar(propia.nombre))):
            continue
        otras = [
            a
            for a in Area.objects.filter(organizacion_id=propia.organizacion_id)
            if any(_parecido(nombre, w) for w in re.findall(r"[a-z0-9ñ]+", _normalizar(a.nombre)))
        ]
        return ("otra_area", nombre, otras[0]) if otras else ("no_existe", nombre, None)
    # Otra área nombrada sin decir «área»: «¿cómo estuvo la temperatura en Moldeo?».
    palabras = set(re.findall(r"[a-z0-9ñ]+", texto))
    for a in Area.objects.filter(organizacion_id=propia.organizacion_id).exclude(pk=propia.pk):
        nombre = _normalizar(a.nombre)
        if len(nombre) >= 4 and (
            nombre in palabras or (" " in nombre and re.search(rf"\b{re.escape(nombre)}\b", texto))
        ):
            return ("otra_area", nombre, a)
    m = OTRO_DISPOSITIVO.search(texto)
    if m:
        pedido = m.group(1) or m.group(2).replace("-", "")
        propio = {
            _normalizar(dispositivo.codigo_mqtt),
            _normalizar(dispositivo.nombre).replace("-", ""),
        }
        if not any(pedido.replace("-", "") in p.replace("-", "") for p in propio):
            return ("otro_dispositivo", pedido, None)
    return None


# «El de este área», «aquí», «mi área»: el área del propio dispositivo.
PROPIA = re.compile(
    r"\b(est[ea] area|esta zona|esta sala|mi area|nuestra area|aqui|aca|este lugar|"
    r"(el|la|lo) de (este|esta|aqui|aca)|de este|de esta)\b"
)


def refiere_propia(dispositivo, pregunta):
    """La pregunta habla del área del propio dispositivo (por referencia o por su nombre)."""
    texto = _normalizar(pregunta)
    propia = [
        w for w in re.findall(r"[a-z0-9ñ]+", _normalizar(dispositivo.area.nombre)) if len(w) >= 4
    ]
    return bool(PROPIA.search(texto)) or any(re.search(rf"\b{w}\b", texto) for w in propia)


def sin_lugar(dispositivo, pregunta):
    """La pregunta sin el área ajena que nombraba, para responderla con este dispositivo."""
    texto = _normalizar(pregunta)
    texto = re.sub(
        r"\b(en|de|del|para)?\s*(el |la )?(area|zona|sala|departamento|sucursal)s?\s+"
        r"(de\s+|del\s+)?[a-z0-9ñ]+",
        " ",
        texto,
    )
    otras = Area.objects.filter(organizacion_id=dispositivo.area.organizacion_id).exclude(
        pk=dispositivo.area_id
    )
    for a in otras:
        nombre = re.escape(_normalizar(a.nombre))
        texto = re.sub(rf"\b(en|de|del|para)?\s*(el |la )?{nombre}\b", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def insiste_fuera(dispositivo, pregunta, anterior, usuario=None):
    """Respuesta a «sí la tengo» / «pero sí existe» después de un área o dispositivo ajeno:
    no se junta con la pregunta anterior (daría los datos de este dispositivo)."""
    lugar = lugar_pedido(dispositivo, anterior) if anterior else None
    if (
        lugar is None
        or _tema(pregunta) is not None
        or pide_ultima(pregunta)  # pide algo concreto de este dispositivo: se responde
        or lugar_pedido(dispositivo, pregunta)
    ):
        return None
    tipo, nombre, otra = lugar
    areas = _lista_areas(usuario)
    if tipo == "no_existe":
        return (
            f"Revisé de nuevo y no hay un área «{nombre}» registrada en tu organización, así que "
            f"no tengo lecturas suyas. {areas} Si el área existe, un administrador debe darla de "
            "alta en Empresa y áreas y asignarle un dispositivo; después podrás consultarla con "
            "el agente de ese dispositivo."
        ).replace("  ", " ")
    if tipo == "otra_area":
        return (
            f"Sí, el área {otra.nombre} existe, pero este agente es de {dispositivo.nombre} "
            f"({dispositivo.area.nombre}) y solo ve sus sensores. Elige en el selector de Nico AI "
            f"el agente de un dispositivo de {otra.nombre}. {areas}"
        ).strip()
    return (
        f"Este agente solo ve {dispositivo.nombre}. Para otro dispositivo, elige su agente en el "
        f"selector de Nico AI. {areas}"
    ).strip()


def fuera_de_alcance(dispositivo, pregunta, usuario=None):
    """Texto si la pregunta es sobre otra área u otro dispositivo (o un área que no existe);
    ``None`` si es sobre este dispositivo. Cada agente solo ve su dispositivo."""
    from .herramientas import pide_areas

    lugar = None if pide_areas(pregunta) else lugar_pedido(dispositivo, pregunta)
    if lugar is None:
        return None
    tipo, nombre, otra = lugar
    propia = dispositivo.area
    if tipo == "otra_area":
        return (
            f"Este agente es de {dispositivo.nombre} y solo ve sus sensores, que están en el "
            f"área {propia.nombre}. Para {otra.nombre}, abre el agente de uno de los "
            "dispositivos de esa área."
        )
    if tipo == "no_existe":
        return (
            f"No hay un área llamada «{nombre}» en tu organización. {dispositivo.nombre} está en "
            f"el área {propia.nombre}. {_lista_areas(usuario)}"
        ).strip()
    return (
        f"Este agente solo responde sobre {dispositivo.nombre}. Para otro dispositivo, "
        "elige su agente en el selector de Nico AI."
    )


def resumen_general(dispositivo, desde, hasta, descripcion, pide=None):
    """Sin variable nombrada («medidas del sensor»): las tres variables en un solo texto."""
    sensores = list(dispositivo.sensores.values_list("num", flat=True))
    partes = []
    for codigo in ORDEN_VARIABLES:
        lecturas = Lectura.objects.filter(
            sensor_num__in=sensores,
            variable_codigo=codigo,
            estabilizada=True,
            fecha_hora__gte=desde,
        )
        if hasta is not None:
            lecturas = lecturas.filter(fecha_hora__lt=hasta)
        r = lecturas.aggregate(promedio=Avg("valor"), minimo=Min("valor"), maximo=Max("valor"))
        if r["promedio"] is None:
            continue
        variable = VariableAmbiental.objects.get(pk=codigo)
        nombre, unidad = variable.nombre.lower(), variable.unidad
        if pide in ("maximo", "minimo"):
            e = lecturas.order_by("-valor" if pide == "maximo" else "valor").first()
            partes.append(f"{nombre} {_fmt(e.valor, unidad)} (el {_cuando(e.fecha_hora)})")
        elif pide == "promedio":
            partes.append(f"{nombre} {_fmt(r['promedio'], unidad)}")
        else:
            partes.append(
                f"{nombre} promedió {_fmt(r['promedio'], unidad)} "
                f"(de {_fmt(r['minimo'], unidad)} a {_fmt(r['maximo'], unidad)})"
            )
    if not partes:
        return {"texto": f"{dispositivo.nombre} no tiene lecturas {_en(descripcion)}."}
    lista = "; ".join(partes)
    titulo = {"maximo": "Máximas", "minimo": "Mínimas", "promedio": "Promedios"}.get(pide)
    if titulo:
        return {"texto": f"{titulo} de {dispositivo.nombre} {_en(descripcion)}: {lista}."}
    return {
        "texto": f"{_En(descripcion)}, {dispositivo.nombre}: {lista}. Pregúntame por una "
        "variable para ver su detalle, picos y gráfica."
    }


# Cortesía sin petición («gracias», «hola», «ok»): se responde corto y sin consultar nada.
CORTESIA = re.compile(
    r"^(muchas |mil )?(gracias|grax|ok|okay|vale|perfecto|excelente|genial|listo|entendido|"
    r"de acuerdo|hola|buenas|buenos dias|buenas tardes|buenas noches|adios|bye|hasta luego)"
    r"( (gracias|nico|nico ai))?[\s!.?]*$"
)


# Respuestas cortas a lo que dijo el agente: «sí», «claro», «no», «no era eso».
AFIRMA = re.compile(
    r"^(si|sip|claro|dale|va|ok si|si por favor|por favor|exacto|eso|eso mero|correcto|"
    r"afirmativo|asi es|andale|sale|si claro|claro que si|si eso|eso quiero|esa)[\s!.,]*$"
)
NIEGA = re.compile(
    r"^(no|nop|nel|no gracias|para nada|negativo|no era eso|no es eso|eso no|no quiero eso|"
    r"nada|ninguno|ninguna|asi esta bien|ya no|no necesito nada)[\s!.,]*$"
)


def _corta(pregunta):
    return _normalizar(pregunta).strip(" ¡¿!?.,")


def es_afirmacion(pregunta):
    return bool(AFIRMA.match(_corta(pregunta)))


def es_negacion(pregunta):
    return bool(NIEGA.match(_corta(pregunta)))


def duda(dispositivo, pregunta):
    """Mensaje directo cuando la pregunta es del tema pero no se sabe qué pide: se dice la
    duda y se ofrecen opciones concretas (y queda registrada para mejorar las herramientas)."""
    return {
        "texto": f"No estoy seguro de qué necesitas con «{pregunta[:60]}». ¿Te refieres a la "
        f"última medición de {dispositivo.nombre}, a cómo estuvo una variable (temperatura, "
        "humedad o calidad del aire), a sus alertas, a sus sensores o a una gráfica? Dímelo y "
        "lo reviso.",
        "duda": True,
    }


# Preguntar por el agente mismo («¿cómo estás?», «¿y tú estás bien?»), con o sin saludo.
BIENESTAR = re.compile(
    r"\b(como estas|como te va|como te sientes|como te encuentras|como has estado|como andas|"
    r"estas bien|que tal estas|todo bien contigo|y tu que tal|y tu como estas)\b|^(y tu|y a ti)$"
)
SALUDO = re.compile(r"^(hola|hey|que onda|saludos|buen(os|as)( dias| tardes| noches)?|que tal)\b")


def pregunta_bienestar(pregunta):
    texto = _normalizar(pregunta).strip(" ¡¿!?.")
    return bool(BIENESTAR.search(texto)) and len(texto.split()) <= 8 and _tema(pregunta) is None


def es_cortesia(pregunta):
    texto = _normalizar(pregunta).strip(" ¡¿")
    return bool(CORTESIA.match(texto)) or pregunta_bienestar(pregunta)


def es_comentario(pregunta):
    return bool(COMENTARIO.search(_normalizar(pregunta)))


def con_contexto(pregunta, anterior):
    """Completa un seguimiento o una corrección con la pregunta anterior de la conversación.

    «¿y el dashboard?» o «¿y el mes pasado?» no nombran variable ni tema: se responden sobre
    lo que se preguntó antes («dame un dashboard de la temperatura»). Una corrección («te pedí
    la última medición, no los últimos 7 días») toma de la anterior solo el tema y la intención
    (variable, gráfica, máxima…) y su propio periodo. Si la pregunta ya tiene tema, va sola.
    """
    limpia = NEGADO.sub("", pregunta).strip() or pregunta
    if not anterior or es_comentario(limpia) or pregunta_bienestar(limpia):
        return limpia
    tema = _tema(limpia)
    corrige = bool(CORRIGE.search(_normalizar(pregunta)))
    if tema not in (None, "GENERICA") or (not corrige and len(limpia.split()) > 8):
        return limpia
    if _tema(anterior) is None:
        return limpia
    nombra_periodo = periodo_de(limpia)[2] != periodo_de("")[2] or pide_ultima(limpia)
    if _tema(anterior) == "GENERICA" and not (nombra_periodo or _dato_pedido(limpia)):
        # Una pregunta genérica anterior no da tema: solo se arrastra si se pide otro periodo.
        return limpia
    if corrige or nombra_periodo:
        claves = [w for w in re.findall(r"[a-z0-9]+", _normalizar(anterior)) if ARRASTRE.match(w)]
        return f"{' '.join(claves)} {limpia}"
    return f"{anterior} {limpia}"


# «la última medición», «la lectura más reciente», «el valor actual».
ULTIMA = re.compile(
    r"\bultim[oa]s? (medicion|medida|lectura|dato|registro|valor|muestra)|"
    r"\b(medicion|lectura|valor|dato) (actual|mas reciente)|\bmas reciente\b|"
    r"\blo ultimo (que )?(tienes|tengas|hay|haya|se )?(registrad|guardad|medid|leid)?|"
    r"\bultimo (registrad|guardad)|\bultimas? lecturas?\b"
)


def pide_ultima(pregunta):
    return bool(ULTIMA.search(_normalizar(pregunta)))


def ultima_medicion(dispositivo, codigos):
    """Texto con la última lectura de cada variable pedida (y si está en rango) o ``None``."""
    sensores = list(dispositivo.sensores.values_list("num", flat=True))
    partes, cuando = [], None
    for codigo in codigos:
        lectura = (
            Lectura.objects.filter(
                sensor_num__in=sensores, variable_codigo=codigo, estabilizada=True
            )
            .order_by("-fecha_hora")
            .first()
        )
        if lectura is None:
            continue
        variable = VariableAmbiental.objects.get(pk=codigo)
        umbral = dispositivo.umbrales.filter(variable_id=codigo, activo=True).first()
        estado = ""
        if umbral is not None:
            bajo, alto = float(umbral.advertencia_min), float(umbral.advertencia_max)
            dentro = bajo <= float(lectura.valor) <= alto
            estado = (
                f", dentro del rango ({bajo:g}–{alto:g} {variable.unidad})"
                if dentro
                else f", FUERA del rango ({bajo:g}–{alto:g} {variable.unidad})"
            )
        partes.append(f"{variable.nombre.lower()} {_fmt(lectura.valor, variable.unidad)}{estado}")
        cuando = max(cuando, lectura.fecha_hora) if cuando else lectura.fecha_hora
    if not partes:
        return None
    if len(partes) == 1:
        return f"La última medición de {dispositivo.nombre} fue del {_cuando(cuando)}: {partes[0]}."
    return (
        f"La última medición de {dispositivo.nombre} fue del {_cuando(cuando)}: "
        + "; ".join(partes[:-1])
        + f" y {partes[-1]}."
    )


def responder(dispositivo, pregunta, usuario=None):
    """Respuesta del agente del dispositivo: ``{"texto", "picos"?, "serie"?, ...}``. Con
    ``usuario``, la conversación (saludos) lo llama por su nombre."""
    from . import personalidad

    por_sensor = sensores(dispositivo, pregunta)
    if por_sensor is not None:
        return por_sensor
    tema = _tema(pregunta)
    desde, hasta, descripcion = periodo_de(pregunta)
    if tema is None and pide_ultima(pregunta):
        # «Dame lo último que tienes registrado»: la última medición de cada variable.
        texto = ultima_medicion(dispositivo, list(ORDEN_VARIABLES))
        return {"texto": texto or f"{dispositivo.nombre} todavía no tiene lecturas."}
    if tema is None and es_afirmacion(pregunta):
        return {"texto": personalidad.afirmacion(dispositivo)}
    if tema is None and es_negacion(pregunta):
        return {"texto": personalidad.negacion(dispositivo)}
    if tema is None and pregunta_bienestar(pregunta):
        saludo = bool(SALUDO.match(_normalizar(pregunta).strip(" ¡¿")))
        return {"texto": personalidad.bienestar(usuario, dispositivo, saludo)}
    if tema is None and es_cortesia(pregunta):
        saludo = bool(
            re.match(r"(hola|buen|buenas|hey|que onda|saludos)", _normalizar(pregunta).strip(" ¡¿"))
        )
        return {"texto": personalidad.cortesia(usuario, dispositivo, pregunta, saludo)}
    if tema is None and es_comentario(pregunta):
        return {
            "texto": "Entendido, gracias por avisar. Marca como no útil la respuesta que no te "
            "sirvió para que no se repita, y pídeme justo lo que necesitas, por ejemplo: «la "
            "última medición del aire», «la temperatura de ayer» o «gráfica de la humedad de esta "
            "semana»."
        }
    if tema is None:
        return {
            "texto": f"Solo puedo responder sobre {dispositivo.nombre} y sus sensores: cómo está "
            "ahora, su temperatura, humedad o calidad del aire, sus alertas, su conexión o un "
            "reporte. ¿Qué quieres revisar?"
        }
    if tema == "CONEXION":
        return _conexion(dispositivo)
    if tema == "ALERTAS":
        return _alertas(dispositivo, desde, hasta, descripcion)
    if pide_ultima(pregunta) and tema in (*ORDEN_VARIABLES, "GENERICA"):
        codigos = ORDEN_VARIABLES if tema == "GENERICA" else (tema,)
        texto = ultima_medicion(dispositivo, codigos)
        if texto is None:
            de = (
                ""
                if tema == "GENERICA"
                else f" de {VariableAmbiental.objects.get(pk=tema).nombre.lower()}"
            )
            texto = f"{dispositivo.nombre} todavía no tiene lecturas{de}."
        return {"texto": texto}
    if tema == "GENERICA":
        return resumen_general(dispositivo, desde, hasta, descripcion, _dato_pedido(pregunta))
    return _variable(dispositivo, tema, desde, hasta, descripcion, pide=_dato_pedido(pregunta))


# «¿por qué subió?», «¿es grave?»: el modelo pequeño inventa causas; se responde con lo que
# sí dicen las lecturas (cuándo fue el máximo y el mínimo, y si salió del rango), sin IA.
PORQUE = re.compile(r"\b(por ?que|a que se debe|cual es la causa|que (lo )?causo|como es que)\b")
GRAVEDAD = re.compile(
    r"\b(es grave|es normal|es malo|es bueno|es peligros|preocup|alarmante|riesgo|esta bien)"
)


def _primera_frase(texto):
    return texto.split(". ", 1)[0].rstrip(".") + "."


def explicar(dispositivo, pregunta):
    """Respuesta sin IA para «por qué» y «es grave» sobre una variable, o ``None``."""
    tema = _tema(pregunta)
    if tema not in ORDEN_VARIABLES:
        return None
    normal = _normalizar(pregunta)
    porque, gravedad = bool(PORQUE.search(normal)), bool(GRAVEDAD.search(normal))
    if not (porque or gravedad):
        return None
    desde, hasta, descripcion = periodo_de(pregunta)
    general = _variable(dispositivo, tema, desde, hasta, descripcion)["texto"]
    if "promedió" not in general:  # sin lecturas en el periodo
        return {"texto": general}
    nombre = VariableAmbiental.objects.get(pk=tema).nombre.lower()
    fuera = "se mantuvo dentro del rango" not in general
    if gravedad and not porque:
        inicio = (
            "Conviene revisarlo: hubo lecturas fuera del rango. "
            if fuera
            else "No hay de qué preocuparse: "
        )
        return {"texto": inicio + general}
    maxima = _variable(dispositivo, tema, desde, hasta, descripcion, "maximo")["texto"]
    minima = _variable(dispositivo, tema, desde, hasta, descripcion, "minimo")["texto"]
    rango = (
        "Hubo lecturas fuera del rango. " if fuera else "Todo el periodo estuvo dentro del rango. "
    )
    return {
        "texto": f"Las lecturas no indican la causa de los cambios de {nombre}, pero sí cuándo "
        f"pasaron: {_primera_frase(maxima)} {_primera_frase(minima)} {rango}"
        "Revisa qué pasaba en el lugar en esos momentos (ventilación, puertas o equipos)."
    }


def _dato_pedido(pregunta):
    """Qué cifra concreta se pide: «máxima», «mínima» o «promedio» (o ``None``)."""
    texto = _normalizar(pregunta)
    if re.search(
        r"\b(maxim[oa]|mas alt[oa]|pico mas|tope|que tan alt[oa]|hasta donde (llego|subio)|"
        r"cuanto (llego|subio)|lo mas que)\b",
        texto,
    ):
        return "maximo"
    if re.search(r"\b(minim[oa]|mas baj[oa]|que tan baj[oa]|cuanto bajo|lo menos que)\b", texto):
        return "minimo"
    if re.search(r"\b(promedio|media)\b", texto):
        return "promedio"
    return None


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

    horas = re.search(r"ultimas?\s+(\d{1,3})\s*(h|horas)\b", texto)
    if horas:
        n = max(1, min(int(horas.group(1)), 72))
        return ahora - timedelta(hours=n), ahora, f"las últimas {n} horas"
    # «últimos 3 días», «últimas 2 semanas», «últimos 6 meses», «último año»
    tramo = re.search(r"ultim[oa]s?\s+(\d{1,3})?\s*(dias?|semanas?|meses|mes|anos?)\b", texto)
    if tramo:
        n = int(tramo.group(1) or 1)
        unidad = tramo.group(2)
        dias = {"d": 1, "s": 7, "m": 30, "a": 365}[unidad[0]] * n
        dias = max(1, min(dias, 366))
        nombre = {
            "d": ("día", "días"),
            "s": ("semana", "semanas"),
            "m": ("mes", "meses"),
            "a": ("año", "años"),
        }[unidad[0]]
        if n == 1:
            texto_periodo = f"{'la última' if unidad[0] == 's' else 'el último'} {nombre[0]}"
        else:
            texto_periodo = (
                f"{'las últimas' if unidad[0] == 's' else 'los últimos'} {n} {nombre[1]}"
            )
        if unidad[0] == "d" and n == 1:
            texto_periodo = "las últimas 24 horas"
        return ahora - timedelta(days=dias), ahora, texto_periodo
    if "este ano" in texto or "anual" in texto:
        return hoy.replace(month=1, day=1), ahora, f"lo que va de {hoy.year}"
    if "trimestre" in texto:
        return ahora - timedelta(days=90), ahora, "los últimos 3 meses"
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
    fecha = _fecha_en(texto, hoy)
    if fecha is not None:
        inicio = fecha
        fin = min(inicio + timedelta(days=1), ahora)
        return (
            inicio,
            fin,
            f"el {inicio.day} de {MESES[inicio.month - 1]}"
            + ("" if inicio.year == hoy.year else f" de {inicio.year}"),
        )
    for i, nombre in enumerate(MESES, start=1):
        if nombre in texto:
            anio = re.search(r"\b(20\d{2})\b", texto)
            anio = int(anio.group(1)) if anio else hoy.year
            if not re.search(r"\b20\d{2}\b", texto) and i > hoy.month:
                anio -= 1  # «octubre» en enero se refiere al octubre pasado
            return mes(anio, i)
    return ahora - PERIODO, ahora, "los últimos 7 días"


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
