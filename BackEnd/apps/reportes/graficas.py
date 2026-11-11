"""Gráficas sueltas y comparativas que pide Nico AI, sin generar un reporte completo.

Usan las mismas cifras que los reportes (``servicios.calcular_cifras``) y no pasan por la IA:
el texto se arma con plantillas, así que responden al instante y no inventan valores.
Administradores, supervisores y analistas consultan el área del dispositivo; un operador,
solo su dispositivo.
"""

import re
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.dispositivos.models import Dispositivo, Sensor
from apps.mediciones.models import Lectura
from common import roles

from . import agente, servicios

PALABRAS_GRAFICA = (
    "grafica",
    "grafico",
    "graficame",
    "chart",
    "diagrama",
    "dashboard",
    "tablero",
    "visualiza",
    "dibuja",
    "plot",
)
# «cooperativa» se acepta porque así se escribe a veces al pedir una comparativa.
PALABRAS_COMPARATIVA = (
    "compara",
    "comparar",
    "comparativa",
    "comparativo",
    "comparacion",
    "cooperativa",
    "versus",
    " vs ",
    "contra",
    "diferencia entre",
)
PALABRAS_DISPOSITIVOS = ("dispositivos", "equipos", "sensores", "entre los", "por dispositivo")
VARIABLES = tuple((c, claves) for c, claves in agente.TEMAS if c in agente.ORDEN_VARIABLES)
NOMBRES = {"TEMP": "temperatura", "HUM": "humedad", "AIRE": "calidad del aire"}


def _texto(pregunta):
    return f" {agente._normalizar(pregunta)} "


def pide_comparativa(pregunta):
    texto = _texto(pregunta)
    return any(p in texto for p in PALABRAS_COMPARATIVA)


def pide_grafica(pregunta):
    texto = _texto(pregunta)
    return any(p in texto for p in PALABRAS_GRAFICA)


def _variable_de(texto):
    for codigo, claves in VARIABLES:
        if any(c in texto for c in claves):
            return codigo
    return None


def _nombre(cifras, codigo):
    info = cifras["variables"].get(codigo, {})
    return re.sub(r" \(.*\)$", "", info.get("nombre", codigo)).lower()


PALABRAS_AREA = (" area", "todos los dispositivos", "toda la zona", "todo el almacen")


def _alcance(usuario, dispositivo, texto=""):
    """(área, dispositivo) para las cifras. El agente es del dispositivo, así que por defecto
    se usa solo ese dispositivo; el área completa, si se pide («del área», «todos los…») y el
    rol la puede ver (el operador solo ve su dispositivo)."""
    if (
        usuario.rol_id in (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)
        and any(p in texto for p in PALABRAS_AREA)
        and " dispositivo " not in texto
    ):
        return dispositivo.area, None
    return dispositivo.area, dispositivo


def _cifras(usuario, dispositivo, inicio, fin, texto=""):
    area, propio = _alcance(usuario, dispositivo, texto)
    return servicios.calcular_cifras(area.organizacion, area, inicio, fin, dispositivo=propio)


def _donde(usuario, dispositivo, texto=""):
    area, propio = _alcance(usuario, dispositivo, texto)
    return propio.nombre if propio else area.nombre


DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def _ultimo_dia_registrado(usuario, dispositivo, texto):
    """Día (local) de la lectura más reciente del alcance: ``(inicio, fin, descripcion)``."""
    area, propio = _alcance(usuario, dispositivo, texto)
    sensores = (
        Sensor.objects.filter(dispositivo=propio)
        if propio
        else Sensor.objects.filter(dispositivo__area=area)
    )
    ultima = (
        Lectura.objects.filter(sensor_num__in=list(sensores.values_list("num", flat=True)))
        .order_by("-fecha_hora")
        .values_list("fecha_hora", flat=True)
        .first()
    )
    if ultima is None:
        return None
    ultima = timezone.localtime(ultima)
    inicio = ultima.replace(hour=0, minute=0, second=0, microsecond=0)
    dia = f"{DIAS_LARGOS[inicio.weekday()]} {inicio.day} de {agente.MESES[inicio.month - 1]}"
    return inicio, inicio + timedelta(days=1), f"el último día registrado ({dia})"


def grafica(usuario, dispositivo, pregunta):
    """Una sola gráfica (serie de una variable, alertas o cifras clave) del periodo pedido."""
    texto = _texto(pregunta)
    inicio, fin, descripcion = agente.periodo_de(pregunta)
    # «el último día registrado / con datos / con lecturas»: el día de la lectura más reciente.
    if re.search(r"(dia|fecha) (registrad|con (datos|lecturas))|ultim[oa] registr", texto):
        ultimo = _ultimo_dia_registrado(usuario, dispositivo, texto)
        if ultimo is None:
            return {"texto": f"{_donde(usuario, dispositivo, texto)} todavía no tiene lecturas."}
        inicio, fin, descripcion = ultimo
    if inicio >= fin:
        return {"texto": f"Ese periodo ({descripcion}) todavía no tiene datos."}
    cifras = _cifras(usuario, dispositivo, inicio, fin, texto)
    donde = _donde(usuario, dispositivo, texto)
    if not cifras["variables"]:
        return {"texto": f"{donde} no tiene lecturas de {descripcion}, así que no hay gráfica."}
    if "alerta" in texto:
        elemento, variable = "alertas", None
        titulo = f"Alertas por variable en {donde}, {descripcion}."
    elif any(p in texto for p in ("cifras", "indicadores", "kpi")):
        elemento, variable = "cifras", None
        titulo = f"Cifras clave de {donde}, {descripcion}."
    elif _variable_de(texto) is None:
        # Sin variable («gráfica general del dispositivo»): todas las variables, una por gráfica.
        elemento, variable = "general", None
        partes = [
            f"{_nombre(cifras, c)} promedió {agente._fmt(v['promedio'], v['unidad'])} "
            f"({agente._fmt(v['minimo'], v['unidad'])} a {agente._fmt(v['maximo'], v['unidad'])})"
            for c in agente.ORDEN_VARIABLES
            if (v := cifras["variables"].get(c))
        ]
        titulo = f"Resumen de {donde}, {descripcion}: " + "; ".join(partes) + "."
        titulo = titulo[0].upper() + titulo[1:]
    else:
        variable = _variable_de(texto)
        if variable not in cifras["variables"]:
            sin = f"{donde} no tiene lecturas de {NOMBRES[variable]} en {descripcion}."
            return {"texto": sin}
        elemento = "serie"
        info = cifras["variables"][variable]
        titulo = (
            f"La {_nombre(cifras, variable)} de {donde}, {descripcion}: promedió "
            f"{agente._fmt(info['promedio'], info['unidad'])}, con mínimo de "
            f"{agente._fmt(info['minimo'], info['unidad'])} y máximo de "
            f"{agente._fmt(info['maximo'], info['unidad'])}."
        )
    return {
        "texto": titulo,
        "grafica": {
            "elemento": elemento,
            "variable": variable,
            "area": dispositivo.area_id,
            "donde": donde,
            "descripcion": descripcion,
            "periodo_inicio": inicio.isoformat(),
            "periodo_fin": fin.isoformat(),
            "cifras": cifras,
        },
    }


def _periodos(pregunta):
    """Periodo actual y el tramo anterior de la misma duración, con sus nombres."""
    texto = _texto(pregunta)
    ahora = timezone.localtime()
    hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    if " mes" in texto:
        inicio, nombres = hoy.replace(day=1), ("este mes", "el mismo tramo del mes pasado")
    elif "semana" in texto:
        inicio = hoy - timedelta(days=hoy.weekday())
        nombres = ("esta semana", "el mismo tramo de la semana pasada")
    elif " hoy" in texto or "ayer" in texto:
        inicio, nombres = hoy, ("hoy", "ayer a la misma hora")
    else:
        inicio, nombres = ahora - agente.PERIODO, ("los últimos 7 días", "los 7 días anteriores")
    duracion = ahora - inicio
    return (inicio, ahora), (inicio - duracion, inicio), nombres


def _cambio(a, b, unidad):
    if a is None or b is None:
        return ""
    d = a - b
    if abs(d) < 0.05:
        return ", igual que antes"
    return f", {agente._fmt(abs(d), unidad)} {'más' if d > 0 else 'menos'} que antes"


def comparativa(usuario, dispositivo, pregunta):
    texto = _texto(pregunta)
    if any(p in texto for p in PALABRAS_DISPOSITIVOS):
        return _entre_dispositivos(usuario, dispositivo, pregunta)
    (ai, af), (bi, bf), (na, nb) = _periodos(pregunta)
    a = _cifras(usuario, dispositivo, ai, af, texto)
    b = _cifras(usuario, dispositivo, bi, bf, texto)
    donde = _donde(usuario, dispositivo, texto)
    elegida = _variable_de(texto)
    codigos = [c for c in agente.ORDEN_VARIABLES if c in a["variables"] or c in b["variables"]]
    if elegida:
        codigos = [c for c in codigos if c == elegida]
    if not codigos:
        return {"texto": f"{donde} no tiene lecturas para comparar {na} con {nb}."}
    filas, frases = [], []
    for c in codigos:
        va, vb = a["variables"].get(c, {}), b["variables"].get(c, {})
        unidad = va.get("unidad") or vb.get("unidad", "")
        nombre = _nombre(a if va else b, c)
        filas.append(
            {
                "variable": c,
                "nombre": nombre,
                "unidad": unidad,
                "a": {k: va.get(k) for k in ("promedio", "minimo", "maximo")},
                "b": {k: vb.get(k) for k in ("promedio", "minimo", "maximo")},
                "alertas": [
                    a["alertas"]["por_variable"].get(c, 0),
                    b["alertas"]["por_variable"].get(c, 0),
                ],
            }
        )
        if va.get("promedio") is not None:
            frases.append(
                f"La {nombre} promedió {agente._fmt(va['promedio'], unidad)}"
                f"{_cambio(va.get('promedio'), vb.get('promedio'), unidad)}"
            )
    total_a, total_b = a["alertas"]["total"], b["alertas"]["total"]
    alertas = (
        f"Hubo {total_a} alertas contra {total_b}."
        if total_a != total_b
        else f"Hubo {total_a} alertas en ambos tramos."
    )
    return {
        "texto": f"{donde}: {na} contra {nb}. " + ". ".join(frases) + ". " + alertas,
        "comparativa": {
            "tipo": "periodos",
            "donde": donde,
            "columnas": [na, nb],
            "filas": filas,
            "alertas": [total_a, total_b],
        },
    }


def _entre_dispositivos(usuario, dispositivo, pregunta):
    if usuario.rol_id not in (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA):
        return {
            "texto": "Puedo comparar periodos de tu dispositivo, pero no otros dispositivos "
            "del área."
        }
    inicio, fin, descripcion = agente.periodo_de(pregunta)
    area = dispositivo.area
    cifras = servicios.calcular_cifras(area.organizacion, area, inicio, fin)
    nombres = dict(Dispositivo.objects.filter(area=area).values_list("codigo_mqtt", "nombre"))
    por_dispositivo = cifras["dispositivos"]
    if len(por_dispositivo) < 2:
        return {
            "texto": f"{area.nombre} no tiene al menos dos dispositivos con lecturas "
            f"en {descripcion}."
        }
    alertas = dict(
        Alerta.objects.filter(
            umbral__dispositivo__area=area,
            lectura_fecha_hora__gte=inicio,
            lectura_fecha_hora__lt=fin,
        )
        .values_list("umbral__dispositivo__codigo_mqtt")
        .annotate(n=Count("num"))
    )
    elegida = _variable_de(_texto(pregunta))
    filas, frases = [], []
    for c in agente.ORDEN_VARIABLES:
        if c not in cifras["variables"] or (elegida and c != elegida):
            continue
        info = cifras["variables"][c]
        puntos = sorted(
            (
                (nombres.get(codigo, codigo), valores[c]["promedio"])
                for codigo, valores in por_dispositivo.items()
                if c in valores
            ),
            key=lambda p: -p[1],
        )
        nombre = _nombre(cifras, c)
        filas.append({"variable": c, "nombre": nombre, "unidad": info["unidad"], "puntos": puntos})
        alto = agente._fmt(puntos[0][1], info["unidad"])
        frases.append(f"{puntos[0][0]} tuvo la {nombre} más alta ({alto})")
    return {
        "texto": f"Dispositivos de {area.nombre}, {descripcion}: " + "; ".join(frases) + ".",
        "comparativa": {
            "tipo": "dispositivos",
            "donde": area.nombre,
            "descripcion": descripcion,
            "filas": filas,
            "alertas": [[nombres.get(k, k), alertas.get(k, 0)] for k in por_dispositivo],
        },
    }
