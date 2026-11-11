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
    destinatarios = []
    if pide_enviar(pregunta):
        # «Genera el reporte de esta semana y envíaselo a Ana»: un paso más, misma confirmación.
        destinatarios, ambiguos = destinatarios_de(usuario, area, pregunta)
        if ambiguos:
            return _ambiguo(ambiguos)
    vence = timezone.now() + VIGENCIA_ACCION
    accion = {
        "destinatarios": [u.pk for u in destinatarios],
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
            f"{agente._n(alertas, 'alerta')}"
            + (f", y enviarlo por correo a {_nombres(destinatarios)}" if destinatarios else "")
            + ". ¿Lo genero? Responde «sí» o «cancela»."
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


# ── Destinatarios: nombres → usuarios de la organización ────────────────────────────────────

A_MI = re.compile(
    r"\b(a|para) mi\b(?! (area|organizacion|dispositivo|equipo|sensor))|\b(mandame|enviame|"
    r"mandamelo|enviamelo|pasamelo|a mi correo|me lo (mandas|envias))\b"
)
POR_ROL = {
    roles.SUPERVISOR: r"\b(al|a los|para el|para los) supervisor(es)?\b",
    roles.ANALISTA: r"\b(al|a los|para el|para los) analistas?\b",
    roles.ADMIN: r"\b(al|a los|para el|para los) administrador(es)?\b",
}


def destinatarios_de(usuario, area, pregunta, limite=5):
    """Usuarios de la organización nombrados en la pregunta. Devuelve ``(usuarios, ambiguos)``:
    ``ambiguos`` son las opciones (máx. ``limite``) de un nombre que coincide con varios."""
    from apps.usuarios.models import Usuario

    texto = agente._normalizar(pregunta)
    candidatos = list(
        Usuario.objects.filter(
            organizacion_id=usuario.organizacion_id, estado_usuario_id=roles.USUARIO_ACTIVO
        ).exclude(rol_id=roles.ADMIN_PLATAFORMA)
    )
    elegidos = {usuario.pk: usuario} if A_MI.search(texto) else {}
    for rol, patron in POR_ROL.items():
        if re.search(patron, texto):
            for u in candidatos:
                if u.rol_id == rol and (rol == roles.ADMIN or u.area_id in (None, area.pk)):
                    elegidos[u.pk] = u
    # Primero nombre y apellido; lo que queda del texto se busca solo por nombre.
    completos = {}
    resto = texto
    for u in candidatos:
        nombre = agente._normalizar(u.nombre or "")
        apellido = agente._normalizar(u.primer_apellido or "")
        completo = rf"\b{re.escape(nombre)} {re.escape(apellido)}\b"
        if apellido and re.search(completo, texto):
            completos[u.pk] = u
            resto = re.sub(completo, " ", resto)
    # Un nombre que ya se aclaró con apellido («Ana» y luego «Ana López») no vuelve a contar.
    aclarados = {w for u in completos.values() for w in agente._normalizar(u.nombre).split()}
    por_nombre = {}
    for u in candidatos:
        if u.pk in completos:
            continue
        for palabra in agente._normalizar(u.nombre or "").split():
            if (
                len(palabra) >= 3
                and palabra not in aclarados
                and re.search(rf"\b{re.escape(palabra)}\b", resto)
            ):
                por_nombre.setdefault(palabra, []).append(u)
    elegidos.update(completos)
    ambiguos = []
    for usuarios in por_nombre.values():
        if len(usuarios) == 1:
            elegidos[usuarios[0].pk] = usuarios[0]
        else:
            ambiguos = usuarios[:limite]
    return list(elegidos.values()), ambiguos


def _nombres(usuarios):
    nombres = [u.get_full_name() for u in usuarios]
    return nombres[0] if len(nombres) == 1 else ", ".join(nombres[:-1]) + " y " + nombres[-1]


def _ambiguo(ambiguos):
    return {
        "texto": f"¿Te refieres a {' o a '.join(u.get_full_name() for u in ambiguos)}? Dime el "
        "nombre con su apellido.",
        "codigo": "ambiguo",
        "opciones": [u.get_full_name() for u in ambiguos],
    }


def _accion(tipo, pregunta, **datos):
    return {
        "id": uuid.uuid4().hex[:12],
        "tipo": tipo,
        "pregunta": pregunta,
        "vence": (timezone.now() + VIGENCIA_ACCION).isoformat(),
        **datos,
    }


def _puede_reportes(usuario):
    return usuario.rol_id in (roles.ADMIN, roles.SUPERVISOR, roles.ANALISTA)


SIN_PERMISO_REPORTES = {
    "texto": "Los reportes y sus envíos los gestionan administradores, supervisores y "
    "analistas. Puedo responderte sobre las lecturas y alertas de tu dispositivo.",
    "codigo": "sin_permiso",
}


def pide_envio_de_reporte(pregunta):
    """Enviar algo que es un reporte («envía el reporte», «mándaselo», «por correo»)."""
    texto = agente._normalizar(pregunta)
    return bool(ENVIAR.search(texto)) and bool(
        re.search(r"\b(reportes?|informes?|pdf|por correo)\b|\w+(selo|melo|selos)\b", texto)
    )


# ── Enviar un reporte por correo ────────────────────────────────────────────────────────────

ENVIAR = re.compile(
    r"\b(envia|enviar|enviale|envialo|enviaselo|enviaselos|enviame|enviamelo|manda|mandar|"
    r"mandale|mandalo|mandaselo|mandame|mandamelo|comparte|compartelo|reenvia|reenvialo|"
    r"pasale|pasamelo)\b|\bpor correo\b"
)


def pide_enviar(pregunta):
    return bool(ENVIAR.search(agente._normalizar(pregunta)))


def preparar_envio(usuario, dispositivo, pregunta):
    """Envío por correo del último reporte del área (o el #n nombrado) a usuarios de la
    organización. No envía nada: espera confirmación."""
    if not _puede_reportes(usuario):
        return SIN_PERMISO_REPORTES
    area = dispositivo.area
    reportes_area = Reporte.objects.filter(organizacion_id=usuario.organizacion_id, area=area)
    numero = re.search(r"#\s*(\d+)|\breporte (\d+)\b", agente._normalizar(pregunta))
    if numero:
        reporte = reportes_area.filter(pk=int(numero.group(1) or numero.group(2))).first()
    else:
        reporte = reportes_area.filter(generado_por=usuario).order_by("-fecha_generacion").first()
        reporte = reporte or reportes_area.order_by("-fecha_generacion").first()
    if reporte is None:
        return {
            "texto": f"No hay reportes del área {area.nombre} para enviar. Pídeme uno, por "
            "ejemplo: «genera el reporte de esta semana y envíaselo a mi supervisor».",
            "codigo": "no_encontrado",
        }
    destinatarios, ambiguos = destinatarios_de(usuario, area, pregunta)
    if ambiguos:
        return _ambiguo(ambiguos)
    if not destinatarios:
        return {
            "texto": "¿A quién se lo envío? Dime su nombre o «a mí».",
            "codigo": "datos_faltantes",
            "faltan": ["destinatarios"],
        }
    periodo = (
        f"{timezone.localtime(reporte.periodo_inicio):%d/%m} – "
        f"{timezone.localtime(reporte.periodo_fin):%d/%m/%Y}"
    )
    return {
        "texto": f"Voy a enviar por correo el reporte #{reporte.num} de {area.nombre} "
        f"({periodo}), con su PDF, a {_nombres(destinatarios)}. ¿Lo envío? Responde «sí» o "
        "«cancela».",
        "accion": _accion(
            "enviar", pregunta, reporte=reporte.num, destinatarios=[u.pk for u in destinatarios]
        ),
    }


# ── Programaciones: crear, cambiar y cancelar ───────────────────────────────────────────────

FRECUENCIAS = (
    (ProgramacionReporte.Frecuencia.DIARIA, r"\bdiari[oa]s?\b|\bcada dia\b|\btodos los dias\b"),
    (ProgramacionReporte.Frecuencia.SEMANAL, r"\bsemanal(es|mente)?\b|\bcada semana\b"),
    (ProgramacionReporte.Frecuencia.MENSUAL, r"\bmensual(es|mente)?\b|\bcada mes\b"),
)
PROGRAMAR = re.compile(
    r"\b(programa|programar|programame|programalo|agenda|agendar|automatiza)\b.*\breportes?\b|"
    r"\b(crea|crear|haz|hazme|agrega|agregar) (una |otra )?(nueva )?programacion\b|"
    r"\breportes? (diari[oa]s?|semanal(es)?|mensual(es)?)\b.*\b(envi|mand|program)|"
    r"\b(envi|mand)\w*\b.*\breportes?\b.*\b(cada (dia|semana|mes)|todos los dias)\b"
)
CANCELAR_PROGRAMACION = re.compile(
    r"\b(cancela|cancelar|desactiva|desactivar|elimina|eliminar|borra|borrar|deten|detener|"
    r"pausa|pausar|quita|quitar)\b (la |el |mi |las |los |esa |esta )?(programacion(es)?|"
    r"reportes? programados?|envio automatico)"
)
EDITAR_PROGRAMACION = re.compile(
    r"\b(cambia|cambiar|modifica|modificar|ajusta|edita|editar|agrega|agregar|anade|incluye|"
    r"quita|quitar|saca|elimina|pasa|pon)\b.*\b(programacion|reportes? programados?)\b"
)
AGREGAR = re.compile(r"\b(agrega|agregar|anade|incluye|suma|sumale|mete)\b")
QUITAR = re.compile(r"\b(quita|quitar|saca|sacar|elimina|eliminar|borra)\b")


def pide_programar(pregunta):
    return bool(PROGRAMAR.search(agente._normalizar(pregunta)))


def pide_cancelar_programacion(pregunta):
    return bool(CANCELAR_PROGRAMACION.search(agente._normalizar(pregunta)))


def pide_editar_programacion(pregunta):
    return bool(EDITAR_PROGRAMACION.search(agente._normalizar(pregunta)))


def _frecuencias(texto):
    """Frecuencias nombradas, en el orden en que aparecen."""
    halladas = []
    for valor, patron in FRECUENCIAS:
        for m in re.finditer(patron, texto):
            halladas.append((m.start(), valor))
    return [v for _, v in sorted(halladas)]


def _programaciones_de(usuario):
    """Las mismas que ve en la sección Reportes (su organización y, con área, su área)."""
    lista = ProgramacionReporte.objects.filter(
        organizacion_id=usuario.organizacion_id, activa=True
    ).select_related("area")
    if usuario.rol_id != roles.ADMIN and usuario.area_id:
        lista = lista.filter(area_id=usuario.area_id)
    return lista


def _describir_programacion(p):
    return (
        f"#{p.num} {p.get_frecuencia_display().lower()} de "
        f"{p.area.nombre if p.area else 'toda la organización'}"
    )


def _elegir_programacion(usuario, texto, frecuencia_nueva=None):
    """La programación a la que se refiere: por #n, por frecuencia o la única que hay."""
    lista = _programaciones_de(usuario)
    numero = re.search(r"#\s*(\d+)", texto)
    if numero:
        return list(lista.filter(pk=int(numero.group(1))))
    frecuencias = [f for f in _frecuencias(texto) if f != frecuencia_nueva]
    if frecuencias:
        lista = lista.filter(frecuencia=frecuencias[0])
    return list(lista.order_by("num")[:6])


def _una_programacion(usuario, texto, frecuencia_nueva=None):
    """``(programacion, error)``."""
    lista = _elegir_programacion(usuario, texto, frecuencia_nueva)
    if not lista:
        return None, {
            "texto": "No encontré esa programación entre las tuyas. Pregúntame «¿qué reportes "
            "tengo programados?» para verlas.",
            "codigo": "no_encontrado",
        }
    if len(lista) > 1:
        opciones = [_describir_programacion(p) for p in lista[:5]]
        return None, {
            "texto": f"¿Cuál programación? {'; '.join(opciones)}. Dímela con su número, por "
            "ejemplo «#" + str(lista[0].num) + "».",
            "codigo": "ambiguo",
            "opciones": opciones,
        }
    return lista[0], None


def _serializar_programacion(usuario, datos, instancia=None):
    """Valida con el mismo serializer de la sección Reportes (alcance y destinatarios)."""
    from types import SimpleNamespace

    from apps.reportes.serializers import ProgramacionReporteSerializer

    s = ProgramacionReporteSerializer(
        instancia,
        data=datos,
        partial=instancia is not None,
        context={"request": SimpleNamespace(user=usuario)},
    )
    return s


def preparar_programacion(usuario, dispositivo, pregunta):
    """Nueva programación del área del dispositivo (el área asignada del usuario)."""
    if not _puede_reportes(usuario):
        return SIN_PERMISO_REPORTES
    texto = agente._normalizar(pregunta)
    area = dispositivo.area
    frecuencias = _frecuencias(texto)
    destinatarios, ambiguos = destinatarios_de(usuario, area, pregunta)
    if ambiguos:
        return _ambiguo(ambiguos)
    if not frecuencias:
        return {
            "texto": banco()["preguntas_faltantes"]["frecuencia"],
            "codigo": "datos_faltantes",
            "faltan": ["frecuencia"],
        }
    if not destinatarios:
        return {
            "texto": banco()["preguntas_faltantes"]["destinatarios"],
            "codigo": "datos_faltantes",
            "faltan": ["destinatarios"],
        }
    frecuencia = frecuencias[0]
    s = _serializar_programacion(
        usuario,
        {
            "area": area.pk,
            "frecuencia": frecuencia,
            "destinatarios": [u.pk for u in destinatarios],
        },
    )
    if not s.is_valid():
        return {"texto": banco()["errores"]["sin_permiso"], "codigo": "sin_permiso"}
    from apps.reportes import servicios

    primera = servicios.desplazar(timezone.now(), frecuencia, 1)
    return {
        "texto": "Voy a programar un reporte "
        f"{ProgramacionReporte.Frecuencia(frecuencia).label.lower()} del área {area.nombre} "
        f"para {_nombres(destinatarios)}; el primero sale el "
        f"{timezone.localtime(primera):%d/%m/%Y %H:%M}. ¿Lo programo? Responde «sí» o «cancela».",
        "accion": _accion(
            "programar",
            pregunta,
            area=area.pk,
            frecuencia=frecuencia,
            destinatarios=[u.pk for u in destinatarios],
        ),
    }


def preparar_cambio_programacion(usuario, dispositivo, pregunta, cancelar=False):
    if not _puede_reportes(usuario):
        return SIN_PERMISO_REPORTES
    texto = agente._normalizar(pregunta)
    frecuencias = _frecuencias(texto)
    # «Cambia la semanal a mensual»: la última es la nueva; con una sola, solo si se pide como
    # cambio («a mensual», «que sea diaria»); si no, identifica a cuál programación se refiere.
    pide_frecuencia = len(frecuencias) >= 2 or re.search(
        r"\b(a|que sea|hazla|ponla|cambiala a|pasala a) (diari|semanal|mensual)", texto
    )
    nueva = frecuencias[-1] if frecuencias and pide_frecuencia and not cancelar else None
    programacion, error = _una_programacion(usuario, texto, nueva)
    if error:
        return error
    descripcion = _describir_programacion(programacion)
    if cancelar:
        return {
            "texto": f"Voy a cancelar la programación {descripcion}: dejará de enviarse. "
            "¿La cancelo? Responde «sí» o «no».",
            "accion": _accion("cancelar_programacion", pregunta, programacion=programacion.num),
        }
    cambios = {}
    partes = []
    if nueva and nueva != programacion.frecuencia:
        cambios["frecuencia"] = nueva
        partes.append(f"frecuencia {ProgramacionReporte.Frecuencia(nueva).label.lower()}")
    personas, ambiguos = destinatarios_de(usuario, dispositivo.area, pregunta)
    if ambiguos:
        return _ambiguo(ambiguos)
    actuales = list(programacion.destinatarios)
    if personas and QUITAR.search(texto):
        quitar = {u.pk for u in personas}
        actuales = [d for d in actuales if d not in quitar]
        partes.append(f"sin {_nombres(personas)}")
    elif personas:
        actuales += [u.pk for u in personas if u.pk not in actuales]
        partes.append(f"agregando a {_nombres(personas)}")
    if actuales != list(programacion.destinatarios):
        if not actuales:
            return {
                "texto": "La programación se quedaría sin destinatarios. Si ya no la quieres, "
                "dime «cancela la programación».",
                "codigo": "datos_faltantes",
            }
        cambios["destinatarios"] = actuales
    if not cambios:
        return {
            "texto": "¿Qué cambio en la programación? Puedo cambiar su frecuencia (diaria, "
            "semanal o mensual) o agregar o quitar destinatarios.",
            "codigo": "datos_faltantes",
            "faltan": ["cambio"],
        }
    s = _serializar_programacion(usuario, cambios, programacion)
    if not s.is_valid():
        return {"texto": banco()["errores"]["sin_permiso"], "codigo": "sin_permiso"}
    return {
        "texto": f"Voy a cambiar la programación {descripcion}: {', '.join(partes)}. ¿Aplico el "
        "cambio? Responde «sí» o «no».",
        "accion": _accion(
            "editar_programacion", pregunta, programacion=programacion.num, cambios=cambios
        ),
    }


# ── Confirmar cualquier acción preparada ────────────────────────────────────────────────────


def confirmar(usuario, dispositivo, accion):
    """Ejecuta una acción preparada y vigente. Revalida alcance y permisos al ejecutarla."""
    if vencida(accion):
        return {
            "texto": banco()["errores"]["accion_vencida"],
            "codigo": "accion_vencida",
            "propuesta": accion["pregunta"],
        }
    tipo = accion.get("tipo", "reporte")
    if tipo != "reporte" and not _puede_reportes(usuario):
        return SIN_PERMISO_REPORTES
    if tipo == "reporte":
        r = confirmar_reporte(usuario, dispositivo, accion)
        if "reporte" in r and accion.get("destinatarios"):
            from apps.reportes import servicios

            reporte = Reporte.objects.get(pk=r["reporte"]["num"])
            correos = servicios.enviar_reporte(reporte, accion["destinatarios"])
            r["texto"] += f" También lo envié por correo a {agente._n(len(correos), 'persona')}."
        return r
    if tipo == "enviar":
        from apps.reportes import servicios

        reporte = Reporte.objects.filter(
            pk=accion["reporte"], organizacion_id=usuario.organizacion_id
        ).first()
        if reporte is None:
            return {"texto": banco()["errores"]["no_encontrado"], "codigo": "no_encontrado"}
        correos = servicios.enviar_reporte(reporte, accion["destinatarios"])
        if not correos:
            return {
                "texto": "No lo envié: ninguno de los destinatarios está activo.",
                "codigo": "sin_datos",
            }
        return {
            "texto": f"Listo: envié el reporte #{reporte.num} con su PDF a "
            f"{agente._n(len(correos), 'persona')}."
        }
    if tipo == "programar":
        s = _serializar_programacion(
            usuario,
            {
                "area": accion["area"],
                "frecuencia": accion["frecuencia"],
                "destinatarios": accion["destinatarios"],
            },
        )
        if not s.is_valid():
            return {"texto": banco()["errores"]["sin_permiso"], "codigo": "sin_permiso"}
        p = s.save(organizacion=usuario.organizacion, creada_por=usuario)
        return {
            "texto": f"Listo: quedó programado el reporte {_describir_programacion(p)}. El "
            f"primero sale el {timezone.localtime(p.proxima_ejecucion):%d/%m/%Y %H:%M}; lo "
            "puedes ver y cambiar en Reportes."
        }
    programacion = _programaciones_de(usuario).filter(pk=accion["programacion"]).first()
    if programacion is None:
        return {"texto": banco()["errores"]["no_encontrado"], "codigo": "no_encontrado"}
    if tipo == "cancelar_programacion":
        programacion.activa = False
        programacion.save(update_fields=["activa"])
        return {
            "texto": f"Listo: cancelé la programación {_describir_programacion(programacion)}. "
            "Ya no se enviará."
        }
    s = _serializar_programacion(usuario, accion["cambios"], programacion)
    if not s.is_valid():
        return {"texto": banco()["errores"]["sin_permiso"], "codigo": "sin_permiso"}
    p = s.save()
    return {"texto": f"Listo: actualicé la programación {_describir_programacion(p)}."}
