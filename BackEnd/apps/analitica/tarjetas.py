"""Un calculador por tipo de tarjeta de Analítica.

Cada función recibe la tarjeta normalizada y la ``Consulta`` ya acotada por el filtro
cruzado, y devuelve un JSON pequeño listo para dibujar. Los formatos son:

- ``kpi``: ``valor``, ``unidad``, ``decimales``, ``previo``, ``variacion``
  ``{pct, abs, unidad, sentido, mejora}``, ``meta``/``meta_estado`` y ``sparkline``
  ``[{x, y}]`` o ``null``.
- ``tendencia``: ``series`` ``[{nombre, dimension, dimension_valor, puntos [{x, y}]}]``,
  ``previo`` (una serie punteada), ``umbrales`` o ``nota_umbrales``.
- ``medidor``: ``valor``, ``min``, ``max``, ``previo``, ``variacion`` y meta.
- ``barras``/``ranking``: ``barras``/``filas`` con ``etiqueta``, ``valor``, ``dimension``,
  ``dimension_valor``, ``previo`` y ``variacion``; en barras, ``meta`` para la línea.
- ``barras_apiladas``: ``categorias``, ``series`` con ``valores`` y ``porcentaje``.
- ``matriz``: ``columnas``, ``filas`` con ``celdas`` y ``semaforo``.
- ``mapa_calor``: ``dias``, ``horas`` y ``valores`` de 7 × 24.
- ``dispersion``: ``puntos`` con ``x``, ``y``, ``dimension`` y ``dimension_valor``.
- ``histograma``: ``cubetas`` con ``desde``, ``hasta``, ``etiqueta`` y ``valor``.
- ``alertas_dona``: ``sectores`` con ``etiqueta``, ``valor``, ``porcentaje``,
  ``dimension`` y ``dimension_valor``.
- ``tiempo_atencion``: ``promedio``, ``total``, ``atendidas`` y ``grupos``.
- ``disponibilidad``: ``promedio`` y ``filas`` con ``huecos``.
- ``texto``: ``nota``; ``hallazgos``: ``bajo_demanda``.
"""

from . import consultas

INDICADORES_VARIABLE = ("lecturas", "promedio", "minimo", "maximo", "cumplimiento")
ETIQUETAS_ESTADO = {
    "PENDIENTE": "Pendiente",
    "ATENDIDA": "Atendida",
    "DESCARTADA": "Descartada",
}
ETIQUETAS_NIVEL = {"ADVERTENCIA": "Advertencia", "PELIGRO": "Peligro"}
ETIQUETAS_TIPO = {"POR_ENCIMA": "Por encima", "POR_DEBAJO": "Por debajo"}
ETIQUETAS_RANGO = {"DENTRO": "Dentro", "ADVERTENCIA": "Advertencia", "PELIGRO": "Peligro"}


def _r(valor, decimales):
    if valor is None:
        return None
    if decimales <= 0:
        return int(round(float(valor)))
    return round(float(valor), decimales)


def _variacion(actual, previo, sentido_mejora=None, unidad=""):
    if actual is None or previo is None:
        return None
    diferencia = float(actual) - float(previo)
    porcentaje = None if float(previo) == 0 else diferencia / float(previo) * 100
    if abs(diferencia) < 0.005:
        sentido = "igual"
        mejora = None
    elif diferencia > 0:
        sentido = "sube"
        mejora = True if sentido_mejora == "mayor" else False if sentido_mejora == "menor" else None
    else:
        sentido = "baja"
        mejora = True if sentido_mejora == "menor" else False if sentido_mejora == "mayor" else None
    return {
        "pct": round(porcentaje, 2) if porcentaje is not None else None,
        "abs": round(diferencia, 2),
        "unidad": "pts" if unidad == "%" else unidad,
        "sentido": sentido,
        "mejora": mejora,
    }


def _texto_meta(meta, unidad, decimales):
    valor = meta["valor"]
    if float(valor).is_integer():
        valor = int(valor)
    else:
        valor = _r(valor, decimales)
    simbolo = "≥" if meta["sentido"] == "mayor" else "≤"
    sufijo = f" {unidad}" if unidad else ""
    return f"Meta {simbolo} {valor}{sufijo}"


def _meta(tarjeta, valor, unidad, decimales):
    meta = tarjeta.get("meta")
    if not meta:
        return None, None
    estado = None
    if valor is not None:
        tolerancia = float(meta["tolerancia"]) / 100
        if meta["sentido"] == "mayor":
            if valor >= meta["valor"]:
                estado = "cumple"
            elif valor >= meta["valor"] * (1 - tolerancia):
                estado = "cerca"
            else:
                estado = "lejos"
        else:
            if valor <= meta["valor"]:
                estado = "cumple"
            elif valor <= meta["valor"] * (1 + tolerancia):
                estado = "cerca"
            else:
                estado = "lejos"
    return {
        "valor": meta["valor"],
        "sentido": meta["sentido"],
        "tolerancia": meta["tolerancia"],
        "estado": estado,
        "texto": _texto_meta(meta, unidad, decimales),
    }, estado


def _sentido_indicador(indicador):
    if indicador in ("cumplimiento", "disponibilidad", "dispositivos_en_linea"):
        return "mayor"
    if indicador in ("tiempo_atencion", "alertas", "alertas_pendientes"):
        return "menor"
    return None


def _unidad_metrica(consulta, metrica, variable):
    if metrica in ("cumplimiento", "disponibilidad"):
        return "%", 1
    if metrica in ("alertas", "lecturas"):
        return "", 0
    if metrica == "tiempo_atencion":
        return "min", 0
    info = consulta.info_variable(variable or "TEMP")
    return info["unidad"], info["decimales"]


def _puntos(puntos, decimales):
    return [{"x": punto["x"], "y": _r(punto["y"], decimales)} for punto in puntos]


def _con_base(tarjeta, datos):
    datos.setdefault("tipo", tarjeta["tipo"])
    datos.setdefault("titulo", tarjeta["titulo"])
    datos.setdefault("previo", None)
    datos.setdefault("variacion", None)
    datos.setdefault("meta", None)
    datos.setdefault("meta_estado", None)
    datos.setdefault("sin_datos", False)
    return datos


def kpi(tarjeta, consulta):
    """KPI con valor grande, comparación, meta y sparkline."""
    opciones = tarjeta["opciones"]
    indicador = opciones["indicador"]
    comparar = opciones.get("comparar", True)
    con_sparkline = opciones.get("sparkline", True)
    variable = consulta.variable_efectiva(tarjeta)
    previo = None
    sparkline = None
    datos_extra = {"indicador": indicador}

    if indicador in ("lecturas", "promedio", "minimo", "maximo"):
        info = consulta.info_variable(variable)
        unidad, decimales = info["unidad"], info["decimales"]
        actual = consultas.resumen(consulta, variable)[indicador]
        if comparar:
            previo = consultas.resumen(
                consulta, variable, consulta.previo_inicio, consulta.previo_fin
            )[indicador]
        if con_sparkline and actual is not None:
            if indicador == "lecturas":
                puntos = consultas.serie_lecturas(consulta, variable)
            else:
                estadistico = indicador if indicador in ("minimo", "maximo") else "promedio"
                serie = consultas.serie(
                    consulta, variable, estadistico=estadistico, agrupar="total"
                )
                puntos = serie[0]["puntos"] if serie else []
            sparkline = _puntos(puntos, decimales) if puntos else None
        datos_extra["variable"] = variable
        sentido = _sentido_indicador(indicador)
    elif indicador == "cumplimiento":
        unidad, decimales = "%", 1
        datos = consultas.cumplimiento_total(consulta, variable)
        actual = datos["dentro_pct"] if datos else None
        if comparar:
            previos = consultas.cumplimiento_total(
                consulta, variable, consulta.previo_inicio, consulta.previo_fin
            )
            previo = previos["dentro_pct"] if previos else None
        datos_extra["variable"] = variable
        sentido = "mayor"
    elif indicador == "disponibilidad":
        unidad, decimales = "%", 1
        actual = consultas.disponibilidad_resumen(consulta)["pct"]
        if comparar:
            previo = consultas.disponibilidad_resumen(
                consulta, consulta.previo_inicio, consulta.previo_fin
            )["pct"]
        sentido = "mayor"
    elif indicador == "alertas":
        unidad, decimales = "", 0
        nivel = opciones.get("nivel") or None
        actual = consultas.alertas_total(consulta, nivel=nivel)
        if comparar:
            previo = consultas.alertas_total(
                consulta,
                inicio=consulta.previo_inicio,
                fin=consulta.previo_fin,
                nivel=nivel,
            )
        if con_sparkline:
            puntos = consultas.serie_alertas(consulta, nivel=nivel)
            sparkline = _puntos(puntos, 0) if puntos else None
        sentido = "menor"
    elif indicador == "alertas_pendientes":
        unidad, decimales = "", 0
        actual = consultas.alertas_total(consulta, estado="PENDIENTE")
        if comparar:
            previo = consultas.alertas_total(
                consulta,
                inicio=consulta.previo_inicio,
                fin=consulta.previo_fin,
                estado="PENDIENTE",
            )
        if con_sparkline:
            puntos = consultas.serie_alertas(consulta, estado="PENDIENTE")
            sparkline = _puntos(puntos, 0) if puntos else None
        sentido = "menor"
    elif indicador == "tiempo_atencion":
        unidad, decimales = "min", 0
        gestion = consultas.gestion_atencion(consulta)
        actual = gestion["tiempo_medio_min"]
        if comparar:
            previo = consultas.gestion_atencion(
                consulta, consulta.previo_inicio, consulta.previo_fin
            )["tiempo_medio_min"]
        sentido = "menor"
    else:
        unidad, decimales = "", 0
        actual = consultas.dispositivos_en_linea(consulta)
        sentido = "mayor"

    meta, meta_estado = _meta(tarjeta, actual, unidad, decimales)
    variacion = _variacion(actual, previo, sentido, unidad) if comparar else None
    return _con_base(
        tarjeta,
        {
            **datos_extra,
            "valor": _r(actual, decimales),
            "unidad": unidad,
            "decimales": decimales,
            "previo": _r(previo, decimales) if comparar else None,
            "variacion": variacion,
            "meta": meta,
            "meta_estado": meta_estado,
            "sparkline": sparkline,
            "sin_datos": actual is None or (indicador == "lecturas" and not actual),
        },
    )


def tendencia(tarjeta, consulta):
    """Serie de tiempo con comparación y bandas de umbral de un dispositivo."""
    opciones = tarjeta["opciones"]
    variable = consulta.variable_efectiva(tarjeta)
    info = consulta.info_variable(variable)
    series = consultas.serie(
        consulta,
        variable,
        estadistico=opciones["estadistico"],
        agrupar=opciones["agrupar"],
    )
    for serie in series:
        serie["puntos"] = _puntos(serie["puntos"], info["decimales"])
    previo = []
    if opciones.get("comparar", True) and series:
        previo = _puntos(
            consultas.serie_previa(
                consulta,
                variable,
                opciones["estadistico"],
                series,
            ),
            info["decimales"],
        )
    umbrales = None
    nota = None
    if opciones.get("umbrales", True):
        if len(consulta.dispositivo_ids) != 1:
            nota = "Las bandas de umbral se muestran al filtrar un dispositivo."
        else:
            fila = consulta.umbrales(variable, consulta.dispositivo_ids[0])
            if not fila:
                nota = "El dispositivo no tiene umbrales para esta variable."
            else:
                umbral = fila[0]
                umbrales = {
                    "advertencia_min": float(umbral.advertencia_min),
                    "advertencia_max": float(umbral.advertencia_max),
                    "peligro_min": float(umbral.peligro_min),
                    "peligro_max": float(umbral.peligro_max),
                }
    return _con_base(
        tarjeta,
        {
            "variable": variable,
            "unidad": info["unidad"],
            "decimales": info["decimales"],
            "estadistico": opciones["estadistico"],
            "agrupar": opciones["agrupar"],
            "estilo": opciones["estilo"],
            "intervalo": consulta.intervalo,
            "series": series,
            "previo": previo,
            "umbrales": umbrales,
            "nota_umbrales": nota,
            "sin_datos": not series,
        },
    )


def medidor(tarjeta, consulta):
    """Medio aro de cumplimiento o disponibilidad con la marca de la meta."""
    opciones = tarjeta["opciones"]
    indicador = opciones["indicador"]
    variable = consulta.variable_efectiva(tarjeta)
    if indicador == "disponibilidad":
        actual = consultas.disponibilidad_resumen(consulta)["pct"]
        previo = consultas.disponibilidad_resumen(
            consulta, consulta.previo_inicio, consulta.previo_fin
        )["pct"]
        sentido = "mayor"
    else:
        datos = consultas.cumplimiento_total(consulta, variable)
        actual = datos["dentro_pct"] if datos else None
        previos = consultas.cumplimiento_total(
            consulta, variable, consulta.previo_inicio, consulta.previo_fin
        )
        previo = previos["dentro_pct"] if previos else None
        sentido = "mayor"
    meta, meta_estado = _meta(tarjeta, actual, "%", 1)
    return _con_base(
        tarjeta,
        {
            "indicador": indicador,
            "variable": variable if indicador == "cumplimiento" else None,
            "valor": _r(actual, 1),
            "unidad": "%",
            "decimales": 1,
            "min": 0,
            "max": 100,
            "previo": _r(previo, 1),
            "variacion": _variacion(actual, previo, sentido, "%"),
            "meta": meta,
            "meta_estado": meta_estado,
            "sin_datos": actual is None,
        },
    )


def _variable_metrica(tarjeta, consulta):
    metrica = tarjeta["opciones"]["metrica"]
    if tarjeta["opciones"].get("por") == "variable":
        return None
    if metrica in ("disponibilidad", "tiempo_atencion", "alertas"):
        return None
    return consulta.variable_efectiva(tarjeta)


def _ordenar_valores(valores, orden):
    if orden == "nombre":
        return sorted(valores, key=lambda fila: fila["etiqueta"].lower())
    descendente = orden == "desc"
    return sorted(
        valores,
        key=lambda fila: (
            fila["valor"] is None,
            -fila["valor"] if descendente and fila["valor"] is not None else fila["valor"],
        ),
    )


def _meta_linea(tarjeta, unidad, decimales):
    meta = tarjeta.get("meta")
    if not meta:
        return None
    return {
        "valor": meta["valor"],
        "sentido": meta["sentido"],
        "tolerancia": meta["tolerancia"],
        "texto": _texto_meta(meta, unidad, decimales),
    }


def barras(tarjeta, consulta):
    """Barras por categoría con línea de meta."""
    opciones = tarjeta["opciones"]
    metrica = opciones["metrica"]
    por = opciones["por"]
    variable = _variable_metrica(tarjeta, consulta)
    if variable is None and por == "variable":
        unidad, decimales = "", 1
    else:
        unidad, decimales = _unidad_metrica(consulta, metrica, variable)
    valores = consultas.valores_por_entidad(
        consulta, metrica, variable, por
    )
    for fila in valores:
        fila["valor"] = _r(fila["valor"], decimales)
        if por == "variable":
            info = consulta.info_variable(fila["dimension_valor"])
            fila["unidad"] = info["unidad"]
            fila["decimales"] = info["decimales"]
    valores = _ordenar_valores(valores, opciones["orden"])[: opciones["limite"]]
    return _con_base(
        tarjeta,
        {
            "metrica": metrica,
            "por": por,
            "variable": variable,
            "orientacion": opciones["orientacion"],
            "unidad": unidad,
            "decimales": decimales,
            "barras": valores,
            "meta": _meta_linea(tarjeta, unidad, decimales),
            "sin_datos": not valores,
        },
    )


def ranking(tarjeta, consulta):
    """Top o bottom de dispositivos o áreas con barra fina y variación."""
    opciones = tarjeta["opciones"]
    metrica = opciones["metrica"]
    por = opciones["por"]
    variable = _variable_metrica(tarjeta, consulta)
    unidad, decimales = _unidad_metrica(consulta, metrica, variable)
    actuales = consultas.valores_por_entidad(consulta, metrica, variable, por)
    previos = consultas.valores_por_entidad(
        consulta,
        metrica,
        variable,
        por,
        inicio=consulta.previo_inicio,
        fin=consulta.previo_fin,
    )
    previos_por_clave = {
        (fila["dimension"], fila["dimension_valor"]): fila["valor"] for fila in previos
    }
    mayor_mejor = metrica not in ("tiempo_atencion", "alertas")
    descendente = (opciones["sentido"] == "mejores") == mayor_mejor
    filas = []
    for fila in actuales:
        previo = previos_por_clave.get(
            (fila["dimension"], fila["dimension_valor"])
        )
        filas.append(
            {
                **fila,
                "valor": _r(fila["valor"], decimales),
                "previo": _r(previo, decimales),
                "variacion": _variacion(
                    fila["valor"],
                    previo,
                    "mayor" if mayor_mejor else "menor",
                    unidad,
                ),
            }
        )
    filas.sort(
        key=lambda fila: (
            fila["valor"] is None,
            -fila["valor"] if descendente and fila["valor"] is not None else fila["valor"],
        )
    )
    filas = filas[: opciones["n"]]
    maximo = max((fila["valor"] for fila in filas if fila["valor"] is not None), default=None)
    return _con_base(
        tarjeta,
        {
            "metrica": metrica,
            "por": por,
            "variable": variable,
            "sentido": opciones["sentido"],
            "unidad": unidad,
            "decimales": decimales,
            "filas": filas,
            "maximo": maximo,
            "sin_datos": not filas,
        },
    )


def barras_apiladas(tarjeta, consulta):
    """Composición por categoría, en cantidades o porcentajes."""
    opciones = tarjeta["opciones"]
    por = opciones["por"]
    serie = opciones["serie"]
    if serie in ("alertas_estado", "alertas_nivel"):
        filas = consultas.alertas_apiladas(consulta, serie, por)
        etiquetas = ETIQUETAS_ESTADO if serie == "alertas_estado" else ETIQUETAS_NIVEL
        campo_serie = "estado" if serie == "alertas_estado" else "nivel"
        series = [
            {
                "clave": clave,
                "nombre": etiqueta,
                "dimension": campo_serie if por in ("dia", "semana") else None,
                "dimension_valor": clave if por in ("dia", "semana") else None,
            }
            for clave, etiqueta in etiquetas.items()
        ]
        categorias = []
        for fila in filas:
            if fila["grupo"] not in [categoria["clave"] for categoria in categorias]:
                categorias.append({"clave": fila["grupo"]})
    else:
        filas = consultas.conteo_rangos(consulta, None, por)
        filas = [
            {"grupo": fila["grupo"], "serie": fila["nivel"], "total": fila["total"]}
            for fila in filas
        ]
        series = [
            {"clave": clave, "nombre": etiqueta, "dimension": None, "dimension_valor": None}
            for clave, etiqueta in ETIQUETAS_RANGO.items()
        ]
        categorias = []
        for fila in filas:
            if fila["grupo"] not in [categoria["clave"] for categoria in categorias]:
                categorias.append({"clave": fila["grupo"]})

    if por in ("area", "dispositivo"):
        agrupar = por
        for categoria in categorias:
            entidad = consultas._entidad(consulta, agrupar, categoria["clave"])
            categoria.update(entidad)
    else:
        for categoria in categorias:
            fecha = categoria["clave"]
            etiqueta = fecha.isoformat() if hasattr(fecha, "isoformat") else str(fecha)
            categoria.update(
                {
                    "etiqueta": etiqueta,
                    "dimension": None,
                    "dimension_valor": None,
                }
            )
    categorias.sort(key=lambda categoria: str(categoria["clave"]))
    indices = {categoria["clave"]: indice for indice, categoria in enumerate(categorias)}
    valores = {fila["clave"]: [0] * len(categorias) for fila in series}
    for fila in filas:
        clave_serie = fila["serie"]
        if clave_serie in valores and fila["grupo"] in indices:
            valores[clave_serie][indices[fila["grupo"]]] = int(fila["total"])
    porcentaje = bool(opciones["porcentaje"])
    if porcentaje:
        for indice in range(len(categorias)):
            total = sum(valor[indice] for valor in valores.values())
            if total:
                for valor in valores.values():
                    valor[indice] = round(valor[indice] / total * 100, 1)
    for item in series:
        item["valores"] = valores[item["clave"]]
        del item["clave"]
    return _con_base(
        tarjeta,
        {
            "serie": serie,
            "por": por,
            "porcentaje": porcentaje,
            "unidad": "%" if porcentaje else "",
            "decimales": 1 if porcentaje else 0,
            "categorias": [
                {clave: valor for clave, valor in categoria.items() if clave != "clave"}
                for categoria in categorias
            ],
            "series": series,
            "sin_datos": not filas,
        },
    )


def matriz(tarjeta, consulta):
    """Filas por variable con celdas coloreadas."""
    opciones = tarjeta["opciones"]
    datos = consultas.matriz(consulta, opciones["filas"], opciones["valor"])
    valores = [
        celda["valor"]
        for fila in datos["filas"]
        for celda in fila["celdas"]
        if celda["valor"] is not None
    ]
    for fila in datos["filas"]:
        for celda in fila["celdas"]:
            info = consulta.info_variable(celda["variable"])
            if datos["semaforo"]:
                decimales = 1
            elif opciones["valor"] == "alertas":
                decimales = 0
            else:
                decimales = info["decimales"]
            celda["valor"] = _r(celda["valor"], decimales)
            if datos["semaforo"] and celda["valor"] is not None:
                if celda["valor"] >= 95:
                    celda["nivel"] = "cumple"
                elif celda["valor"] >= 90:
                    celda["nivel"] = "cerca"
                else:
                    celda["nivel"] = "lejos"
    return _con_base(
        tarjeta,
        {
            "filas": datos["filas"],
            "columnas": datos["columnas"],
            "semaforo": datos["semaforo"],
            "escala": {
                "min": _r(min(valores), 2) if valores else None,
                "max": _r(max(valores), 2) if valores else None,
            },
            "sin_datos": not valores,
        },
    )


def mapa_calor(tarjeta, consulta):
    """Hora del día por día de la semana, en la zona del servidor."""
    opciones = tarjeta["opciones"]
    if opciones.get("alertas"):
        datos = consultas.mapa_calor_alertas(consulta)
        unidad, decimales = "", 0
        sin_datos = not any(valor for fila in datos["valores"] for valor in fila)
    else:
        variable = consulta.variable_efectiva(tarjeta)
        info = consulta.info_variable(variable)
        datos = consultas.mapa_calor(
            consulta, variable, opciones["estadistico"]
        )
        unidad, decimales = info["unidad"], info["decimales"]
        sin_datos = all(valor is None for fila in datos["valores"] for valor in fila)
    valores = [
        [_r(valor, decimales) for valor in fila] for fila in datos["valores"]
    ]
    return _con_base(
        tarjeta,
        {
            "variable": None if opciones.get("alertas") else variable,
            "alertas": bool(opciones.get("alertas")),
            "dias": consultas.DIAS,
            "horas": consultas.HORAS,
            "valores": valores,
            "min": _r(datos["min"], decimales),
            "max": _r(datos["max"], decimales),
            "unidad": unidad,
            "decimales": decimales,
            "sin_datos": sin_datos,
        },
    )


def dispersion(tarjeta, consulta):
    """Dos variables, un punto por hora y dispositivo."""
    opciones = tarjeta["opciones"]
    x, y = opciones["x"], opciones["y"]
    info_x, info_y = consulta.info_variable(x), consulta.info_variable(y)
    datos = consultas.dispersion(consulta, x, y)
    for punto in datos["puntos"]:
        punto["x"] = _r(punto["x"], info_x["decimales"])
        punto["y"] = _r(punto["y"], info_y["decimales"])
    return _con_base(
        tarjeta,
        {
            "x": x,
            "y": y,
            "info_x": info_x,
            "info_y": info_y,
            "puntos": datos["puntos"],
            "max_puntos": 2000,
            "truncado": datos["truncado"],
            "sin_datos": not datos["puntos"],
        },
    )


def histograma(tarjeta, consulta):
    """Distribución de una variable en 10–30 cubetas automáticas."""
    variable = consulta.variable_efectiva(tarjeta)
    info = consulta.info_variable(variable)
    datos = consultas.histograma(consulta, variable)
    umbrales = None
    nota = None
    if len(consulta.dispositivo_ids) == 1:
        fila = consulta.umbrales(variable, consulta.dispositivo_ids[0])
        if fila:
            umbral = fila[0]
            umbrales = {
                "advertencia_min": float(umbral.advertencia_min),
                "advertencia_max": float(umbral.advertencia_max),
                "peligro_min": float(umbral.peligro_min),
                "peligro_max": float(umbral.peligro_max),
            }
        else:
            nota = "El dispositivo no tiene umbrales para esta variable."
    else:
        nota = "Los umbrales se muestran al filtrar un dispositivo."
    return _con_base(
        tarjeta,
        {
            "variable": variable,
            "unidad": info["unidad"],
            "decimales": info["decimales"],
            "cubetas": datos["cubetas"],
            "total": datos["total"],
            "umbrales": umbrales,
            "nota_umbrales": nota,
            "sin_datos": not datos["total"],
        },
    )


def alertas_dona(tarjeta, consulta):
    """Dona con el total de alertas al centro."""
    por = tarjeta["opciones"]["por"]
    conteo = consultas.alertas_conteo(consulta, por)
    total = sum(conteo.values())
    if por == "estado":
        orden = ["PENDIENTE", "ATENDIDA", "DESCARTADA"]
        etiquetas, dimension = ETIQUETAS_ESTADO, "estado"
    elif por == "nivel":
        orden = ["ADVERTENCIA", "PELIGRO"]
        etiquetas, dimension = ETIQUETAS_NIVEL, "nivel"
    elif por == "variable":
        orden, etiquetas, dimension = consultas.VARIABLES, None, "variable"
    else:
        orden = ["POR_ENCIMA", "POR_DEBAJO"]
        etiquetas, dimension = ETIQUETAS_TIPO, None
    sectores = []
    for clave in orden:
        valor = conteo.get(clave, 0)
        if not valor:
            continue
        if por == "variable":
            etiqueta = consulta.info_variable(clave)["nombre"]
        else:
            etiqueta = etiquetas.get(clave, clave)
        sectores.append(
            {
                "etiqueta": etiqueta,
                "valor": valor,
                "porcentaje": round(valor / total * 100, 1) if total else 0,
                "dimension": dimension,
                "dimension_valor": clave if dimension else None,
            }
        )
    return _con_base(
        tarjeta,
        {
            "por": por,
            "total": total,
            "sectores": sectores,
            "unidad": "",
            "decimales": 0,
            "sin_datos": not total,
        },
    )


def tiempo_atencion(tarjeta, consulta):
    """Minutos promedio hasta atender o descartar, con grupos."""
    por = tarjeta["opciones"]["por"]
    datos = consultas.gestion_atencion(consulta)
    previos = consultas.gestion_atencion(
        consulta, consulta.previo_inicio, consulta.previo_fin
    )
    grupos = consultas.gestion_atencion_grupos(consulta, por)
    for grupo in grupos:
        grupo["valor"] = _r(grupo["valor"], 0)
    meta, meta_estado = _meta(tarjeta, datos["tiempo_medio_min"], "min", 0)
    return _con_base(
        tarjeta,
        {
            "por": por,
            "promedio": _r(datos["tiempo_medio_min"], 0),
            "total": datos["total"],
            "atendidas": datos["atendidas"],
            "grupos": grupos,
            "unidad": "min",
            "decimales": 0,
            "previo": _r(previos["tiempo_medio_min"], 0),
            "variacion": _variacion(
                datos["tiempo_medio_min"], previos["tiempo_medio_min"], "menor", "min"
            ),
            "meta": meta,
            "meta_estado": meta_estado,
            "sin_datos": not datos["total"],
        },
    )


def disponibilidad(tarjeta, consulta):
    """Disponibilidad por dispositivo y franja de huecos."""
    opciones = tarjeta["opciones"]
    resumen = consultas.disponibilidad_resumen(consulta)
    previo = consultas.disponibilidad_resumen(
        consulta, consulta.previo_inicio, consulta.previo_fin
    )["pct"]
    filas = consultas.disponibilidad_por_entidad(consulta, "dispositivo")
    filas.sort(
        key=lambda fila: (
            fila["valor"] is None,
            -fila["valor"] if opciones["orden"] == "desc" and fila["valor"] is not None
            else fila["valor"] if opciones["orden"] != "nombre" and fila["valor"] is not None
            else fila["etiqueta"].lower(),
        )
    )
    filas = filas[: opciones["limite"]]
    for fila in filas:
        fila["valor"] = _r(fila["valor"], 1)
    meta, meta_estado = _meta(tarjeta, resumen["pct"], "%", 1)
    return _con_base(
        tarjeta,
        {
            "promedio": _r(resumen["pct"], 1),
            "filas": filas,
            "limite": opciones["limite"],
            "orden": opciones["orden"],
            "unidad": "%",
            "decimales": 1,
            "previo": _r(previo, 1),
            "variacion": _variacion(resumen["pct"], previo, "mayor", "%"),
            "meta": meta,
            "meta_estado": meta_estado,
            "sin_datos": resumen["pct"] is None or not filas,
        },
    )


def texto(tarjeta, consulta):
    """Título de sección y nota, sin datos."""
    return _con_base(
        tarjeta,
        {
            "nota": tarjeta["opciones"].get("nota", ""),
            "sin_datos": False,
        },
    )


def hallazgos(tarjeta, consulta):
    """La tarjeta se genera bajo demanda con ``analitica/hallazgos/``."""
    return _con_base(
        tarjeta,
        {
            "bajo_demanda": True,
            "sin_datos": False,
        },
    )


CALCULADORAS = {
    "kpi": kpi,
    "tendencia": tendencia,
    "medidor": medidor,
    "barras": barras,
    "barras_apiladas": barras_apiladas,
    "ranking": ranking,
    "matriz": matriz,
    "mapa_calor": mapa_calor,
    "dispersion": dispersion,
    "histograma": histograma,
    "alertas_dona": alertas_dona,
    "tiempo_atencion": tiempo_atencion,
    "disponibilidad": disponibilidad,
    "texto": texto,
    "hallazgos": hallazgos,
}


def calcular(tarjeta, consulta):
    """Calcula una tarjeta aplicando el filtro cruzado (salvo a su origen)."""
    base = consulta.para_tarjeta(tarjeta)
    return CALCULADORAS[tarjeta["tipo"]](tarjeta, base)
