"""Agregaciones de Analítica sobre TimescaleDB y PostgreSQL.

Las lecturas se agregan en SQL con ``time_bucket``: nunca se traen crudas a Python para
rangos largos. Los umbrales de cada dispositivo viajan como ``VALUES`` parametrizados para
clasificar las lecturas sin hacer una consulta por equipo. Alertas, tiempos de atención y
disponibilidad usan ``nucleo_db`` y las mismas funciones que los reportes.
"""

# El SQL solo interpola nombres de columnas y agregados de listas blancas; los datos van
# parametrizados y el intervalo sale de ``INTERVALOS_SQL``.
# ruff: noqa: S608

import math
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import connections
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay
from django.utils import timezone

from apps.dispositivos.models import Sensor
from apps.mediciones.models import Lectura
from apps.reportes import calculos

from .filtros import INTERVALOS_SQL, VARIABLES

HORAS = list(range(24))
DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
NIVELES = ("DENTRO", "ADVERTENCIA", "PELIGRO")
ESTADISTICOS = {"promedio": "AVG", "maximo": "MAX", "minimo": "MIN"}
AGRUPACIONES = {
    "area": "m.area_id",
    "dispositivo": "m.dispositivo_id",
    "variable": "l.variable_codigo",
}


def _numero(valor):
    return None if valor is None else float(Decimal(str(valor)).quantize(Decimal("0.01")))


def _iso(fecha):
    return timezone.localtime(fecha).isoformat() if fecha is not None else None


def _ejecutar(sql, parametros):
    with connections["iot"].cursor() as cursor:
        cursor.execute(sql, parametros)
        return cursor.fetchall()


def _mapeo(consulta):
    """``VALUES`` con sensor, dispositivo, área e intervalo de muestreo."""
    filas = [
        (
            sensor.num,
            sensor.dispositivo_id,
            sensor.dispositivo.area_id,
            sensor.dispositivo.intervalo_muestreo_seg,
        )
        for sensor in consulta.sensores
    ]
    if not filas:
        return "", []
    valores = ", ".join(["(%s, %s, %s, %s)"] * len(filas))
    parametros = [dato for fila in filas for dato in fila]
    return valores, parametros


def _mapeo_umbrales(consulta, variable=None):
    """``VALUES`` con sensor, variable y los cuatro límites del umbral activo."""
    dispositivos = {dispositivo.num: dispositivo for dispositivo in consulta.dispositivos}
    sensores = defaultdict(list)
    for sensor in consulta.sensores:
        sensores[sensor.dispositivo_id].append(sensor)
    filas = []
    for umbral in consulta.umbrales(variable=variable):
        dispositivo = dispositivos.get(umbral.dispositivo_id)
        if dispositivo is None:
            continue
        for sensor in sensores.get(dispositivo.num, []):
            filas.append(
                (
                    sensor.num,
                    umbral.variable_id,
                    dispositivo.num,
                    dispositivo.area_id,
                    dispositivo.intervalo_muestreo_seg,
                    float(umbral.advertencia_min),
                    float(umbral.advertencia_max),
                    float(umbral.peligro_min),
                    float(umbral.peligro_max),
                )
            )
    if not filas:
        return "", []
    valores = ", ".join(["(%s, %s, %s, %s, %s, %s, %s, %s, %s)"] * len(filas))
    parametros = [dato for fila in filas for dato in fila]
    return valores, parametros


def _intervalo_sql(consulta):
    return INTERVALOS_SQL[consulta.intervalo]


def _grupo(agrupar):
    if agrupar not in ("total", *AGRUPACIONES):
        raise ValueError(f"Agrupación desconocida: {agrupar}")
    if agrupar == "total":
        return "NULL::integer", None
    return AGRUPACIONES[agrupar], agrupar


def _entidad(consulta, agrupar, valor):
    if agrupar == "area":
        area = next((item for item in consulta.areas if item.num == valor), None)
        return {
            "etiqueta": area.nombre if area else str(valor),
            "dimension": "area",
            "dimension_valor": valor,
        }
    if agrupar == "dispositivo":
        dispositivo = next(
            (item for item in consulta.dispositivos if item.num == valor), None
        )
        return {
            "etiqueta": dispositivo.nombre if dispositivo else str(valor),
            "dimension": "dispositivo",
            "dimension_valor": valor,
        }
    if agrupar == "variable":
        info = consulta.info_variable(valor)
        return {
            "etiqueta": info["nombre"],
            "dimension": "variable",
            "dimension_valor": valor,
        }
    return {"etiqueta": "Total", "dimension": None, "dimension_valor": None}


def _etiqueta(consulta, agrupar, valor):
    entidad = _entidad(consulta, agrupar, valor)
    return {
        "nombre": entidad["etiqueta"],
        "dimension": entidad["dimension"],
        "dimension_valor": entidad["dimension_valor"],
    }


def resumen(consulta, variable, inicio=None, fin=None):
    """Lecturas, promedio, mínimo y máximo de una variable en el periodo."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    if not consulta.sensor_ids or variable not in consulta.variables:
        return {"lecturas": 0, "promedio": None, "minimo": None, "maximo": None}
    sql = """
        SELECT COUNT(*), AVG(l.valor), MIN(l.valor), MAX(l.valor)
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo = %s
    """
    filas = _ejecutar(sql, [list(consulta.sensor_ids), inicio, fin, variable])
    total, promedio, minimo, maximo = filas[0]
    return {
        "lecturas": int(total or 0),
        "promedio": _numero(promedio),
        "minimo": _numero(minimo),
        "maximo": _numero(maximo),
    }


def resumen_por_variable(consulta, inicio=None, fin=None):
    """El resumen de ``resumen`` para cada variable del alcance."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    if not consulta.sensor_ids:
        return {}
    sql = """
        SELECT l.variable_codigo, COUNT(*), AVG(l.valor), MIN(l.valor), MAX(l.valor)
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
        GROUP BY l.variable_codigo
    """
    filas = _ejecutar(sql, [list(consulta.sensor_ids), inicio, fin])
    return {
        variable: {
            "lecturas": int(total or 0),
            "promedio": _numero(promedio),
            "minimo": _numero(minimo),
            "maximo": _numero(maximo),
        }
        for variable, total, promedio, minimo, maximo in filas
    }


def serie(consulta, variable, estadistico="promedio", agrupar="total", inicio=None, fin=None):
    """Serie por intervalo de una variable, agrupada por total, área o dispositivo.

    Devuelve hasta seis series; si hay más grupos, el resto se combina en «Otros».
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    if estadistico not in ESTADISTICOS:
        raise ValueError(f"Estadístico desconocido: {estadistico}")
    if not consulta.sensor_ids or variable not in consulta.variables:
        return []
    sensor_meta = {
        sensor.num: (sensor.dispositivo_id, sensor.dispositivo.area_id)
        for sensor in consulta.sensores
    }
    sql = f"""
        SELECT time_bucket('{_intervalo_sql(consulta)}', l.fecha_hora, %s) AS tramo,
               l.sensor_num,
               {ESTADISTICOS[estadistico]}(l.valor) AS valor,
               COUNT(*) AS muestras
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo = %s
        GROUP BY tramo, l.sensor_num
        ORDER BY tramo
    """
    filas = _ejecutar(
        sql,
        [settings.TIME_ZONE, list(consulta.sensor_ids), inicio, fin, variable],
    )
    if not filas:
        return []

    por_grupo = defaultdict(dict)
    muestras_grupo = defaultdict(int)
    for tramo, sensor_num, valor, muestras in filas:
        dispositivo_id, area_id = sensor_meta.get(sensor_num, (None, None))
        if agrupar == "area":
            grupo = area_id
        elif agrupar == "dispositivo":
            grupo = dispositivo_id
        else:
            grupo = None
        anterior = por_grupo[grupo].get(tramo)
        if anterior is None:
            por_grupo[grupo][tramo] = (valor, muestras)
        elif estadistico == "promedio":
            total = anterior[1] + muestras
            por_grupo[grupo][tramo] = (
                (anterior[0] * anterior[1] + valor * muestras) / total,
                total,
            )
        elif estadistico == "maximo":
            por_grupo[grupo][tramo] = (max(anterior[0], valor), anterior[1] + muestras)
        else:
            por_grupo[grupo][tramo] = (min(anterior[0], valor), anterior[1] + muestras)
        muestras_grupo[grupo] += muestras

    if agrupar == "total":
        grupos = [None]
        resto = []
    else:
        grupos = sorted(
            por_grupo,
            key=lambda item: (
                -muestras_grupo[item],
                _etiqueta(consulta, agrupar, item)["nombre"],
            ),
        )
        resto = grupos[6:]
        grupos = grupos[:6]

    series = []
    for grupo in grupos:
        datos = _etiqueta(consulta, agrupar, grupo)
        puntos = [
            {"x": _iso(tramo), "y": _numero(valor)}
            for tramo, (valor, _muestras) in sorted(por_grupo[grupo].items())
        ]
        series.append({**datos, "puntos": puntos})

    if resto:
        puntos = []
        for tramo in sorted({tramo for grupo in resto for tramo in por_grupo[grupo]}):
            valores_tramo = [
                (*por_grupo[grupo][tramo], grupo)
                for grupo in resto
                if tramo in por_grupo[grupo]
            ]
            if not valores_tramo:
                continue
            if estadistico == "promedio":
                total = sum(muestras for _valor, muestras, _grupo in valores_tramo)
                valor = (
                    sum(valor * muestras for valor, muestras, _grupo in valores_tramo) / total
                    if total
                    else None
                )
            elif estadistico == "maximo":
                valor = max(valor for valor, _muestras, _grupo in valores_tramo)
            else:
                valor = min(valor for valor, _muestras, _grupo in valores_tramo)
            puntos.append({"x": _iso(tramo), "y": _numero(valor)})
        series.append(
            {"nombre": "Otros", "dimension": None, "dimension_valor": None, "puntos": puntos}
        )
    return series


def serie_previa(consulta, variable, estadistico, series_actuales):
    """Serie del periodo anterior alineada a las etiquetas del periodo actual."""
    anteriores = serie(
        consulta,
        variable,
        estadistico=estadistico,
        agrupar="total",
        inicio=consulta.previo_inicio,
        fin=consulta.previo_fin,
    )
    if not anteriores:
        return []
    actuales = sorted({punto["x"] for s in series_actuales for punto in s["puntos"]})
    if not actuales:
        return []
    puntos = anteriores[0]["puntos"]
    return [
        {"x": actuales[indice] if indice < len(actuales) else punto["x"], "y": punto["y"]}
        for indice, punto in enumerate(puntos[: len(actuales)])
    ]


def serie_lecturas(consulta, variable, inicio=None, fin=None):
    """Conteo de lecturas por intervalo para el sparkline de un KPI."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    valores, parametros = _mapeo(consulta)
    if not valores or variable not in consulta.variables:
        return []
    sql = f"""
        SELECT time_bucket('{_intervalo_sql(consulta)}', l.fecha_hora, %s) AS tramo,
               COUNT(*) AS total
        FROM lectura l
        JOIN (VALUES {valores}) AS m(sensor_num, dispositivo_id, area_id, intervalo)
          ON l.sensor_num = m.sensor_num
        WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo = %s
        GROUP BY tramo
        ORDER BY tramo
    """
    filas = _ejecutar(sql, [settings.TIME_ZONE, *parametros, inicio, fin, variable])
    return [{"x": _iso(tramo), "y": int(total)} for tramo, total in filas]


def serie_alertas(consulta, inicio=None, fin=None, estado=None, nivel=None):
    """Conteo de alertas por intervalo para el sparkline de un KPI.

    Son pocas filas (las alertas, no las lecturas), así que el agrupado se hace en Python
    con la zona horaria del servidor.
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    fechas = consulta.alertas(
        inicio=inicio,
        fin=fin,
        estado=estado,
        nivel=nivel,
    ).values_list("fecha_hora", flat=True)
    conteo = {}
    intervalo = consulta.intervalo
    for fecha in fechas:
        local = timezone.localtime(fecha)
        if intervalo == "15m":
            minuto = (local.minute // 15) * 15
            tramo = local.replace(minute=minuto, second=0, microsecond=0)
        elif intervalo == "1h":
            tramo = local.replace(minute=0, second=0, microsecond=0)
        elif intervalo == "1d":
            tramo = local.replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            tramo = local.replace(hour=0, minute=0, second=0, microsecond=0)
            tramo -= timedelta(days=tramo.weekday())
        conteo[tramo] = conteo.get(tramo, 0) + 1
    return [
        {"x": tramo.isoformat(), "y": conteo[tramo]} for tramo in sorted(conteo)
    ]


def _filas_cumplimiento(consulta, variable=None, inicio=None, fin=None):
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    clave = ("cumplimiento", variable, inicio, fin)
    if clave in consulta.memo:
        return consulta.memo[clave]
    valores, parametros = _mapeo_umbrales(consulta, variable)
    if not valores:
        consulta.memo[clave] = []
        return []
    filtro_variable = "AND m.variable_codigo = %s" if variable else ""
    parametros_extra = [variable] if variable else []
    sql = f"""
        WITH base AS (
            SELECT m.variable_codigo, m.dispositivo_id, m.area_id, m.intervalo,
                   CASE
                       WHEN l.valor >= m.advertencia_min
                        AND l.valor <= m.advertencia_max THEN 1
                       ELSE 0
                   END AS dentro
            FROM lectura l
            JOIN (VALUES {valores}) AS m(
                sensor_num, variable_codigo, dispositivo_id, area_id, intervalo,
                advertencia_min, advertencia_max, peligro_min, peligro_max
            )
              ON l.sensor_num = m.sensor_num
             AND l.variable_codigo = m.variable_codigo
            WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
              AND l.estabilizada
              {filtro_variable}
        )
        SELECT variable_codigo, dispositivo_id, area_id, intervalo,
               SUM(dentro) AS dentro, COUNT(*) AS lecturas
        FROM base
        GROUP BY variable_codigo, dispositivo_id, area_id, intervalo
    """
    filas = _ejecutar(sql, [*parametros, inicio, fin, *parametros_extra])
    resultado = [
        {
            "variable": variable_codigo,
            "dispositivo_id": dispositivo_id,
            "area_id": area_id,
            "intervalo": intervalo or 0,
            "dentro": int(dentro or 0),
            "lecturas": int(lecturas or 0),
        }
        for variable_codigo, dispositivo_id, area_id, intervalo, dentro, lecturas in filas
    ]
    consulta.memo[clave] = resultado
    return resultado


def cumplimiento_agrupado(
    consulta,
    variable=None,
    agrupar="variable",
    inicio=None,
    fin=None,
):
    """Cumplimiento por variable, área, dispositivo o sus combinaciones.

    ``dentro_pct`` y ``fuera_min`` se calculan igual que ``reportes.calculos.cumplimiento``:
    una lectura fuera cuenta los minutos del intervalo de muestreo del dispositivo.
    """
    if agrupar not in ("variable", "area", "dispositivo", "area_variable", "dispositivo_variable"):
        raise ValueError(f"Agrupación de cumplimiento desconocida: {agrupar}")
    filas = _filas_cumplimiento(consulta, variable, inicio, fin)
    acumulado = {}
    for fila in filas:
        if agrupar == "variable":
            clave = fila["variable"]
        elif agrupar == "area":
            clave = fila["area_id"]
        elif agrupar == "dispositivo":
            clave = fila["dispositivo_id"]
        elif agrupar == "area_variable":
            clave = (fila["area_id"], fila["variable"])
        else:
            clave = (fila["dispositivo_id"], fila["variable"])
        datos = acumulado.setdefault(
            clave,
            {
                "variable": fila["variable"],
                "area_id": fila["area_id"],
                "dispositivo_id": fila["dispositivo_id"],
                "dentro": 0,
                "lecturas": 0,
                "fuera_min": 0.0,
            },
        )
        datos["dentro"] += fila["dentro"]
        datos["lecturas"] += fila["lecturas"]
        datos["fuera_min"] += (
            (fila["lecturas"] - fila["dentro"]) * fila["intervalo"] / 60
        )
    resultado = []
    for datos in acumulado.values():
        lecturas = datos["lecturas"]
        datos["dentro_pct"] = _numero(datos["dentro"] / lecturas * 100) if lecturas else 0.0
        datos["fuera_min"] = _numero(datos["fuera_min"])
        resultado.append(datos)
    return resultado


def cumplimiento_total(consulta, variable=None, inicio=None, fin=None):
    """Una sola cifra de cumplimiento (todas las variables si ``variable`` es None)."""
    filas = cumplimiento_agrupado(consulta, variable, "variable", inicio, fin)
    lecturas = sum(fila["lecturas"] for fila in filas)
    if not lecturas:
        return None
    dentro = sum(fila["dentro"] for fila in filas)
    fuera_min = sum(fila["fuera_min"] for fila in filas)
    return {
        "dentro_pct": _numero(dentro / lecturas * 100),
        "fuera_min": _numero(fuera_min),
        "lecturas": lecturas,
    }


def conteo_rangos(consulta, variable=None, por="dia", inicio=None, fin=None):
    """Lecturas dentro, en advertencia y en peligro por categoría."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    valores, parametros = _mapeo_umbrales(consulta, variable)
    if not valores:
        return []
    if por in ("area", "dispositivo"):
        grupo_sql = {"area": "m.area_id", "dispositivo": "m.dispositivo_id"}[por]
        parametros_tz = []
    elif por in ("dia", "semana"):
        intervalo = "1 day" if por == "dia" else "7 days"
        grupo_sql = f"time_bucket('{intervalo}', l.fecha_hora, %s)"
        parametros_tz = [settings.TIME_ZONE]
    else:
        raise ValueError(f"Agrupación de rangos desconocida: {por}")
    filtro_variable = "AND m.variable_codigo = %s" if variable else ""
    parametros_extra = [variable] if variable else []
    sql = f"""
        WITH base AS (
            SELECT {grupo_sql} AS grupo,
                   CASE
                       WHEN l.valor > m.peligro_max OR l.valor < m.peligro_min THEN 'PELIGRO'
                       WHEN l.valor > m.advertencia_max
                         OR l.valor < m.advertencia_min THEN 'ADVERTENCIA'
                       ELSE 'DENTRO'
                   END AS nivel
            FROM lectura l
            JOIN (VALUES {valores}) AS m(
                sensor_num, variable_codigo, dispositivo_id, area_id, intervalo,
                advertencia_min, advertencia_max, peligro_min, peligro_max
            )
              ON l.sensor_num = m.sensor_num
             AND l.variable_codigo = m.variable_codigo
            WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
              AND l.estabilizada
              {filtro_variable}
        )
        SELECT grupo, nivel, COUNT(*) AS total
        FROM base
        GROUP BY grupo, nivel
        ORDER BY grupo
    """
    filas = _ejecutar(
        sql,
        [*parametros_tz, *parametros, inicio, fin, *parametros_extra],
    )
    return [
        {"grupo": grupo, "nivel": nivel, "total": int(total or 0)}
        for grupo, nivel, total in filas
    ]


def alertas_conteo(consulta, por="estado", inicio=None, fin=None, variable=None):
    """Conteo de alertas por estado, nivel, variable o tipo."""
    campos = {
        "estado": "estado",
        "nivel": "nivel",
        "variable": "umbral__variable_id",
        "tipo": "tipo",
    }
    if por not in campos:
        raise ValueError(f"Agrupación de alertas desconocida: {por}")
    consulta_alertas = consulta.alertas(
        variable=variable,
        inicio=inicio or consulta.inicio,
        fin=fin or consulta.fin,
    )
    filas = consulta_alertas.values(campos[por]).annotate(total=Count("num"))
    return {str(fila[campos[por]]): int(fila["total"]) for fila in filas}


def alertas_apiladas(consulta, serie="alertas_estado", por="dia", inicio=None, fin=None):
    """Conteos de alertas por categoría y estado/nivel para las barras apiladas."""
    campo_serie = {"alertas_estado": "estado", "alertas_nivel": "nivel"}
    if serie not in campo_serie:
        raise ValueError(f"Serie de alertas desconocida: {serie}")
    consulta_alertas = consulta.alertas(inicio=inicio or consulta.inicio, fin=fin or consulta.fin)
    zona = timezone.get_current_timezone()
    if por == "area":
        grupo = "umbral__dispositivo__area_id"
        filas = consulta_alertas.values(grupo, campo_serie[serie]).annotate(
            total=Count("num")
        )
        return [
            {
                "grupo": fila[grupo],
                "serie": fila[campo_serie[serie]],
                "total": int(fila["total"]),
            }
            for fila in filas
        ]
    if por == "dispositivo":
        grupo = "umbral__dispositivo_id"
        filas = consulta_alertas.values(grupo, campo_serie[serie]).annotate(
            total=Count("num")
        )
        return [
            {
                "grupo": fila[grupo],
                "serie": fila[campo_serie[serie]],
                "total": int(fila["total"]),
            }
            for fila in filas
        ]
    if por == "dia":
        from django.db.models.functions import TruncDay

        campo_grupo = TruncDay("fecha_hora", tzinfo=zona)
    elif por == "semana":
        from django.db.models.functions import TruncWeek

        campo_grupo = TruncWeek("fecha_hora", tzinfo=zona)
    else:
        raise ValueError(f"Agrupación de alertas desconocida: {por}")
    filas = (
        consulta_alertas.annotate(grupo=campo_grupo)
        .values("grupo", campo_serie[serie])
        .annotate(total=Count("num"))
    )
    return [
        {
            "grupo": fila["grupo"].isoformat() if fila["grupo"] else None,
            "serie": fila[campo_serie[serie]],
            "total": int(fila["total"]),
        }
        for fila in filas
    ]


def alertas_total(consulta, inicio=None, fin=None, nivel=None, estado=None, variable=None):
    return consulta.alertas(
        variable=variable,
        inicio=inicio or consulta.inicio,
        fin=fin or consulta.fin,
        nivel=nivel,
        estado=estado,
    ).count()


def gestion_atencion(consulta, inicio=None, fin=None):
    """Totales y tiempo medio de atención, igual que ``reportes.calculos.gestion_alertas``."""
    alertas = consulta.alertas(inicio=inicio or consulta.inicio, fin=fin or consulta.fin)
    datos = calculos.gestion_alertas(alertas)
    datos["atendidas"] = alertas.filter(fecha_atencion__isnull=False).count()
    return datos


def gestion_atencion_grupos(consulta, por="area", inicio=None, fin=None):
    """Minutos promedio y totales por área, dispositivo o responsable."""
    campos = {
        "area": "umbral__dispositivo__area_id",
        "dispositivo": "umbral__dispositivo_id",
        "responsable": "atendida_por_id",
        "variable": "umbral__variable_id",
    }
    if por not in campos:
        raise ValueError(f"Agrupación de atención desconocida: {por}")
    alertas = consulta.alertas(inicio=inicio or consulta.inicio, fin=fin or consulta.fin)
    campo = campos[por]
    totales = {
        fila[campo]: int(fila["total"])
        for fila in alertas.values(campo).annotate(total=Count("num"))
    }
    filas = (
        alertas.filter(fecha_atencion__isnull=False)
        .values(
            campo,
            "atendida_por__nombre",
            "atendida_por__primer_apellido",
            "atendida_por__segundo_apellido",
        )
        .annotate(
            total=Count("num"),
            media=Avg(
                ExpressionWrapper(
                    F("fecha_atencion") - F("fecha_hora"),
                    output_field=DurationField(),
                )
            ),
        )
    )
    resultado = []
    for fila in filas:
        identificador = fila[campo]
        if por == "responsable":
            nombre = " ".join(
                parte
                for parte in (
                    fila["atendida_por__nombre"],
                    fila["atendida_por__primer_apellido"],
                    fila["atendida_por__segundo_apellido"],
                )
                if parte
            )
            dimension, valor = None, None
        else:
            dimension, valor = por, identificador
            if por == "area":
                nombre = next(
                    (area.nombre for area in consulta.areas if area.num == identificador),
                    str(identificador),
                )
            elif por == "variable":
                nombre = consulta.info_variable(identificador)["nombre"]
            else:
                nombre = next(
                    (
                        dispositivo.nombre
                        for dispositivo in consulta.dispositivos
                        if dispositivo.num == identificador
                    ),
                    str(identificador),
                )
        resultado.append(
            {
                "etiqueta": nombre or "Sin responsable",
                "valor": _numero(fila["media"].total_seconds() / 60)
                if fila["media"]
                else None,
                "total": totales.get(identificador, int(fila["total"])),
                "atendidas": int(fila["total"]),
                "dimension": dimension,
                "dimension_valor": valor,
            }
        )
    for identificador, total in totales.items():
        if por == "responsable" or any(
            fila["dimension"] == por and fila["dimension_valor"] == identificador
            for fila in resultado
        ):
            continue
        if por == "area":
            nombre = next(
                (area.nombre for area in consulta.areas if area.num == identificador),
                str(identificador),
            )
        elif por == "variable":
            nombre = consulta.info_variable(identificador)["nombre"]
        else:
            nombre = next(
                (
                    dispositivo.nombre
                    for dispositivo in consulta.dispositivos
                    if dispositivo.num == identificador
                ),
                str(identificador),
            )
        resultado.append(
            {
                "etiqueta": nombre,
                "valor": None,
                "total": total,
                "atendidas": 0,
                "dimension": por,
                "dimension_valor": identificador,
            }
        )
    return resultado


def disponibilidad_datos(consulta, inicio=None, fin=None):
    """Disponibilidad por dispositivo con la misma función que los reportes."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    clave = ("disponibilidad", inicio, fin)
    if clave in consulta.memo:
        return consulta.memo[clave]
    if not consulta.sensor_ids:
        consulta.memo[clave] = {}
        return {}
    sensores = Sensor.objects.filter(num__in=consulta.sensor_ids)
    datos = calculos.disponibilidad(sensores, inicio, fin)
    consulta.memo[clave] = datos
    return datos


def disponibilidad_resumen(consulta, inicio=None, fin=None):
    """Disponibilidad total para un KPI, sin calcular los huecos.

    Solo cuenta lecturas y esperadas; el cálculo con franjas de huecos de la tarjeta
    ``disponibilidad`` sigue usando ``calculos.disponibilidad`` para coincidir con Reportes.
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    clave = ("disponibilidad_resumen", inicio, fin)
    if clave in consulta.memo:
        return consulta.memo[clave]
    if not consulta.sensor_ids or not consulta.dispositivos:
        return {"pct": None, "recibidas": 0, "esperadas": 0, "datos": {}}
    sensor_a_dispositivo = {sensor.num: sensor.dispositivo_id for sensor in consulta.sensores}
    filas = (
        Lectura.objects.filter(
            sensor_num__in=consulta.sensor_ids,
            fecha_hora__gte=inicio,
            fecha_hora__lt=fin,
            estabilizada=True,
        )
        .values("sensor_num", "variable_codigo")
        .annotate(total=Count("num"))
    )
    recibidas = defaultdict(int)
    variables_leidas = defaultdict(set)
    for fila in filas:
        dispositivo_id = sensor_a_dispositivo.get(fila["sensor_num"])
        if dispositivo_id is None:
            continue
        recibidas[dispositivo_id] += fila["total"]
        variables_leidas[dispositivo_id].add(fila["variable_codigo"])
    configuradas = defaultdict(set)
    for umbral in consulta.umbrales():
        configuradas[umbral.dispositivo_id].add(umbral.variable_id)
    datos = {}
    total_recibidas = 0
    total_esperadas = 0.0
    for dispositivo in consulta.dispositivos:
        variables = configuradas.get(dispositivo.num)
        if not variables:
            variables = {1} if variables_leidas.get(dispositivo.num) else set()
        desde = max(inicio, dispositivo.fecha_alta)
        duracion = max(0.0, (fin - desde).total_seconds())
        esperadas = (
            duracion / dispositivo.intervalo_muestreo_seg * len(variables)
            if dispositivo.intervalo_muestreo_seg and variables
            else 0
        )
        recibidas_dispositivo = recibidas.get(dispositivo.num, 0)
        pct = min(100.0, recibidas_dispositivo / esperadas * 100) if esperadas else 0.0
        datos[dispositivo.codigo_mqtt] = {
            "nombre": dispositivo.nombre,
            "area": dispositivo.area.nombre,
            "area_num": dispositivo.area_id,
            "pct": _numero(pct),
            "recibidas": recibidas_dispositivo,
            "esperadas": _numero(esperadas),
        }
        total_recibidas += recibidas_dispositivo
        total_esperadas += esperadas
    pct = min(100.0, total_recibidas / total_esperadas * 100) if total_esperadas else None
    resultado = {
        "pct": _numero(pct),
        "recibidas": int(total_recibidas),
        "esperadas": _numero(total_esperadas),
        "datos": datos,
    }
    consulta.memo[clave] = resultado
    return resultado


def disponibilidad_por_entidad(consulta, por="dispositivo", inicio=None, fin=None):
    """Disponibilidad por área o dispositivo."""
    datos = disponibilidad_datos(consulta, inicio, fin)
    if not datos:
        return []
    dispositivos = {dispositivo.codigo_mqtt: dispositivo for dispositivo in consulta.dispositivos}
    if por == "dispositivo":
        resultado = []
        for codigo, fila in datos.items():
            dispositivo = dispositivos.get(codigo)
            resultado.append(
                {
                    "etiqueta": fila["nombre"],
                    "valor": fila["pct"],
                    "recibidas": fila["recibidas"],
                    "esperadas": fila["esperadas"],
                    "huecos": fila["huecos"],
                    "dimension": "dispositivo",
                    "dimension_valor": dispositivo.num if dispositivo else None,
                }
            )
        return resultado
    if por == "area":
        acumulado = {}
        for _codigo, fila in datos.items():
            area_num = fila.get("area_num")
            datos_area = acumulado.setdefault(
                area_num,
                {"etiqueta": fila.get("area", ""), "recibidas": 0, "esperadas": 0},
            )
            datos_area["recibidas"] += fila["recibidas"]
            datos_area["esperadas"] += fila["esperadas"]
        return [
            {
                "etiqueta": fila["etiqueta"] or str(area_num),
                "valor": _numero(
                    min(100.0, fila["recibidas"] / fila["esperadas"] * 100)
                    if fila["esperadas"]
                    else 0
                ),
                "recibidas": fila["recibidas"],
                "esperadas": fila["esperadas"],
                "dimension": "area",
                "dimension_valor": area_num,
            }
            for area_num, fila in acumulado.items()
        ]
    if por == "variable":
        filas = _filas_cumplimiento(consulta, None, inicio, fin)
        dispositivos_por_id = {
            dispositivo.num: dispositivo for dispositivo in consulta.dispositivos
        }
        umbrales = {(umbral.dispositivo_id, umbral.variable_id) for umbral in consulta.umbrales()}
        acumulado = {}
        for fila in filas:
            clave = (fila["dispositivo_id"], fila["variable"])
            if clave not in umbrales:
                continue
            dispositivo = dispositivos_por_id.get(fila["dispositivo_id"])
            if dispositivo is None:
                continue
            desde = max(inicio or consulta.inicio, dispositivo.fecha_alta)
            duracion = max(0.0, ((fin or consulta.fin) - desde).total_seconds())
            esperadas = (
                duracion / dispositivo.intervalo_muestreo_seg
                if dispositivo.intervalo_muestreo_seg
                else 0
            )
            datos_variable = acumulado.setdefault(
                fila["variable"], {"recibidas": 0, "esperadas": 0}
            )
            datos_variable["recibidas"] += fila["lecturas"]
            datos_variable["esperadas"] += esperadas
        return [
            {
                "etiqueta": consulta.info_variable(variable)["nombre"],
                "valor": _numero(
                    min(100.0, datos["recibidas"] / datos["esperadas"] * 100)
                    if datos["esperadas"]
                    else 0
                ),
                "recibidas": datos["recibidas"],
                "esperadas": _numero(datos["esperadas"]),
                "dimension": "variable",
                "dimension_valor": variable,
            }
            for variable, datos in acumulado.items()
        ]
    raise ValueError(f"Agrupación de disponibilidad desconocida: {por}")


def mapa_calor(consulta, variable, estadistico="promedio", inicio=None, fin=None):
    """Hora del día × día de la semana, en la zona horaria del servidor."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    if estadistico not in ESTADISTICOS:
        raise ValueError(f"Estadístico desconocido: {estadistico}")
    valores_matriz = [[None for _ in HORAS] for _ in DIAS]
    if not consulta.sensor_ids or variable not in consulta.variables:
        return {"valores": valores_matriz, "min": None, "max": None, "alertas": False}
    sql = f"""
        SELECT EXTRACT(ISODOW FROM l.fecha_hora AT TIME ZONE %s)::int - 1 AS dia,
               EXTRACT(HOUR FROM l.fecha_hora AT TIME ZONE %s)::int AS hora,
               {ESTADISTICOS[estadistico]}(l.valor) AS valor
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo = %s
        GROUP BY dia, hora
    """
    filas = _ejecutar(
        sql,
        [
            settings.TIME_ZONE,
            settings.TIME_ZONE,
            list(consulta.sensor_ids),
            inicio,
            fin,
            variable,
        ],
    )
    for dia, hora, valor in filas:
        if 0 <= dia < 7 and 0 <= hora < 24:
            valores_matriz[dia][hora] = _numero(valor)
    numeros = [valor for fila in valores_matriz for valor in fila if valor is not None]
    return {
        "valores": valores_matriz,
        "min": min(numeros) if numeros else None,
        "max": max(numeros) if numeros else None,
        "alertas": False,
    }


def mapa_calor_alertas(consulta, inicio=None, fin=None):
    """Alertas por hora del día × día de la semana, en la zona del servidor."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    valores_matriz = [[0 for _ in HORAS] for _ in DIAS]
    zona = timezone.get_current_timezone()
    filas = (
        consulta.alertas(inicio=inicio, fin=fin)
        .annotate(
            dia=ExtractIsoWeekDay("fecha_hora", tzinfo=zona),
            hora=ExtractHour("fecha_hora", tzinfo=zona),
        )
        .values("dia", "hora")
        .annotate(total=Count("num"))
    )
    for fila in filas:
        dia = fila["dia"] - 1
        hora = fila["hora"]
        if 0 <= dia < 7 and 0 <= hora < 24:
            valores_matriz[dia][hora] = int(fila["total"])
    numeros = [valor for fila in valores_matriz for valor in fila]
    return {
        "valores": valores_matriz,
        "min": min(numeros) if numeros else None,
        "max": max(numeros) if numeros else None,
        "alertas": True,
    }


def dispersion(consulta, x, y, inicio=None, fin=None):
    """Promedio por hora de dos variables para cada dispositivo (máximo 2 000 puntos)."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    valores, parametros = _mapeo(consulta)
    if not valores or x not in consulta.variables or y not in consulta.variables:
        return {"puntos": [], "truncado": False}
    sql = f"""
        SELECT m.dispositivo_id, m.area_id,
               time_bucket('1 hour', l.fecha_hora, %s) AS tramo,
               AVG(l.valor) FILTER (WHERE l.variable_codigo = %s) AS x,
               AVG(l.valor) FILTER (WHERE l.variable_codigo = %s) AS y
        FROM lectura l
        JOIN (VALUES {valores}) AS m(sensor_num, dispositivo_id, area_id, intervalo)
          ON l.sensor_num = m.sensor_num
        WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo IN (%s, %s)
        GROUP BY m.dispositivo_id, m.area_id, tramo
        HAVING AVG(l.valor) FILTER (WHERE l.variable_codigo = %s) IS NOT NULL
           AND AVG(l.valor) FILTER (WHERE l.variable_codigo = %s) IS NOT NULL
        ORDER BY tramo
        LIMIT 2001
    """
    filas = _ejecutar(
        sql,
        [
            settings.TIME_ZONE,
            x,
            y,
            *parametros,
            inicio,
            fin,
            x,
            y,
            x,
            y,
        ],
    )
    truncado = len(filas) > 2000
    filas = filas[:2000]
    dispositivos = {dispositivo.num: dispositivo for dispositivo in consulta.dispositivos}
    return {
        "puntos": [
            {
                "x": _numero(valor_x),
                "y": _numero(valor_y),
                "etiqueta": _iso(tramo),
                "dimension": "dispositivo",
                "dimension_valor": dispositivo_id,
                "dispositivo": dispositivos[dispositivo_id].nombre
                if dispositivo_id in dispositivos
                else str(dispositivo_id),
                "area": dispositivos[dispositivo_id].area.nombre
                if dispositivo_id in dispositivos
                else "",
                "area_num": area_id,
            }
            for dispositivo_id, area_id, tramo, valor_x, valor_y in filas
        ],
        "truncado": truncado,
    }


def histograma(consulta, variable, inicio=None, fin=None):
    """Distribución de una variable en 10–30 cubetas automáticas."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    datos = resumen(consulta, variable, inicio, fin)
    total = datos["lecturas"]
    if not total or datos["minimo"] is None or datos["maximo"] is None:
        return {"cubetas": [], "total": 0, "min": None, "max": None}
    cubetas = min(30, max(10, math.ceil(1 + 3.322 * math.log2(total))) if total > 1 else 10)
    minimo = float(datos["minimo"])
    maximo = float(datos["maximo"])
    ancho = (maximo - minimo) / cubetas
    if ancho <= 0:
        ancho = 1.0
        inicio_rango = minimo - 0.5
    else:
        inicio_rango = minimo
    sql = """
        SELECT LEAST(%s, GREATEST(0, FLOOR((l.valor - %s) / %s)::int)) AS indice,
               COUNT(*) AS total
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          AND l.variable_codigo = %s
        GROUP BY indice
    """
    filas = _ejecutar(
        sql,
        [cubetas - 1, inicio_rango, ancho, list(consulta.sensor_ids), inicio, fin, variable],
    )
    por_indice = {indice: int(cantidad) for indice, cantidad in filas}
    info = consulta.info_variable(variable)
    decimales = info["decimales"]
    resultado = []
    for indice in range(cubetas):
        desde = inicio_rango + indice * ancho
        hasta = desde + ancho
        if indice == cubetas - 1:
            hasta = max(hasta, maximo)
        resultado.append(
            {
                "desde": _numero(desde),
                "hasta": _numero(hasta),
                "etiqueta": f"{desde:.{decimales}f}–{hasta:.{decimales}f}",
                "valor": por_indice.get(indice, 0),
            }
        )
    return {
        "cubetas": resultado,
        "total": total,
        "min": _numero(inicio_rango),
        "max": _numero(maximo),
    }


def _valores_lecturas(consulta, variable, agrupar, inicio, fin):
    valores, parametros = _mapeo(consulta)
    if not valores:
        return []
    grupo_sql, _ = _grupo(agrupar)
    filtro_variable = "AND l.variable_codigo = %s" if variable else ""
    parametros_extra = [variable] if variable else []
    sql = f"""
        SELECT {grupo_sql} AS grupo, COUNT(*) AS total
        FROM lectura l
        JOIN (VALUES {valores}) AS m(sensor_num, dispositivo_id, area_id, intervalo)
          ON l.sensor_num = m.sensor_num
        WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          {filtro_variable}
        GROUP BY grupo
    """
    filas = _ejecutar(sql, [*parametros, inicio, fin, *parametros_extra])
    return [
        {**_entidad(consulta, agrupar, grupo), "valor": int(total)}
        for grupo, total in filas
    ]


def _valores_estadistico(consulta, variable, agrupar, estadistico, inicio, fin):
    valores, parametros = _mapeo(consulta)
    if not valores:
        return []
    if agrupar == "variable":
        filtro_variable = ""
        parametros_extra = []
    elif variable in consulta.variables:
        filtro_variable = "AND l.variable_codigo = %s"
        parametros_extra = [variable]
    else:
        return []
    grupo_sql, _ = _grupo(agrupar)
    sql = f"""
        SELECT {grupo_sql} AS grupo, {ESTADISTICOS[estadistico]}(l.valor) AS valor
        FROM lectura l
        JOIN (VALUES {valores}) AS m(sensor_num, dispositivo_id, area_id, intervalo)
          ON l.sensor_num = m.sensor_num
        WHERE l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          {filtro_variable}
        GROUP BY grupo
    """
    filas = _ejecutar(sql, [*parametros, inicio, fin, *parametros_extra])
    return [
        {**_entidad(consulta, agrupar, grupo), "valor": _numero(valor)}
        for grupo, valor in filas
    ]


def _valores_cumplimiento(consulta, variable, agrupar, inicio, fin):
    if agrupar == "variable":
        filas = cumplimiento_agrupado(consulta, None, "variable", inicio, fin)
    elif agrupar in ("area", "dispositivo"):
        filas = cumplimiento_agrupado(consulta, variable, agrupar, inicio, fin)
    else:
        return []
    resultado = []
    for fila in filas:
        grupo = fila["variable"] if agrupar == "variable" else fila[f"{agrupar}_id"]
        resultado.append(
            {
                **_entidad(consulta, agrupar, grupo),
                "valor": fila["dentro_pct"],
            }
        )
    return resultado


def _valores_alertas(consulta, variable, agrupar, inicio, fin):
    if agrupar not in ("area", "dispositivo", "variable"):
        return []
    campos = {
        "area": "umbral__dispositivo__area_id",
        "dispositivo": "umbral__dispositivo_id",
        "variable": "umbral__variable_id",
    }
    consulta_alertas = consulta.alertas(
        variable=variable,
        inicio=inicio,
        fin=fin,
    )
    filas = (
        consulta_alertas.values(campos[agrupar])
        .annotate(total=Count("num"))
        .order_by()
    )
    return [
        {**_entidad(consulta, agrupar, fila[campos[agrupar]]), "valor": int(fila["total"])}
        for fila in filas
    ]


def _valores_atencion(consulta, variable, agrupar, inicio, fin):
    filas = gestion_atencion_grupos(consulta, agrupar, inicio, fin)
    return [
        {
            "etiqueta": fila["etiqueta"],
            "valor": fila["valor"],
            "dimension": fila["dimension"],
            "dimension_valor": fila["dimension_valor"],
        }
        for fila in filas
    ]


def valores_por_entidad(consulta, metrica, variable=None, agrupar="area", inicio=None, fin=None):
    """Valor de una métrica para cada área, dispositivo o variable.

    Es la base de las tarjetas de barras y ranking. La variable puede ser ``None`` para
    agregar todas las variables (solo tiene sentido al agrupar por variable o para alertas).
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    if metrica in ESTADISTICOS:
        return _valores_estadistico(consulta, variable, agrupar, metrica, inicio, fin)
    if metrica == "lecturas":
        return _valores_lecturas(consulta, variable, agrupar, inicio, fin)
    if metrica == "cumplimiento":
        return _valores_cumplimiento(consulta, variable, agrupar, inicio, fin)
    if metrica == "disponibilidad":
        return disponibilidad_por_entidad(consulta, agrupar, inicio, fin)
    if metrica == "alertas":
        return _valores_alertas(consulta, variable, agrupar, inicio, fin)
    if metrica == "tiempo_atencion":
        return _valores_atencion(consulta, variable, agrupar, inicio, fin)
    raise ValueError(f"Métrica desconocida: {metrica}")


def matriz(consulta, por="area", valor="promedio", inicio=None, fin=None):
    """Valores por fila (área o dispositivo) y variable para la tarjeta matriz."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    filas = (
        [
            {
                "id": area.num,
                "etiqueta": area.nombre,
                "dimension": "area",
                "dimension_valor": area.num,
            }
            for area in consulta.areas
        ]
        if por == "area"
        else [
            {
                "id": dispositivo.num,
                "etiqueta": dispositivo.nombre,
                "dimension": "dispositivo",
                "dimension_valor": dispositivo.num,
            }
            for dispositivo in consulta.dispositivos
        ]
    )
    variables = [
        {"codigo": codigo, **consulta.info_variable(codigo)} for codigo in VARIABLES
    ]
    datos = {}
    if valor == "promedio":
        if consulta.sensor_ids:
            sensor_meta = {
                sensor.num: (
                    sensor.dispositivo_id if por == "dispositivo" else sensor.dispositivo.area_id
                )
                for sensor in consulta.sensores
            }
            sql = """
                SELECT l.sensor_num, l.variable_codigo, SUM(l.valor), COUNT(*)
                FROM lectura l
                WHERE l.sensor_num = ANY(%s)
                  AND l.fecha_hora >= %s AND l.fecha_hora < %s
                  AND l.estabilizada
                GROUP BY l.sensor_num, l.variable_codigo
            """
            acumulado = {}
            for sensor_num, variable, suma, cantidad in _ejecutar(
                sql, [list(consulta.sensor_ids), inicio, fin]
            ):
                fila = sensor_meta.get(sensor_num)
                if fila is None:
                    continue
                clave = (fila, variable)
                previo = acumulado.get(clave, (0, 0))
                acumulado[clave] = (previo[0] + suma, previo[1] + cantidad)
            for (fila, variable), (suma, cantidad) in acumulado.items():
                datos[(fila, variable)] = _numero(suma / cantidad) if cantidad else None
    elif valor == "cumplimiento":
        agrupar = "area_variable" if por == "area" else "dispositivo_variable"
        for fila in cumplimiento_agrupado(consulta, None, agrupar, inicio, fin):
            datos[(fila[f"{por}_id"], fila["variable"])] = fila["dentro_pct"]
    elif valor == "alertas":
        campo = "umbral__dispositivo__area_id" if por == "area" else "umbral__dispositivo_id"
        for fila in (
            consulta.alertas(inicio=inicio, fin=fin)
            .values(campo, "umbral__variable_id")
            .annotate(total=Count("num"))
        ):
            datos[(fila[campo], fila["umbral__variable_id"])] = int(fila["total"])
    else:
        raise ValueError(f"Valor de matriz desconocido: {valor}")
    return {
        "columnas": variables,
        "filas": [
            {
                **fila,
                "celdas": [
                    {
                        "variable": variable["codigo"],
                        "valor": datos.get((fila["id"], variable["codigo"])),
                        "dimension": "variable",
                        "dimension_valor": variable["codigo"],
                    }
                    for variable in variables
                ],
            }
            for fila in filas
        ],
        "semaforo": valor == "cumplimiento",
    }


def dispositivos_en_linea(consulta):
    from common import roles

    return sum(
        1
        for dispositivo in consulta.dispositivos
        if dispositivo.estado_dispositivo_id == roles.DISPOSITIVO_EN_LINEA
    )
