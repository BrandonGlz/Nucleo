"""Herramientas de consulta de Nico AI (catálogo).

Cada herramienta es una consulta de solo lectura sobre los datos del proyecto, con lo que el SRS
le pide al agente (3.2.12): responder en lenguaje natural sobre las lecturas, alertas y reportes
de la organización y el área del usuario, sin modificar umbrales, usuarios ni dispositivos, y con
cifras que salen de consultas del backend (la IA no calcula ni inventa valores).

El intérprete (``interprete.py``) decide qué herramienta usar a partir de la petición; el
enrutador con IA (``puente.enrutar``) solo puede elegir entre las de este catálogo; y el
verificador revisa que la respuesta cumpla lo pedido. Agregar una consulta nueva es agregarla
aquí, con su descripción, su requisito y sus pistas.
"""

import re
from dataclasses import dataclass
from datetime import timedelta

from django.utils import timezone

from apps.reportes.models import Reporte
from apps.umbrales.models import Umbral

from . import agente


@dataclass(frozen=True)
class Herramienta:
    nombre: str
    descripcion: str  # para la IA y para la documentación
    srs: str  # requisito o restricción del SRS que atiende
    ejemplo: str


CATALOGO = {
    h.nombre: h
    for h in (
        Herramienta(
            "variable",
            "Cómo estuvo una variable (temperatura, humedad o calidad del aire) en un periodo: "
            "promedio, mínimo, máximo, lecturas fuera del rango y en qué horarios fueron los "
            "picos.",
            "3.2.11 y 3.2.12: consultar una variable de un periodo y los horarios de sus picos.",
            "¿cómo estuvo la humedad la semana pasada?",
        ),
        Herramienta(
            "ultima",
            "La última medición de una o de todas las variables, con fecha y si está en rango.",
            "3.2.12: responder sobre las lecturas registradas.",
            "la última medición del aire",
        ),
        Herramienta(
            "resumen",
            "Resumen de las tres variables del dispositivo en un periodo.",
            "3.2.12: responder sin que el usuario construya consultas.",
            "dame las medidas del sensor de esta semana",
        ),
        Herramienta(
            "alertas",
            "Alertas del dispositivo en un periodo: total, de peligro, por variable y pendientes.",
            "3.2.12: responder sobre las alertas de la organización y el área.",
            "¿hubo alertas ayer?",
        ),
        Herramienta(
            "conexion",
            "Estado del dispositivo (en línea, calentando, sin conexión, batería baja, "
            "mantenimiento), última conexión, batería, muestreo y calentamiento del sensor de "
            "aire.",
            "Restricciones: estados del dispositivo y 20 min de calentamiento del sensor de aire.",
            "¿sigue conectado?",
        ),
        Herramienta(
            "sensores",
            "Sensores instalados en el dispositivo: modelo, función, estado y calibración.",
            "Modelo relacional: sensor por dispositivo.",
            "¿qué sensores tiene?",
        ),
        Herramienta(
            "umbrales",
            "Límites configurados por variable (advertencia y peligro). Solo lectura.",
            "3.2.12: el agente no puede modificar umbrales, solo consultarlos.",
            "¿cuál es el límite de temperatura?",
        ),
        Herramienta(
            "reportes",
            "Reportes ya generados del área del dispositivo (manuales, programados o del agente).",
            "3.2.12: responder sobre los reportes de la organización y el área.",
            "¿qué reportes hay?",
        ),
        Herramienta(
            "areas",
            "Áreas de la organización que el usuario puede consultar y sus dispositivos.",
            "3.2.12: el agente solo consulta la organización y el área del usuario.",
            "¿qué áreas tengo?",
        ),
        Herramienta(
            "grafica",
            "Gráfica de una variable, de las alertas o de todas las variables en un periodo.",
            "3.2.12: ver curvas, picos y tendencias sin construir gráficas.",
            "gráfica de la temperatura de esta semana",
        ),
        Herramienta(
            "comparativa",
            "Comparación de un periodo contra el anterior, o entre dispositivos del área.",
            "3.2.12: identificar tendencias.",
            "compara la humedad de esta semana con la pasada",
        ),
        Herramienta(
            "reporte",
            "Genera un reporte del área en PDF para el periodo pedido.",
            "3.2.12: solicitar reportes al agente.",
            "genera el reporte de octubre",
        ),
    )
}

# Pistas de las consultas nuevas (las demás ya las reconocen las reglas del agente).
UMBRALES = re.compile(
    r"\bumbral(es)?\b|\b(cual|cuales|que|cuanto) (es|son)? ?(el|los|la|las)? ?(limite|rango)|"
    r"\brango (permitido|configurado|normal|aceptable)|\blimites? (configurad|permitid|establecid)|"
    r"\bhasta cuanto (puede|se permite|aguanta)"
)
REPORTES = re.compile(
    r"\b(que|cuales|cuantos|ultimos?|lista de|mis) reportes\b|\breportes (generados|hechos|"
    r"anteriores|que hay|existen|guardados)|\bhay reportes\b|\bultimo reporte\b"
)
# Pedir un cambio: el agente es de solo lectura (SRS 3.2.12).
MODIFICAR = re.compile(
    r"\b(cambia|cambiar|modifica|modificar|ajusta|ajustar|sube|subir|baja|bajar|pon|poner|"
    r"configura|configurar|establece|borra|borrar|elimina|eliminar|desactiva|activa|apaga|"
    r"reinicia|edita|editar|actualiza|actualizar)\b"
)
AREAS = re.compile(
    r"\b(que|cuales|cuantas|mis|lista de|todas las) (areas|zonas|departamentos|sucursales)\b|"
    r"\b(areas|departamentos) (hay|tengo|existen|registrad)|\ben que area\b|\bdonde esta\b"
)
NOMBRE_VARIABLE = {"TEMP": "temperatura", "HUM": "humedad relativa", "AIRE": "calidad del aire"}


def pide_areas(pregunta):
    return bool(AREAS.search(agente._normalizar(pregunta)))


def areas(usuario, dispositivo):
    """Áreas que el usuario puede consultar, con sus dispositivos."""
    lista = agente.areas_visibles(usuario)
    if not lista:
        return {"texto": "No tienes áreas con dispositivos asignados."}
    return {
        "texto": f"{dispositivo.nombre} está en el área {dispositivo.area.nombre}. "
        + agente._lista_areas(usuario, con_dispositivos=True)
        + " Para consultar otra área, elige en el selector de Nico AI el agente de uno de sus "
        "dispositivos."
    }


def pide_umbrales(pregunta):
    return bool(UMBRALES.search(agente._normalizar(pregunta)))


def pide_reportes(pregunta):
    return bool(REPORTES.search(agente._normalizar(pregunta)))


def pide_modificar(pregunta):
    return bool(MODIFICAR.search(agente._normalizar(pregunta)))


SOLO_LECTURA = (
    "No puedo hacer cambios: soy de solo lectura y no modifico umbrales, usuarios ni dispositivos. "
)


def umbrales(dispositivo, variables=(), pregunta=""):
    """Límites activos del dispositivo (todas las variables o las pedidas)."""
    r = _umbrales(dispositivo, variables)
    if pide_modificar(pregunta):
        r["texto"] = SOLO_LECTURA + "Estos son los actuales. " + r["texto"]
    return r


def _umbrales(dispositivo, variables):
    filtro = Umbral.objects.filter(dispositivo=dispositivo, activo=True).select_related("variable")
    if variables:
        filtro = filtro.filter(variable_id__in=variables)
    partes = []
    for u in filtro.order_by("variable_id"):
        unidad = u.variable.unidad
        partes.append(
            f"{u.variable.nombre.lower()}: normal de {float(u.advertencia_min):g} a "
            f"{float(u.advertencia_max):g} {unidad}; peligro por debajo de "
            f"{float(u.peligro_min):g} o por encima de {float(u.peligro_max):g} {unidad}"
        )
    if not partes:
        que = " de " + ", ".join(NOMBRE_VARIABLE[v] for v in variables) if variables else ""
        return {"texto": f"{dispositivo.nombre} no tiene umbrales{que} configurados."}
    return {
        "texto": f"Umbrales de {dispositivo.nombre}: " + "; ".join(partes) + ". Solo los puede "
        "cambiar un administrador o supervisor desde Umbrales; yo solo los consulto."
    }


def reportes(dispositivo, limite=5):
    """Últimos reportes del área del dispositivo (o de toda la organización)."""
    area = dispositivo.area
    lista = list(
        Reporte.objects.filter(organizacion_id=area.organizacion_id, area__in=[area]).order_by(
            "-fecha_generacion"
        )[:limite]
    )
    if not lista:
        return {
            "texto": f"Todavía no hay reportes del área {area.nombre}. Puedes pedirme uno, por "
            "ejemplo: «genera el reporte de esta semana»."
        }
    origen = {"MANUAL": "manual", "PROGRAMADO": "programado", "AGENTE": "pedido al agente"}
    filas = [
        f"#{r.num} del {timezone.localtime(r.periodo_inicio):%d/%m} al "
        f"{timezone.localtime(r.periodo_fin):%d/%m/%Y} ({origen.get(r.origen, r.origen)}, "
        f"{agente._n((r.cifras or {}).get('alertas', {}).get('total', 0), 'alerta')})"
        for r in lista
    ]
    return {
        "texto": f"Últimos reportes del área {area.nombre}: " + "; ".join(filas) + ". Los "
        "encuentras completos, con su PDF, en la sección Reportes."
    }


def conexion(dispositivo, pregunta=""):
    """Estado del dispositivo, con el aviso de calentamiento del sensor de aire (SRS). Si el
    usuario reporta una falla, también el estado de cada sensor."""
    r = agente._conexion(dispositivo)
    if agente.reporta_falla(pregunta):
        estados = [
            f"{s.modelo} {s.estado_sensor.nombre.lower()}"
            for s in dispositivo.sensores.select_related("estado_sensor").order_by("num")
        ]
        r["texto"] = (
            "Reviso el equipo. "
            + r["texto"]
            + (" Sensores: " + ", ".join(estados) + "." if estados else "")
            + " Si notas algo raro en sus lecturas, avisa a un supervisor para que lo revise; "
            "yo no puedo cambiar su configuración."
        )
    return r
    if dispositivo.estado_dispositivo_id == "CALENT" or (
        dispositivo.ultimo_arranque
        and timezone.now() - dispositivo.ultimo_arranque < timedelta(minutes=20)
    ):
        r["texto"] += (
            " El sensor de calidad del aire se está calentando (20 min tras cada arranque): "
            "mientras tanto no genera alertas."
        )
    return r
