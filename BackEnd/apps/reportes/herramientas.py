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

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import cache
from pathlib import Path

from django.utils import timezone

from apps.alertas.models import Alerta
from apps.reportes.models import ProgramacionReporte, Reporte
from apps.umbrales.models import Umbral
from common import roles
from common.scoping import dispositivos_visibles

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
            "Prepara un reporte del área del periodo pedido (dispositivos, lecturas válidas y "
            "alertas) y lo genera solo cuando el usuario confirma.",
            "3.2.12: pedir reportes al agente; cifras del mismo servicio de Reportes.",
            "genera el reporte de octubre",
        ),
        Herramienta(
            "detalle_alerta",
            "Detalle de la última alerta (o la del periodo): lectura que la disparó, umbral, "
            "estado, quién la atendió y cuándo, y cuánto tardó la notificación.",
            "3.2.12 y 3.2.7: responder sobre alertas y su atención.",
            "¿quién atendió la alerta de ayer?",
        ),
        Herramienta(
            "pendientes",
            "Resumen de su alcance: alertas pendientes por nivel y dispositivos sin conexión o "
            "calentando (organización o área del usuario).",
            "3.2.12: el agente consulta la organización y el área del usuario.",
            "¿qué hay pendiente?",
        ),
        Herramienta(
            "programaciones",
            "Programaciones de reportes vigentes: frecuencia, área, destinatarios y próxima "
            "ejecución. Solo lectura.",
            "3.2.10: reportes programados.",
            "¿qué reportes tengo programados?",
        ),
        Herramienta(
            "banco",
            "Respuestas fijas del banco de memoria: qué significa cada nivel, el calentamiento "
            "del CCS811, cuándo se marca «Sin conexión», rangos físicos, normas, qué puede "
            "hacer el agente y lo que no se hace desde el chat.",
            "3.3.3: las explicaciones del sistema no las inventa la IA.",
            "¿por qué dice calentando?",
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


# ── Banco de memoria (conocimiento fijo, sin modelo) ─────────────────────────────────────────

BANCO = Path(__file__).with_name("banco_memoria.json")


@cache
def banco():
    return json.loads(BANCO.read_text(encoding="utf-8"))


def consultar_banco_memoria(intencion=None, texto=None, rol=None):
    """Consulta el banco por intención (campos, ejemplos, preguntas por dato faltante) o por
    palabras clave (explicaciones). Devuelve los textos tal cual, sin generar nada."""
    b = banco()
    if intencion:
        datos = b["intenciones"].get(intencion)
        if datos is None:
            return {"codigo": "no_encontrado"}
        faltan = {
            c: b["preguntas_faltantes"][c]
            for c in datos.get("obligatorios", [])
            if c in b["preguntas_faltantes"]
        }
        return {**datos, "preguntas_faltantes": faltan}
    if rol and not texto:
        return {"texto": b["capacidades"].get(rol, b["capacidades"]["ANALISTA"])}
    explicada = explicacion(texto or "")
    return {"texto": explicada} if explicada else {"codigo": "no_encontrado"}


# «¿Qué significa…?», «¿por qué dice…?», «¿cuándo se marca…?»: piden una explicación.
EXPLICA = re.compile(
    r"\bque (significa|quiere decir|es)\b|\bpor que (dice|aparece|sale|marca|esta)\b|"
    r"\bcuando se (marca|considera|pone)|\bexplica(me)?\b|\bcomo funciona|\bpara que sirve"
)
# Las que no necesitan la forma de pregunta (normas y rangos físicos).
DIRECTAS = {"normas": r"\bnormas?\b|\bcertific|\bcumplimiento\b", "rangos": r"\brangos? fisic"}


def explicacion(pregunta):
    """Texto fijo del banco que explica lo que se pregunta, o None."""
    texto = agente._normalizar(pregunta)
    for e in banco()["explicaciones"]:
        directa = DIRECTAS.get(e["clave"])
        if directa and re.search(directa, texto):
            return e["texto"]
        if EXPLICA.search(texto) and any(agente._normalizar(p) in texto for p in e["palabras"]):
            return e["texto"]
    return None


CAPACIDADES = re.compile(
    r"\bque (puedes|sabes) hacer\b|\ben que (me )?(puedes )?ayuda|\bpara que sirves\b|"
    r"\bque (cosas )?(puedo|se puede) (preguntar|pedir)|\bcuales son tus funciones"
)


def pide_capacidades(pregunta):
    return bool(CAPACIDADES.search(agente._normalizar(pregunta)))


def capacidades(usuario):
    return {"texto": banco()["capacidades"].get(usuario.rol_id, banco()["capacidades"]["OPER"])}


# Cambios que se hacen en la plataforma (el agente es de solo lectura). Los umbrales tienen su
# propia respuesta, con los valores actuales (``umbrales``).
CAMBIAR = (
    r"\b(cambia|cambiar|modifica|modificar|ajusta|ajustar|configura|configurar|edita|editar|"
    r"actualiza|actualizar|elimina|eliminar|borra|borrar|agrega|agregar|crea|crear|da de alta|"
    r"desactiva|desactivar|activa|activar|programa|programar|cancela|cancelar|pon|poner)\b"
)
OBJETOS = {
    "alertas": r"\b(atiende|atender|atiendela|descarta|descartar|descartala|cierra|cerrar|"
    r"resuelve|resolver|marca|marcar)\b.*\balertas?\b|\balertas?\b.*\b(como )?(atendida|"
    r"descartada|resuelta)",
    "programaciones": CAMBIAR + r".*\b(programacion|programaciones|envio automatico)\b|"
    r"\bprograma(me)? (un |el )?reporte",
    "dispositivos": CAMBIAR + r".*\b(dispositivo|intervalo|muestreo|sensor)\b",
    "usuarios": CAMBIAR + r".*\b(usuario|usuarios|contrasena|rol)\b",
    "areas": CAMBIAR + r".*\b(area|areas)\b",
}


def modificar(pregunta):
    """Respuesta fija si se pide cambiar algo que se gestiona en la plataforma, o None."""
    texto = agente._normalizar(pregunta)
    for clave, patron in OBJETOS.items():
        if re.search(patron, texto):
            return {"texto": banco()["modificar"][clave], "codigo": "fuera_de_alcance"}
    return None


CANCELAR = re.compile(
    r"^(no,? )?(cancela(lo|r)?|olvidalo|dejalo|ya no|mejor no|detente|descartalo)"
    r"( (eso|todo|el reporte|la accion|lo que preparabas))?( por favor| gracias)?$"
)


def es_cancelar(pregunta):
    return bool(CANCELAR.search(agente._normalizar(pregunta).strip(" ¡!.¿?")))


CONFIRMA = re.compile(
    r"^(si|claro|dale|adelante|hazlo|generalo|confirmo|confirmado|de acuerdo|va|ok|okay|"
    r"esta bien|por favor)\b"
)


def es_confirmacion(pregunta):
    texto = agente._normalizar(pregunta).strip(" ¡!.¿?")
    return agente.es_afirmacion(pregunta) or bool(CONFIRMA.search(texto))


# ── Alcance del usuario: pendientes ─────────────────────────────────────────────────────────

PENDIENTES = re.compile(
    r"\b(que|algo) (hay|queda|tengo) pendiente|\bhay (algo|alertas?) pendientes?|"
    r"\balertas pendientes\b|\b(algo|alguno|algun dispositivo) (esta )?en peligro\b|"
    r"\bcomo (esta|va) todo\b|\bresumen general\b|\bque hay de nuevo\b|\bnovedades\b"
)


def pide_pendientes(pregunta):
    return bool(PENDIENTES.search(agente._normalizar(pregunta)))


def pendientes(usuario, limite=3):
    """Alertas pendientes por nivel y dispositivos sin conexión o calentando, en el alcance del
    usuario (organización, su área o su dispositivo)."""
    visibles = dispositivos_visibles(usuario)
    alertas = (
        Alerta.objects.filter(estado=Alerta.Estado.PENDIENTE, umbral__dispositivo__in=visibles)
        .select_related("umbral__dispositivo__area", "umbral__variable")
        .order_by("-fecha_hora")
    )
    peligro = alertas.filter(nivel=Alerta.Nivel.PELIGRO).count()
    advertencia = alertas.filter(nivel=Alerta.Nivel.ADVERTENCIA).count()
    sin_conexion = list(
        visibles.filter(estado_dispositivo_id=roles.DISPOSITIVO_SIN_CONEXION).order_by("nombre")
    )
    calentando = list(
        visibles.filter(estado_dispositivo_id=roles.DISPOSITIVO_CALENTANDO).order_by("nombre")
    )
    partes = []
    total = peligro + advertencia
    if total:
        niveles = []
        if peligro:
            niveles.append(f"{peligro} de peligro")
        if advertencia:
            niveles.append(f"{advertencia} de advertencia")
        detalle = [
            f"{a.get_nivel_display().lower()} por {a.umbral.variable.nombre.lower()} en "
            f"{a.umbral.dispositivo.nombre} ({a.umbral.dispositivo.area.nombre}, "
            f"{timezone.localtime(a.fecha_hora):%d/%m %H:%M})"
            for a in alertas[:limite]
        ]
        mas = f" y {total - limite} más" if total > limite else ""
        partes.append(
            f"Hay {agente._n(total, 'alerta pendiente', 'alertas pendientes')}: "
            f"{' y '.join(niveles)}. Las más recientes: {'; '.join(detalle)}{mas}."
        )
    else:
        partes.append("No hay alertas pendientes.")
    if sin_conexion:
        nombres = ", ".join(
            f"{d.nombre} (desde {timezone.localtime(d.ultima_conexion):%d/%m %H:%M})"
            if d.ultima_conexion
            else d.nombre
            for d in sin_conexion[:limite]
        )
        partes.append(f"Sin conexión: {nombres}.")
    if calentando:
        partes.append(f"Calentando: {', '.join(d.nombre for d in calentando[:limite])}.")
    if not sin_conexion and not calentando:
        partes.append("Todos tus dispositivos están en línea.")
    if total:
        partes.append("Se atienden desde el panel de Alertas.")
    return {"texto": " ".join(partes)}


# ── Detalle de una alerta ───────────────────────────────────────────────────────────────────

DETALLE_ALERTA = re.compile(
    r"\bquien (atendio|reviso|cerro|descarto|vio)\b|\bdetalles? de (la |esa |esta )?"
    r"(ultima )?alerta|\bque (disparo|provoco|genero|activo) (la |esa )?alerta|"
    r"\b(cuando|ya) se atendio\b|\bcuanto tardo (la |en llegar la )?notificacion|"
    r"\b(ya )?(atendieron|revisaron) (la |esa )?alerta|\bsigue pendiente (la |esa )?alerta"
)


def pide_detalle_alerta(pregunta):
    return bool(DETALLE_ALERTA.search(agente._normalizar(pregunta)))


def detalle_alerta(dispositivo, pregunta=""):
    """La alerta más reciente del dispositivo (dentro del periodo, si se nombró uno)."""
    from . import interprete

    alertas = Alerta.objects.filter(umbral__dispositivo=dispositivo).select_related(
        "umbral__variable", "atendida_por"
    )
    periodo = interprete._periodo_nombrado(pregunta) if pregunta else ""
    if periodo:
        inicio, fin, _ = agente.periodo_de(pregunta)
        alertas = alertas.filter(fecha_hora__gte=inicio, fecha_hora__lt=fin)
    alerta = alertas.order_by("-fecha_hora").first()
    if alerta is None:
        cuando = f" de {periodo}" if periodo else ""
        return {"texto": f"{dispositivo.nombre} no tiene alertas{cuando}.", "codigo": "sin_datos"}
    u, variable = alerta.umbral, alerta.umbral.variable
    unidad = variable.unidad
    peligro = alerta.nivel == Alerta.Nivel.PELIGRO
    arriba = alerta.tipo == Alerta.Tipo.POR_ENCIMA
    limite = (
        (u.peligro_max if arriba else u.peligro_min)
        if peligro
        else (u.advertencia_max if arriba else u.advertencia_min)
    )
    partes = [
        f"La alerta{' de ' + periodo if periodo else ' más reciente'} de {dispositivo.nombre} es "
        f"de {alerta.get_nivel_display().lower()} por {variable.nombre.lower()}: "
        f"{float(alerta.lectura_valor):g} {unidad} el "
        f"{timezone.localtime(alerta.lectura_fecha_hora):%d/%m/%Y %H:%M}, "
        f"{'por encima' if arriba else 'por debajo'} del límite de {float(limite):g} {unidad}."
    ]
    if alerta.estado == Alerta.Estado.PENDIENTE:
        partes.append("Sigue pendiente: se atiende desde el panel de Alertas.")
    else:
        quien = alerta.atendida_por.get_full_name() if alerta.atendida_por else "alguien"
        cuando = (
            f" el {timezone.localtime(alerta.fecha_atencion):%d/%m/%Y %H:%M}"
            if alerta.fecha_atencion
            else ""
        )
        partes.append(f"La {alerta.get_estado_display().lower()} {quien}{cuando}.")
        if alerta.observaciones:
            partes.append(f"Observaciones: «{alerta.observaciones[:200]}».")
    primera = alerta.notificaciones.order_by("fecha_envio").first()
    if primera:
        segundos = max(0, round((primera.fecha_envio - alerta.fecha_hora).total_seconds()))
        partes.append(f"La primera notificación salió {segundos} s después de la alerta.")
    return {"texto": " ".join(partes)}


# ── Programaciones de reportes ──────────────────────────────────────────────────────────────

PROGRAMACIONES = re.compile(
    r"\bprogramad[oa]s?\b|\bprogramacion(es)?\b|\breportes? (automaticos?|periodicos?|"
    r"recurrentes?)\b|\bcada cuando (llega|se envia|sale) el reporte"
)


def pide_programaciones(pregunta):
    return bool(PROGRAMACIONES.search(agente._normalizar(pregunta)))


def programaciones(usuario, limite=5):
    """Programaciones vigentes: las de la organización (administrador) o las propias."""
    from apps.usuarios.models import Usuario

    lista = ProgramacionReporte.objects.filter(
        organizacion_id=usuario.organizacion_id, activa=True
    ).select_related("area")
    if usuario.rol_id != roles.ADMIN:
        lista = lista.filter(creada_por=usuario)
    lista = list(lista.order_by("proxima_ejecucion")[: limite + 1])
    if not lista:
        return {
            "texto": "No tienes reportes programados. Se crean en la sección Reportes de la "
            "plataforma."
        }
    nombres = {
        u.pk: u.get_full_name()
        for u in Usuario.objects.filter(pk__in={d for p in lista for d in p.destinatarios})
    }
    filas = []
    for p in lista[:limite]:
        destino = ", ".join(nombres.get(d, "—") for d in p.destinatarios[:3])
        if len(p.destinatarios) > 3:
            destino += f" y {len(p.destinatarios) - 3} más"
        filas.append(
            f"{p.get_frecuencia_display().lower()} de "
            f"{p.area.nombre if p.area else 'toda la organización'} para {destino} "
            f"(próximo: {timezone.localtime(p.proxima_ejecucion):%d/%m %H:%M})"
        )
    mas = " Hay más en la sección Reportes." if len(lista) > limite else ""
    return {
        "texto": "Reportes programados: " + "; ".join(filas) + "." + mas + " Se crean y "
        "cambian en la sección Reportes; desde el chat solo los consulto."
    }


# ── Reporte en dos pasos: preparar y confirmar ──────────────────────────────────────────────

VIGENCIA_ACCION = timedelta(minutes=10)


def preparar_reporte(usuario, dispositivo, pregunta):
    """Valida, calcula las cifras con el mismo servicio de Reportes y devuelve un resumen con
    una acción pendiente. No guarda nada: el reporte se genera solo al confirmar."""
    from . import interprete, servicios

    if usuario.rol_id not in (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA):
        return {
            "texto": "Los reportes los generan administradores, supervisores y analistas. "
            "Puedo responderte sobre las lecturas y alertas de tu dispositivo.",
            "codigo": "sin_permiso",
        }
    if not interprete._periodo_nombrado(pregunta):
        return {
            "texto": banco()["preguntas_faltantes"]["periodo"],
            "codigo": "datos_faltantes",
            "faltan": ["periodo"],
        }
    inicio, fin, descripcion = agente.periodo_de(pregunta)
    if inicio >= fin:
        return {"texto": banco()["errores"]["periodo_invalido"], "codigo": "periodo_invalido"}
    area = dispositivo.area
    cifras = servicios.calcular_cifras(usuario.organizacion, area, inicio, fin)
    lecturas = sum(v.get("muestras", 0) for v in _valores(cifras["variables"]))
    if not lecturas:
        return {
            "texto": f"No hay lecturas de {area.nombre} en {descripcion}. ¿Quieres otro periodo?",
            "codigo": "sin_datos",
        }
    vence = timezone.now() + VIGENCIA_ACCION
    accion = {
        "id": uuid.uuid4().hex[:12],
        "tipo": "reporte",
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat(),
        "descripcion": descripcion,
        "pregunta": pregunta,
        "vence": vence.isoformat(),
    }
    alertas = cifras["alertas"]["total"]
    return {
        "texto": (
            f"Voy a generar el reporte del área {area.nombre} de {descripcion} "
            f"({timezone.localtime(inicio):%d/%m/%Y} – {timezone.localtime(fin):%d/%m/%Y}): "
            f"{agente._n(len(cifras['dispositivos']), 'dispositivo')}, "
            f"{agente._n(lecturas, 'lectura válida', 'lecturas válidas')} y "
            f"{agente._n(alertas, 'alerta')}. ¿Lo genero? Responde «sí» o «cancela»."
        ),
        "accion": accion,
    }


def _valores(variables):
    return variables.values() if isinstance(variables, dict) else variables


def vencida(accion):
    return timezone.now() > datetime.fromisoformat(accion["vence"])


def confirmar_reporte(usuario, dispositivo, accion):
    """Genera y guarda el reporte de una acción pendiente vigente (la IA redacta el texto)."""
    from . import ia, servicios

    if vencida(accion):
        return {
            "texto": banco()["errores"]["accion_vencida"],
            "codigo": "accion_vencida",
            "propuesta": accion["pregunta"],
        }
    area = dispositivo.area
    inicio = datetime.fromisoformat(accion["inicio"])
    fin = datetime.fromisoformat(accion["fin"])
    try:
        reporte = servicios.generar_reporte(
            usuario.organizacion, area, inicio, fin, Reporte.Origen.AGENTE, usuario=usuario
        )
    except ia.IANoDisponible:
        return {
            "texto": "No pude redactar el reporte: el servicio de IA no está disponible por "
            "ahora, así que no se guardó. Intenta de nuevo en unos minutos; el monitoreo y las "
            "alertas siguen funcionando.",
            "codigo": "ia_no_disponible",
        }
    return {
        "texto": (
            f"Listo: generé el reporte de {area.nombre} de {accion['descripcion']} "
            f"({timezone.localtime(inicio):%d/%m/%Y} – {timezone.localtime(fin):%d/%m/%Y}). "
            "Puedes visualizarlo aquí o descargarlo en PDF desde Reportes."
        ),
        "reporte": agente.resumen_reporte(reporte, f"{area.nombre} · {accion['descripcion']}"),
    }
