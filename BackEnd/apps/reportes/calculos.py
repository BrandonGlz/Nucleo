"""Cálculos complementarios de los reportes.

Las lecturas viven en TimescaleDB (``nucleo_iot``) y los umbrales en PostgreSQL
(``nucleo_db``), así que los cruces se hacen por ``sensor_num`` o con SQL de solo lectura
parametrizado. Las agregaciones pesadas se resuelven en la base; Python solo resume las
pocas filas que devuelven las consultas.
"""

# El SQL solo interpola la cantidad de filas de VALUES; los datos van parametrizados.
# ruff: noqa: S608

from decimal import Decimal

from django.db import connections
from django.db.models import (
    Avg,
    Case,
    Count,
    DurationField,
    ExpressionWrapper,
    F,
    IntegerField,
    Max,
    Min,
    Q,
    Sum,
    When,
)
from django.utils import timezone

from apps.catalogos.models import VariableAmbiental
from apps.mediciones.models import Lectura
from apps.umbrales.models import Umbral


def _numero(valor):
    return None if valor is None else float(Decimal(valor).quantize(Decimal("0.01")))


def _nombre_variable(catalogo, codigo):
    info = catalogo.get(codigo)
    return info.nombre.split(" (")[0] if info is not None else codigo


def _iso(fecha):
    return timezone.localtime(fecha).isoformat() if fecha is not None else None


def _diferencia(actual, previo):
    if actual is None or previo is None:
        return None
    return _numero(float(actual) - float(previo))


def _porcentaje(actual, previo):
    if actual is None or previo in (None, 0):
        return None
    return _numero((float(actual) - float(previo)) / float(previo) * 100)


def cumplimiento(lecturas, sensores):
    """% de lecturas dentro de los límites de advertencia y minutos fuera."""
    sensores_por_dispositivo = {}
    intervalos = {}
    for num, dispositivo, intervalo in sensores.values_list(
        "num", "dispositivo_id", "dispositivo__intervalo_muestreo_seg"
    ):
        sensores_por_dispositivo.setdefault(dispositivo, []).append(num)
        intervalos[num] = intervalo

    if not sensores_por_dispositivo:
        return {}

    umbrales = list(
        Umbral.objects.filter(
            dispositivo_id__in=sensores_por_dispositivo,
            activo=True,
        ).values(
            "dispositivo_id",
            "variable_id",
            "advertencia_min",
            "advertencia_max",
        )
    )
    condiciones = []
    pares = set()
    for umbral in umbrales:
        for sensor_num in sensores_por_dispositivo[umbral["dispositivo_id"]]:
            pares.add((sensor_num, umbral["variable_id"]))
            condiciones.append(
                When(
                    Q(
                        sensor_num=sensor_num,
                        variable_codigo=umbral["variable_id"],
                        valor__gte=umbral["advertencia_min"],
                        valor__lte=umbral["advertencia_max"],
                    ),
                    then=1,
                )
            )
    if not condiciones:
        return {}

    dentro = Case(*condiciones, default=0, output_field=IntegerField())
    filas = lecturas.values("sensor_num", "variable_codigo").annotate(
        total=Count("num"),
        dentro=Sum(dentro),
    )

    acumulado = {}
    for fila in filas:
        if (fila["sensor_num"], fila["variable_codigo"]) not in pares:
            continue
        variable = fila["variable_codigo"]
        total = fila["total"] or 0
        dentro_total = fila["dentro"] or 0
        fuera = total - dentro_total
        minutos = fuera * intervalos.get(fila["sensor_num"], 0) / 60
        datos = acumulado.setdefault(
            variable,
            {"lecturas": 0, "dentro": 0, "fuera_min": 0.0},
        )
        datos["lecturas"] += total
        datos["dentro"] += dentro_total
        datos["fuera_min"] += minutos

    return {
        variable: {
            "dentro_pct": _numero(datos["dentro"] / datos["lecturas"] * 100)
            if datos["lecturas"]
            else 0.0,
            "fuera_min": _numero(datos["fuera_min"]),
            "lecturas": datos["lecturas"],
        }
        for variable, datos in acumulado.items()
    }


def gestion_alertas(alertas):
    """Totales por estado, tiempo medio de atención y responsables."""
    estados = {"ATENDIDA": 0, "DESCARTADA": 0, "PENDIENTE": 0}
    for estado, total in alertas.values_list("estado").annotate(total=Count("num")):
        estados[estado] = total

    espera = (
        alertas.filter(fecha_atencion__isnull=False)
        .annotate(
            espera=ExpressionWrapper(
                F("fecha_atencion") - F("fecha_hora"),
                output_field=DurationField(),
            )
        )
        .aggregate(media=Avg("espera"))["media"]
    )

    responsables = []
    for fila in (
        alertas.exclude(atendida_por__isnull=True)
        .values(
            "atendida_por_id",
            "atendida_por__nombre",
            "atendida_por__primer_apellido",
            "atendida_por__segundo_apellido",
        )
        .annotate(total=Count("num"))
        .order_by("-total", "atendida_por__nombre")
    ):
        nombre = " ".join(
            parte
            for parte in (
                fila["atendida_por__nombre"],
                fila["atendida_por__primer_apellido"],
                fila["atendida_por__segundo_apellido"],
            )
            if parte
        )
        responsables.append({"usuario": nombre, "total": fila["total"]})

    return {
        "estados": estados,
        "total": sum(estados.values()),
        "tiempo_medio_min": _numero(espera.total_seconds() / 60) if espera else None,
        "responsables": responsables,
    }


def _huecos(mapeo, inicio, fin):
    """Los tres huecos más largos por dispositivo, con una consulta de ventana.

    Solo cuenta como hueco un salto mayor al doble del intervalo de muestreo; el espaciado
    normal entre lecturas no es un hueco.
    """
    if not mapeo:
        return {}
    valores = ", ".join(["(%s, %s, %s)"] * len(mapeo))
    parametros = [dato for par in mapeo for dato in par]
    parametros.extend([inicio, fin, inicio, fin])
    sql = f"""
        WITH lecturas AS (
            SELECT DISTINCT m.dispositivo, m.intervalo, l.fecha_hora
            FROM lectura l
            JOIN (VALUES {valores}) AS m(sensor_num, dispositivo, intervalo)
              ON l.sensor_num = m.sensor_num
            WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
        ),
        marcas AS (
            SELECT dispositivo, intervalo, fecha_hora,
                   COALESCE(
                       LAG(fecha_hora) OVER (
                           PARTITION BY dispositivo ORDER BY fecha_hora
                       ),
                       %s
                   ) AS anterior
            FROM lecturas
        ),
        todos AS (
            SELECT dispositivo, intervalo, anterior, fecha_hora FROM marcas
            UNION ALL
            SELECT dispositivo, intervalo, MAX(fecha_hora), %s
            FROM lecturas
            GROUP BY dispositivo, intervalo
        )
        SELECT dispositivo, anterior, fecha_hora,
               EXTRACT(EPOCH FROM (fecha_hora - anterior)) / 60.0 AS minutos
        FROM (
            SELECT todos.*,
                   ROW_NUMBER() OVER (
                       PARTITION BY dispositivo
                       ORDER BY (fecha_hora - anterior) DESC
                   ) AS posicion
            FROM todos
            WHERE EXTRACT(EPOCH FROM (fecha_hora - anterior)) > 2 * GREATEST(intervalo, 1)
        ) x
        WHERE posicion <= 3
        ORDER BY dispositivo, minutos DESC
    """
    with connections["iot"].cursor() as cursor:
        cursor.execute(sql, parametros)
        filas = cursor.fetchall()

    resultado = {}
    for dispositivo, anterior, _, minutos in filas:
        resultado.setdefault(dispositivo, []).append(
            {"inicio": _iso(anterior), "minutos": _numero(minutos)}
        )
    return resultado


def disponibilidad(sensores, inicio, fin):
    """Lecturas recibidas contra las esperadas y los huecos más largos por equipo."""
    info = {}
    sensor_de = {}
    dispositivos = {}
    mapeo = []
    for (
        num,
        codigo,
        nombre,
        area,
        area_num,
        intervalo,
        fecha_alta,
        dispositivo_id,
    ) in sensores.values_list(
        "num",
        "dispositivo__codigo_mqtt",
        "dispositivo__nombre",
        "dispositivo__area__nombre",
        "dispositivo__area_id",
        "dispositivo__intervalo_muestreo_seg",
        "dispositivo__fecha_alta",
        "dispositivo_id",
    ):
        info[codigo] = {
            "nombre": nombre,
            "area": area,
            "area_num": area_num,
            "intervalo": intervalo,
            "fecha_alta": fecha_alta,
            "recibidas": 0,
            "variables": set(),
        }
        sensor_de[num] = codigo
        dispositivos[codigo] = dispositivo_id
        mapeo.append((num, codigo, intervalo or 0))

    if not info:
        return {}

    # Variables configuradas por dispositivo; si no tiene umbrales, las que aparecen en sus
    # lecturas del periodo.
    for dispositivo_id, variable in Umbral.objects.filter(
        dispositivo_id__in=dispositivos.values(),
        activo=True,
    ).values_list("dispositivo_id", "variable_id"):
        for codigo, identificador in dispositivos.items():
            if identificador == dispositivo_id:
                info[codigo]["variables"].add(variable)
                break

    lecturas = Lectura.objects.filter(
        sensor_num__in=sensor_de,
        fecha_hora__gte=inicio,
        fecha_hora__lt=fin,
    )
    for sensor_num, variable, total in lecturas.values_list(
        "sensor_num", "variable_codigo"
    ).annotate(total=Count("num")):
        codigo = sensor_de[sensor_num]
        info[codigo]["recibidas"] += total
        if not info[codigo]["variables"]:
            info[codigo]["variables"].add(variable)

    huecos = _huecos(mapeo, inicio, fin)
    resultado = {}
    for codigo, datos in info.items():
        desde = max(inicio, datos["fecha_alta"])
        duracion = max(0.0, (fin - desde).total_seconds())
        variables = len(datos["variables"]) or 0
        esperadas = duracion / datos["intervalo"] * variables if datos["intervalo"] else 0
        recibidas = datos["recibidas"]
        pct = min(100.0, recibidas / esperadas * 100) if esperadas else 0.0
        del datos["intervalo"]
        del datos["fecha_alta"]
        datos["variables"] = variables
        datos.update(
            {
                "pct": _numero(pct),
                "recibidas": recibidas,
                "esperadas": _numero(esperadas),
                "huecos": huecos.get(codigo, []),
            }
        )
        if not recibidas:
            datos["huecos"] = [{"inicio": _iso(desde), "minutos": _numero(duracion / 60)}]
        resultado[codigo] = datos
    return resultado


def incidentes(sensores, inicio, fin):
    """Las cinco salidas de umbral más largas, con una consulta de ventana."""
    por_dispositivo = {}
    for num, dispositivo in sensores.values_list("num", "dispositivo_id"):
        por_dispositivo.setdefault(dispositivo, []).append(num)
    if not por_dispositivo:
        return []

    umbrales = list(
        Umbral.objects.filter(
            dispositivo_id__in=por_dispositivo,
            activo=True,
        ).values(
            "dispositivo_id",
            "variable_id",
            "advertencia_min",
            "advertencia_max",
            "peligro_min",
            "peligro_max",
            "dispositivo__codigo_mqtt",
            "dispositivo__nombre",
            "dispositivo__area__nombre",
            "dispositivo__area_id",
            "dispositivo__intervalo_muestreo_seg",
        )
    )
    if not umbrales:
        return []

    nombres = {}
    catalogo = {v.codigo: v for v in VariableAmbiental.objects.all()}
    mapeo = []
    for umbral in umbrales:
        nombres[umbral["dispositivo__codigo_mqtt"]] = {
            "nombre": umbral["dispositivo__nombre"],
            "area": umbral["dispositivo__area__nombre"],
            "area_num": umbral["dispositivo__area_id"],
        }
        for sensor_num in por_dispositivo[umbral["dispositivo_id"]]:
            mapeo.append(
                (
                    sensor_num,
                    umbral["variable_id"],
                    umbral["dispositivo__codigo_mqtt"],
                    umbral["dispositivo__intervalo_muestreo_seg"],
                    umbral["advertencia_min"],
                    umbral["advertencia_max"],
                    umbral["peligro_min"],
                    umbral["peligro_max"],
                )
            )
    if not mapeo:
        return []

    valores = ", ".join(["(%s, %s, %s, %s, %s, %s, %s, %s)"] * len(mapeo))
    parametros = [dato for fila in mapeo for dato in fila]
    parametros.extend([inicio, fin])
    sql = f"""
        WITH base AS (
            SELECT l.sensor_num, l.variable_codigo, l.fecha_hora, l.valor,
                   m.dispositivo, m.intervalo, m.advertencia_min, m.advertencia_max,
                   CASE
                       WHEN l.valor > m.advertencia_max
                         OR l.valor < m.advertencia_min THEN 1
                       ELSE 0
                   END AS fuera,
                   CASE
                       WHEN l.valor > m.peligro_max
                         OR l.valor < m.peligro_min THEN 'PELIGRO'
                       ELSE 'ADVERTENCIA'
                   END AS nivel
            FROM lectura l
            JOIN (VALUES {valores})
              AS m(sensor_num, variable_codigo, dispositivo, intervalo,
                   advertencia_min, advertencia_max, peligro_min, peligro_max)
              ON l.sensor_num = m.sensor_num
             AND l.variable_codigo = m.variable_codigo
            WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
              AND l.estabilizada
        ),
        marcas AS (
            SELECT base.*,
                   LAG(fuera) OVER (
                       PARTITION BY sensor_num, variable_codigo
                       ORDER BY fecha_hora
                   ) AS fuera_antes
            FROM base
        ),
        grupos AS (
            SELECT marcas.*,
                   SUM(
                       CASE
                           WHEN fuera = 1
                            AND (fuera_antes IS DISTINCT FROM 1) THEN 1
                           ELSE 0
                       END
                   ) OVER (
                       PARTITION BY sensor_num, variable_codigo
                       ORDER BY fecha_hora
                   ) AS grupo
            FROM marcas
        ),
        tramos AS (
            SELECT sensor_num, variable_codigo, dispositivo, grupo,
                   MIN(fecha_hora) AS inicio,
                   MAX(fecha_hora) AS fin,
                   MAX(valor) AS maximo,
                   MIN(valor) AS minimo,
                   MAX(advertencia_max) AS advertencia_max,
                   MAX(intervalo) AS intervalo,
                   BOOL_OR(nivel = 'PELIGRO') AS peligro
            FROM grupos
            WHERE fuera = 1
            GROUP BY sensor_num, variable_codigo, dispositivo, grupo
        )
        SELECT dispositivo, variable_codigo, inicio, fin,
               CASE
                   WHEN maximo > advertencia_max THEN maximo
                   ELSE minimo
               END AS pico,
               CASE WHEN peligro THEN 'PELIGRO' ELSE 'ADVERTENCIA' END AS nivel,
               EXTRACT(EPOCH FROM (fin - inicio)) + intervalo AS duracion_seg,
               intervalo
        FROM tramos
        ORDER BY duracion_seg DESC, inicio
        LIMIT 5
    """
    with connections["iot"].cursor() as cursor:
        cursor.execute(sql, parametros)
        filas = cursor.fetchall()

    return [
        {
            "dispositivo": nombres[dispositivo]["nombre"],
            "dispositivo_codigo": dispositivo,
            "area": nombres[dispositivo]["area"],
            "area_num": nombres[dispositivo]["area_num"],
            "variable": variable,
            "variable_nombre": _nombre_variable(catalogo, variable),
            "inicio": _iso(inicio_tramo),
            "duracion_min": _numero(float(duracion_seg) / 60),
            "valor_pico": _numero(pico),
            "nivel": nivel,
        }
        for dispositivo, variable, inicio_tramo, _, pico, nivel, duracion_seg, _ in filas
    ]


def observaciones(alertas):
    """Las últimas 50 observaciones escritas al atender o descartar alertas."""
    filas = (
        alertas.filter(observaciones__isnull=False)
        .exclude(observaciones="")
        .select_related(
            "umbral__dispositivo__area",
            "umbral__variable",
            "atendida_por",
        )
        .order_by("-fecha_hora")[:50]
    )
    return [
        {
            "fecha": _iso(alerta.fecha_hora),
            "dispositivo": alerta.umbral.dispositivo.nombre,
            "dispositivo_codigo": alerta.umbral.dispositivo.codigo_mqtt,
            "area": alerta.umbral.dispositivo.area.nombre,
            "area_num": alerta.umbral.dispositivo.area_id,
            "variable": alerta.umbral.variable.nombre,
            "variable_codigo": alerta.umbral.variable_id,
            "variable_nombre": alerta.umbral.variable.nombre.split(" (")[0],
            "usuario": alerta.atendida_por.get_full_name() if alerta.atendida_por_id else "—",
            "texto": alerta.observaciones,
        }
        for alerta in filas
    ]


def basicas_previas(sensores, alertas_scope, inicio, fin):
    """Promedios, extremos y alertas del periodo anterior de la misma duración."""
    duracion = fin - inicio
    previo_inicio = inicio - duracion
    lecturas = Lectura.objects.filter(
        sensor_num__in=list(sensores.values_list("num", flat=True)),
        fecha_hora__gte=previo_inicio,
        fecha_hora__lt=inicio,
        estabilizada=True,
    )
    variables = {}
    for fila in lecturas.values("variable_codigo").annotate(
        promedio=Sum("valor") / Count("num"),
        minimo=Min("valor"),
        maximo=Max("valor"),
        muestras=Count("num"),
    ):
        variables[fila["variable_codigo"]] = {
            "promedio": _numero(fila["promedio"]),
            "minimo": _numero(fila["minimo"]),
            "maximo": _numero(fila["maximo"]),
            "muestras": fila["muestras"],
        }
    total_alertas = alertas_scope.filter(
        lectura_fecha_hora__gte=previo_inicio,
        lectura_fecha_hora__lt=inicio,
    ).count()
    if not variables and not total_alertas:
        return None
    return {
        "periodo_anterior": {
            "inicio": previo_inicio.isoformat(),
            "fin": inicio.isoformat(),
        },
        "variables": variables,
        "alertas": total_alertas,
    }


def comparativo(variables, alertas_total, previo, inicio, fin):
    """Compara las cifras actuales con las del periodo anterior."""
    if previo is None:
        return {
            "sin_datos_previos": True,
            "periodo_anterior": {
                "inicio": (inicio - (fin - inicio)).isoformat(),
                "fin": inicio.isoformat(),
            },
        }
    filas = []
    for codigo in sorted(set(variables) | set(previo["variables"])):
        actual = variables.get(codigo) or {}
        anterior = previo["variables"].get(codigo) or {}
        fila = {
            "variable": codigo,
            "nombre": actual.get("nombre") or anterior.get("nombre") or codigo,
            "unidad": actual.get("unidad") or anterior.get("unidad") or "",
            "promedio": actual.get("promedio"),
            "minimo": actual.get("minimo"),
            "maximo": actual.get("maximo"),
            "promedio_previo": anterior.get("promedio"),
            "minimo_previo": anterior.get("minimo"),
            "maximo_previo": anterior.get("maximo"),
            "dif_promedio": _diferencia(actual.get("promedio"), anterior.get("promedio")),
            "dif_promedio_pct": _porcentaje(actual.get("promedio"), anterior.get("promedio")),
            "dif_minimo": _diferencia(actual.get("minimo"), anterior.get("minimo")),
            "dif_minimo_pct": _porcentaje(actual.get("minimo"), anterior.get("minimo")),
            "dif_maximo": _diferencia(actual.get("maximo"), anterior.get("maximo")),
            "dif_maximo_pct": _porcentaje(actual.get("maximo"), anterior.get("maximo")),
        }
        fila["mejora"] = None if fila["dif_promedio"] is None else fila["dif_promedio"] <= 0
        filas.append(fila)

    diferencia = alertas_total - previo["alertas"]
    return {
        "periodo_anterior": previo["periodo_anterior"],
        "variables": filas,
        "alertas": {
            "total": alertas_total,
            "total_previo": previo["alertas"],
            "diferencia": diferencia,
            "diferencia_pct": _porcentaje(alertas_total, previo["alertas"]),
            "mejora": diferencia <= 0,
        },
    }
