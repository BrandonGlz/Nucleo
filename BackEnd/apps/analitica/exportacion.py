"""CSV de una tarjeta de Analítica.

Las celdas pasan por ``common.exportar.respuesta_csv``, que neutraliza las fórmulas y
escribe el BOM para Excel. Cada tipo exporta sus datos ya calculados; la tarjeta de
hallazgos no tiene CSV propio (se genera bajo demanda).
"""


def _texto(valor):
    return "" if valor is None else valor


def _huecos(huecos):
    return "; ".join(
        f"{hueco.get('inicio', '')} ({hueco.get('minutos', '')} min)"
        for hueco in huecos or []
    )


def _csv_kpi(datos):
    variacion = datos.get("variacion") or {}
    meta = datos.get("meta") or {}
    encabezado = [
        "Métrica",
        "Valor",
        "Unidad",
        "Periodo anterior",
        "Variación",
        "Variación %",
        "Meta",
        "Estado de la meta",
    ]
    fila = [
        datos.get("titulo", ""),
        _texto(datos.get("valor")),
        datos.get("unidad", ""),
        _texto(datos.get("previo")),
        _texto(variacion.get("abs")),
        _texto(variacion.get("pct")),
        meta.get("texto", ""),
        _texto(meta.get("estado")),
    ]
    return encabezado, [fila]


def _csv_tendencia(datos):
    encabezado = ["Serie", "Fecha", "Valor"]
    filas = []
    for serie in datos.get("series") or []:
        for punto in serie.get("puntos") or []:
            filas.append([serie.get("nombre", ""), punto.get("x", ""), punto.get("y")])
    for punto in datos.get("previo") or []:
        filas.append(["Periodo anterior", punto.get("x", ""), punto.get("y")])
    return encabezado, filas


def _csv_categorias(datos, clave):
    encabezado = ["Categoría", "Valor", "Unidad", "Periodo anterior", "Variación %"]
    filas = []
    for fila in datos.get(clave) or []:
        variacion = fila.get("variacion") or {}
        filas.append(
            [
                fila.get("etiqueta", ""),
                _texto(fila.get("valor")),
                datos.get("unidad", ""),
                _texto(fila.get("previo")),
                _texto(variacion.get("pct")),
            ]
        )
    return encabezado, filas


def _csv_apiladas(datos):
    encabezado = ["Categoría", "Serie", "Valor"]
    filas = []
    series = datos.get("series") or []
    for indice, categoria in enumerate(datos.get("categorias") or []):
        for serie in series:
            valores = serie.get("valores") or []
            filas.append(
                [
                    categoria.get("etiqueta", ""),
                    serie.get("nombre", ""),
                    valores[indice] if indice < len(valores) else "",
                ]
            )
    return encabezado, filas


def _csv_matriz(datos):
    encabezado = ["Fila", "Variable", "Valor"]
    filas = []
    for fila in datos.get("filas") or []:
        for celda in fila.get("celdas") or []:
            filas.append([fila.get("etiqueta", ""), celda.get("variable", ""), celda.get("valor")])
    return encabezado, filas


def _csv_mapa(datos):
    encabezado = ["Día", "Hora", "Valor"]
    filas = []
    for indice, valores in enumerate(datos.get("valores") or []):
        dia = (datos.get("dias") or [])[indice] if indice < len(datos.get("dias") or []) else indice
        for hora, valor in enumerate(valores):
            filas.append([dia, hora, _texto(valor)])
    return encabezado, filas


def _csv_dispersion(datos):
    encabezado = ["Dispositivo", "Área", "Fecha", "X", "Y"]
    filas = [
        [
            punto.get("dispositivo", ""),
            punto.get("area", ""),
            punto.get("etiqueta", ""),
            punto.get("x"),
            punto.get("y"),
        ]
        for punto in datos.get("puntos") or []
    ]
    return encabezado, filas


def _csv_histograma(datos):
    encabezado = ["Desde", "Hasta", "Cantidad"]
    filas = [
        [cubeta.get("desde"), cubeta.get("hasta"), cubeta.get("valor")]
        for cubeta in datos.get("cubetas") or []
    ]
    return encabezado, filas


def _csv_dona(datos):
    encabezado = ["Categoría", "Valor", "Porcentaje"]
    filas = [
        [sector.get("etiqueta", ""), sector.get("valor"), sector.get("porcentaje")]
        for sector in datos.get("sectores") or []
    ]
    return encabezado, filas


def _csv_atencion(datos):
    encabezado = ["Grupo", "Promedio (min)", "Total", "Atendidas"]
    filas = [
        [
            grupo.get("etiqueta", ""),
            grupo.get("valor"),
            grupo.get("total"),
            grupo.get("atendidas"),
        ]
        for grupo in datos.get("grupos") or []
    ]
    return encabezado, filas


def _csv_disponibilidad(datos):
    encabezado = ["Dispositivo", "Disponibilidad (%)", "Recibidas", "Esperadas", "Huecos"]
    filas = [
        [
            fila.get("etiqueta", ""),
            fila.get("valor"),
            fila.get("recibidas"),
            fila.get("esperadas"),
            _huecos(fila.get("huecos")),
        ]
        for fila in datos.get("filas") or []
    ]
    return encabezado, filas


def _csv_texto(datos):
    return ["Nota"], [[datos.get("nota", "")]]


def csv_de_tarjeta(datos, tarjeta):
    """Encabezado y filas del CSV de una tarjeta ya calculada."""
    if "error" in datos:
        raise ValueError(datos["error"])
    tipo = tarjeta["tipo"]
    if tipo in ("kpi", "medidor"):
        return _csv_kpi(datos)
    if tipo == "tendencia":
        return _csv_tendencia(datos)
    if tipo in ("barras", "ranking"):
        return _csv_categorias(datos, "barras" if tipo == "barras" else "filas")
    if tipo == "barras_apiladas":
        return _csv_apiladas(datos)
    if tipo == "matriz":
        return _csv_matriz(datos)
    if tipo == "mapa_calor":
        return _csv_mapa(datos)
    if tipo == "dispersion":
        return _csv_dispersion(datos)
    if tipo == "histograma":
        return _csv_histograma(datos)
    if tipo == "alertas_dona":
        return _csv_dona(datos)
    if tipo == "tiempo_atencion":
        return _csv_atencion(datos)
    if tipo == "disponibilidad":
        return _csv_disponibilidad(datos)
    if tipo == "texto":
        return _csv_texto(datos)
    raise ValueError("La tarjeta de hallazgos se genera bajo demanda y no tiene CSV.")
