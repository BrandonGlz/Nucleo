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

from apps.reportes import calculos

from .filtros import INTERVALOS_SQL, VARIABLES

HORAS = list(range(24))
DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
NIVELES = ("DENTRO", "ADVERTENCIA", "PELIGRO")
ESTADISTICOS = {"promedio": "AVG", "maximo": "MAX", "minimo": "MIN"}


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


def _combinar(actual, total, suma, minimo, maximo):
    """Combina ``[count, suma, mínimo, máximo]`` de dos agregados."""
    if actual is None:
        return [total, suma, minimo, maximo]
    return [
        actual[0] + total,
        actual[1] + suma,
        minimo if actual[2] is None else min(actual[2], minimo),
        maximo if actual[3] is None else max(actual[3], maximo),
    ]


def _resumen_de(agregado):
    if not agregado or not agregado[0]:
        return {"lecturas": 0, "promedio": None, "minimo": None, "maximo": None}
    count, suma, minimo, maximo = agregado
    return {
        "lecturas": int(count),
        "promedio": _numero(suma / count),
        "minimo": _numero(minimo),
        "maximo": _numero(maximo),
    }


def _base_agregada(consulta, variable=None, inicio=None, fin=None):
    """Un solo barrido por rango, agrupado por sensor, variable e intervalo.

    Devuelve por variable los agregados ``[count, suma, mínimo, máximo]`` de todo el
    periodo y por dispositivo y tramo. Los KPIs, la tendencia y las barras de la misma
    variable comparten este resultado (``consulta.memo``).
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    clave = ("base_agregada", variable, inicio, fin)
    if clave in consulta.memo:
        return consulta.memo[clave]
    if not consulta.sensor_ids:
        consulta.memo[clave] = {}
        return {}
    filtro_variable = "AND l.variable_codigo = %s" if variable else ""
    parametros_extra = [variable] if variable else []
    sql = f"""
        SELECT l.sensor_num, l.variable_codigo,
               time_bucket('{_intervalo_sql(consulta)}', l.fecha_hora, %s) AS tramo,
               COUNT(*), SUM(l.valor), MIN(l.valor), MAX(l.valor)
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
          {filtro_variable}
        GROUP BY l.sensor_num, l.variable_codigo, tramo
        ORDER BY tramo
    """
    filas = _ejecutar(
        sql,
        [settings.TIME_ZONE, list(consulta.sensor_ids), inicio, fin, *parametros_extra],
    )
    sensor_meta = {sensor.num: sensor.dispositivo_id for sensor in consulta.sensores}
    datos = {}
    for sensor_num, variable, tramo, total, suma, minimo, maximo in filas:
        dispositivo_id = sensor_meta.get(sensor_num)
        if dispositivo_id is None:
            continue
        por_variable = datos.setdefault(
            variable,
            {"total": None, "por_dispositivo": {}},
        )
        por_variable["total"] = _combinar(
            por_variable["total"], total, suma, minimo, maximo
        )
        por_dispositivo = por_variable["por_dispositivo"]
        por_tramo = por_dispositivo.setdefault(dispositivo_id, {})
        por_tramo[tramo] = _combinar(
            por_tramo.get(tramo), total, suma, minimo, maximo
        )
    for por_variable in datos.values():
        por_variable["tramos"] = sorted(
            {
                tramo
                for por_tramo in por_variable["por_dispositivo"].values()
                for tramo in por_tramo
            }
        )
    consulta.memo[clave] = datos
    return datos


def _agregados(consulta, variable, inicio=None, fin=None):
    """Resumen y series por estadístico de una variable desde ``_base_agregada``."""
    datos = _base_agregada(consulta, variable, inicio, fin).get(variable)
    if not datos:
        return {
            "resumen": {"lecturas": 0, "promedio": None, "minimo": None, "maximo": None},
            "series": {"promedio": [], "minimo": [], "maximo": [], "lecturas": []},
        }
    resumen = _resumen_de(datos["total"])
    series = {"promedio": [], "minimo": [], "maximo": [], "lecturas": []}
    por_tramo = {}
    for dispositivo in datos["por_dispositivo"].values():
        for tramo, agregado in dispositivo.items():
            por_tramo[tramo] = _combinar(
                por_tramo.get(tramo), *agregado
            )
    for tramo in sorted(por_tramo):
        agregado = por_tramo[tramo]
        count, suma, minimo, maximo = agregado
        series["promedio"].append(
            {"x": _iso(tramo), "y": _numero(suma / count) if count else None}
        )
        series["minimo"].append({"x": _iso(tramo), "y": _numero(minimo)})
        series["maximo"].append({"x": _iso(tramo), "y": _numero(maximo)})
        series["lecturas"].append({"x": _iso(tramo), "y": int(count or 0)})
    return {"resumen": resumen, "series": series}


def resumen(consulta, variable, inicio=None, fin=None):
    """Lecturas, promedio, mínimo y máximo de una variable en el periodo."""
    return _agregados(consulta, variable, inicio, fin)["resumen"]


def resumen_por_variable(consulta, inicio=None, fin=None):
    """El resumen de ``resumen`` para cada variable del alcance."""
    return {
        variable: _resumen_de(datos["total"])
        for variable, datos in _base_agregada(consulta, None, inicio, fin).items()
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
    if agrupar == "total":
        puntos = _agregados(consulta, variable, inicio, fin)["series"][estadistico]
        if not puntos:
            return []
        return [
            {
                "nombre": "Total",
                "dimension": None,
                "dimension_valor": None,
                "puntos": puntos,
            }
        ]
    datos_variable = _base_agregada(consulta, variable, inicio, fin).get(variable)
    if not datos_variable:
        return []
    areas = {dispositivo.num: dispositivo.area_id for dispositivo in consulta.dispositivos}
    por_grupo = defaultdict(dict)
    muestras_grupo = defaultdict(int)
    for dispositivo_id, por_tramo in datos_variable["por_dispositivo"].items():
        area_id = areas.get(dispositivo_id)
        if agrupar == "area":
            grupo = area_id
        else:
            grupo = dispositivo_id
        for tramo, agregado in por_tramo.items():
            count, suma, minimo, maximo = agregado
            if estadistico == "promedio":
                valor = suma / count
            elif estadistico == "maximo":
                valor = maximo
            else:
                valor = minimo
            anterior = por_grupo[grupo].get(tramo)
            if anterior is None:
                por_grupo[grupo][tramo] = (valor, count)
            elif estadistico == "promedio":
                total = anterior[1] + count
                por_grupo[grupo][tramo] = (
                    (anterior[0] * anterior[1] + valor * count) / total,
                    total,
                )
            elif estadistico == "maximo":
                por_grupo[grupo][tramo] = (max(anterior[0], valor), anterior[1] + count)
            else:
                por_grupo[grupo][tramo] = (min(anterior[0], valor), anterior[1] + count)
            muestras_grupo[grupo] += count

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
    return _agregados(consulta, variable, inicio, fin)["series"]["lecturas"]


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


def _disponibilidad_base(consulta, inicio=None, fin=None):
    """Conteos y porcentaje por dispositivo en un solo barrido.

    No calcula huecos: los comparte con el KPI y el medidor. Los huecos se añaden en
    ``disponibilidad_datos`` solo a los dispositivos que los necesitan.
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    clave = ("disponibilidad_base", inicio, fin)
    if clave in consulta.memo:
        return consulta.memo[clave]
    if not consulta.sensor_ids:
        consulta.memo[clave] = {}
        return {}
    sql = """
        SELECT l.sensor_num, COUNT(*), MIN(l.fecha_hora), MAX(l.fecha_hora)
        FROM lectura l
        WHERE l.sensor_num = ANY(%s)
          AND l.fecha_hora >= %s AND l.fecha_hora < %s
          AND l.estabilizada
        GROUP BY l.sensor_num
    """
    filas = _ejecutar(sql, [list(consulta.sensor_ids), inicio, fin])
    sensor_meta = {sensor.num: sensor.dispositivo for sensor in consulta.sensores}
    por_dispositivo = {}
    for sensor_num, total, primero, ultimo in filas:
        dispositivo = sensor_meta.get(sensor_num)
        if dispositivo is None:
            continue
        datos = por_dispositivo.setdefault(
            dispositivo.num,
            {"recibidas": 0, "primero": None, "ultimo": None},
        )
        datos["recibidas"] += int(total)
        datos["primero"] = primero if datos["primero"] is None else min(datos["primero"], primero)
        datos["ultimo"] = ultimo if datos["ultimo"] is None else max(datos["ultimo"], ultimo)
    configuradas = defaultdict(set)
    for umbral in consulta.umbrales():
        configuradas[umbral.dispositivo_id].add(umbral.variable_id)
    datos = {}
    for dispositivo in consulta.dispositivos:
        lecturas = por_dispositivo.get(dispositivo.num, {})
        recibidas = lecturas.get("recibidas", 0)
        variables = configuradas.get(dispositivo.num)
        if not variables:
            variables = {1} if recibidas else set()
        desde = max(inicio, dispositivo.fecha_alta)
        duracion = max(0.0, (fin - desde).total_seconds())
        esperadas = (
            duracion / dispositivo.intervalo_muestreo_seg * len(variables)
            if dispositivo.intervalo_muestreo_seg and variables
            else 0
        )
        pct = min(100.0, recibidas / esperadas * 100) if esperadas else 0.0
        datos[dispositivo.codigo_mqtt] = {
            "nombre": dispositivo.nombre,
            "area": dispositivo.area.nombre,
            "area_num": dispositivo.area_id,
            "pct": _numero(pct),
            "recibidas": recibidas,
            "esperadas": _numero(esperadas),
            "primero": lecturas.get("primero"),
            "ultimo": lecturas.get("ultimo"),
            "intervalo": dispositivo.intervalo_muestreo_seg,
            "variables": len(variables),
            "desde": desde,
        }
    consulta.memo[clave] = datos
    return datos


def disponibilidad_resumen(consulta, inicio=None, fin=None):
    """Disponibilidad total para un KPI o medidor, sin calcular los huecos."""
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    datos = _disponibilidad_base(consulta, inicio, fin)
    recibidas = sum(fila["recibidas"] for fila in datos.values())
    esperadas = sum(float(fila["esperadas"] or 0) for fila in datos.values())
    pct = min(100.0, recibidas / esperadas * 100) if esperadas else None
    return {
        "pct": _numero(pct),
        "recibidas": int(recibidas),
        "esperadas": _numero(esperadas),
        "datos": datos,
    }


def _huecos_frontera(fila, inicio, fin):
    intervalo = max(fila["intervalo"] or 1, 1)
    huecos = []
    if fila["primero"] is not None:
        minutos = (fila["primero"] - inicio).total_seconds() / 60
        if (fila["primero"] - inicio).total_seconds() > 2 * intervalo:
            huecos.append({"inicio": _iso(inicio), "minutos": _numero(minutos)})
    if fila["ultimo"] is not None:
        minutos = (fin - fila["ultimo"]).total_seconds() / 60
        if (fin - fila["ultimo"]).total_seconds() > 2 * intervalo:
            huecos.append({"inicio": _iso(fila["ultimo"]), "minutos": _numero(minutos)})
    return sorted(huecos, key=lambda hueco: hueco["minutos"], reverse=True)[:3]


def disponibilidad_datos(consulta, inicio=None, fin=None):
    """Disponibilidad por dispositivo y sus huecos, en SQL.

    Los conteos salen de un barrido; los huecos internos solo se consultan para los
    dispositivos cuyo faltante no se explica por los extremos del periodo.
    """
    inicio = inicio or consulta.inicio
    fin = fin or consulta.fin
    datos = _disponibilidad_base(consulta, inicio, fin)
    if not datos:
        return {}
    claves = ("nombre", "area", "area_num", "pct", "recibidas", "esperadas")
    resultado = {codigo: {clave: fila[clave] for clave in claves} for codigo, fila in datos.items()}
    sospechosos = []
    for codigo, fila in datos.items():
        if not fila["recibidas"]:
            desde = fila["desde"]
            duracion = max(0.0, (fin - desde).total_seconds() / 60)
            resultado[codigo]["huecos"] = [{"inicio": _iso(desde), "minutos": _numero(duracion)}]
            continue
        resultado[codigo]["huecos"] = _huecos_frontera(fila, inicio, fin)
        intervalo = max(fila["intervalo"] or 1, 1)
        frontera = (
            (fila["primero"] - fila["desde"]).total_seconds()
            + (fin - fila["ultimo"]).total_seconds()
        ) / intervalo * fila["variables"]
        faltan = (fila["esperadas"] or 0) - fila["recibidas"]
        if faltan > frontera + max(1, fila["variables"]):
            sospechosos.append(codigo)
    if sospechosos:
        sensores = [
            sensor
            for sensor in consulta.sensores
            if sensor.dispositivo.codigo_mqtt in sospechosos
        ]
        mapeo = [
            (
                sensor.num,
                sensor.dispositivo.codigo_mqtt,
                sensor.dispositivo.intervalo_muestreo_seg or 0,
            )
            for sensor in sensores
        ]
        huecos = calculos._huecos(mapeo, inicio, fin)
        for codigo in sospechosos:
            resultado[codigo]["huecos"] = huecos.get(codigo, [])
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


def _agregado_por_entidad(consulta, variable, agrupar, inicio, fin):
    """Agregados [count, suma, mínimo, máximo] por área, dispositivo o variable."""
    if agrupar == "variable":
        return {
            codigo: datos["total"]
            for codigo, datos in _base_agregada(consulta, None, inicio, fin).items()
        }
    if variable not in consulta.variables:
        return {}
    datos = _base_agregada(consulta, variable, inicio, fin).get(variable)
    if not datos:
        return {}
    areas = {dispositivo.num: dispositivo.area_id for dispositivo in consulta.dispositivos}
    acumulado = {}
    for dispositivo_id, por_tramo in datos["por_dispositivo"].items():
        grupo = areas.get(dispositivo_id) if agrupar == "area" else dispositivo_id
        total = None
        for agregado in por_tramo.values():
            total = _combinar(total, *agregado)
        acumulado[grupo] = _combinar(acumulado.get(grupo), *total)
    return acumulado


def _valores_lecturas(consulta, variable, agrupar, inicio, fin):
    agregados = _agregado_por_entidad(consulta, variable, agrupar, inicio, fin)
    return [
        {**_entidad(consulta, agrupar, grupo), "valor": int(agregado[0])}
        for grupo, agregado in agregados.items()
    ]


def _valores_estadistico(consulta, variable, agrupar, estadistico, inicio, fin):
    agregados = _agregado_por_entidad(consulta, variable, agrupar, inicio, fin)
    resultado = []
    for grupo, agregado in agregados.items():
        count, suma, minimo, maximo = agregado
        valor = suma / count if estadistico == "promedio" and count else (
            maximo if estadistico == "maximo" else minimo
        )
        resultado.append({**_entidad(consulta, agrupar, grupo), "valor": _numero(valor)})
    return resultado


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
