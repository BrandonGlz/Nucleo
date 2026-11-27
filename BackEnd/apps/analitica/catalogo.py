"""Catálogo y validación de la configuración de un tablero de analítica.

Debe coincidir con ``FrontEnd/src/features/analitica/catalogo.js``: los tipos de tarjeta,
sus opciones y sus valores se editan en los dos lados. La configuración que guarda cada
versión se valida y normaliza aquí antes de guardarse.
"""

import math

from django.core.exceptions import ValidationError

VERSION_ESQUEMA = 1
COLUMNAS = 12
FILAS = 6
PAGINAS_MAX = 8
TARJETAS_MAX = 12
TITULO_MAX = 60
NOMBRE_PAGINA_MAX = 30
NOTA_MAX = 200
ID_MAX = 32
TOLERANCIA_MAX = 50
TOLERANCIA_POR_OMISION = 5

PERIODOS = ("hoy", "24h", "7d", "30d", "mes", "mes_anterior", "90d", "personalizado")
PERIODO_POR_OMISION = "7d"
# La variable vacía es «Todas» en el filtro global.
VARIABLES = ("", "TEMP", "HUM", "AIRE")
VARIABLE_POR_OMISION = "TEMP"
VARIABLE_FIJA = "TEMP"

FAMILIAS = [
    {"id": "kpis", "nombre": "KPIs y tendencias"},
    {"id": "comparativos", "nombre": "Comparativos"},
    {"id": "patrones", "nombre": "Patrones"},
    {"id": "alertas", "nombre": "Alertas y operación"},
    {"id": "otras", "nombre": "Otras"},
]

OPCION_VARIABLE = {
    "clave": "variable",
    "tipo": "uno",
    "etiqueta": "Variable",
    "valores": ["filtro", "TEMP", "HUM", "AIRE"],
    "por_omision": "filtro",
}

METRICAS = [
    "promedio",
    "maximo",
    "minimo",
    "cumplimiento",
    "disponibilidad",
    "alertas",
    "lecturas",
    "tiempo_atencion",
]

# Metas sugeridas al agregar una tarjeta, por indicador o métrica.
METAS_SUGERIDAS = {
    "cumplimiento": {"valor": 95, "sentido": "mayor", "tolerancia": 5},
    "disponibilidad": {"valor": 98, "sentido": "mayor", "tolerancia": 5},
    "tiempo_atencion": {"valor": 30, "sentido": "menor", "tolerancia": 5},
    "alertas": {"valor": 10, "sentido": "menor", "tolerancia": 5},
}

# Catálogo de la versión 1: id, nombre, familia, descripción de una línea, tamaño mínimo,
# si admite meta y opciones con sus valores válidos y su valor por omisión.
TIPOS = {
    "kpi": {
        "nombre": "KPI",
        "familia": "kpis",
        "descripcion": "Un valor grande con variación, tendencia y semáforo.",
        "minimo": [2, 1],
        "meta": True,
        "opciones": [
            {
                "clave": "indicador",
                "tipo": "uno",
                "etiqueta": "Indicador",
                "valores": [
                    "lecturas",
                    "promedio",
                    "minimo",
                    "maximo",
                    "cumplimiento",
                    "disponibilidad",
                    "alertas",
                    "alertas_pendientes",
                    "tiempo_atencion",
                    "dispositivos_en_linea",
                ],
                "por_omision": "cumplimiento",
            },
            OPCION_VARIABLE,
            {
                "clave": "nivel",
                "tipo": "uno",
                "etiqueta": "Nivel de alerta",
                "valores": ["", "ADVERTENCIA", "PELIGRO"],
                "por_omision": "",
            },
            {
                "clave": "comparar",
                "tipo": "booleano",
                "etiqueta": "Comparar con el periodo anterior",
                "por_omision": True,
            },
            {
                "clave": "sparkline",
                "tipo": "booleano",
                "etiqueta": "Mostrar tendencia",
                "por_omision": True,
            },
        ],
    },
    "tendencia": {
        "nombre": "Tendencia",
        "familia": "kpis",
        "descripcion": "Serie de tiempo con comparación y bandas de umbral.",
        "minimo": [4, 2],
        "meta": False,
        "opciones": [
            OPCION_VARIABLE,
            {
                "clave": "estadistico",
                "tipo": "uno",
                "etiqueta": "Estadístico",
                "valores": ["promedio", "maximo", "minimo"],
                "por_omision": "promedio",
            },
            {
                "clave": "agrupar",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["total", "area", "dispositivo"],
                "por_omision": "total",
            },
            {
                "clave": "estilo",
                "tipo": "uno",
                "etiqueta": "Estilo",
                "valores": ["linea", "area"],
                "por_omision": "linea",
            },
            {
                "clave": "comparar",
                "tipo": "booleano",
                "etiqueta": "Comparar con el periodo anterior",
                "por_omision": True,
            },
            {
                "clave": "umbrales",
                "tipo": "booleano",
                "etiqueta": "Bandas de umbral",
                "por_omision": True,
            },
        ],
    },
    "medidor": {
        "nombre": "Medidor",
        "familia": "kpis",
        "descripcion": "Medio aro con el valor y la marca de la meta.",
        "minimo": [2, 2],
        "meta": True,
        "opciones": [
            {
                "clave": "indicador",
                "tipo": "uno",
                "etiqueta": "Indicador",
                "valores": ["cumplimiento", "disponibilidad"],
                "por_omision": "cumplimiento",
            },
            OPCION_VARIABLE,
        ],
    },
    "barras": {
        "nombre": "Barras",
        "familia": "comparativos",
        "descripcion": "Compara categorías con una línea de meta.",
        "minimo": [3, 2],
        "meta": True,
        "opciones": [
            {
                "clave": "metrica",
                "tipo": "uno",
                "etiqueta": "Métrica",
                "valores": METRICAS,
                "por_omision": "cumplimiento",
            },
            OPCION_VARIABLE,
            {
                "clave": "por",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["area", "dispositivo", "variable"],
                "por_omision": "area",
            },
            {
                "clave": "orientacion",
                "tipo": "uno",
                "etiqueta": "Orientación",
                "valores": ["vertical", "horizontal"],
                "por_omision": "vertical",
            },
            {
                "clave": "orden",
                "tipo": "uno",
                "etiqueta": "Orden",
                "valores": ["desc", "asc", "nombre"],
                "por_omision": "desc",
            },
            {
                "clave": "limite",
                "tipo": "numero",
                "etiqueta": "Límite",
                "minimo": 5,
                "maximo": 20,
                "por_omision": 10,
            },
        ],
    },
    "barras_apiladas": {
        "nombre": "Barras apiladas",
        "familia": "comparativos",
        "descripcion": "Composición por categoría, en cantidades o 100 %.",
        "minimo": [4, 2],
        "meta": False,
        "opciones": [
            {
                "clave": "serie",
                "tipo": "uno",
                "etiqueta": "Serie",
                "valores": ["alertas_estado", "alertas_nivel", "lecturas_rango"],
                "por_omision": "alertas_estado",
            },
            {
                "clave": "por",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["area", "dispositivo", "dia", "semana"],
                "por_omision": "dia",
            },
            {
                "clave": "porcentaje",
                "tipo": "booleano",
                "etiqueta": "Mostrar porcentaje",
                "por_omision": False,
            },
        ],
    },
    "ranking": {
        "nombre": "Ranking",
        "familia": "comparativos",
        "descripcion": "Los mejores o peores, con barra fina y variación.",
        "minimo": [3, 2],
        "meta": False,
        "opciones": [
            {
                "clave": "metrica",
                "tipo": "uno",
                "etiqueta": "Métrica",
                "valores": METRICAS,
                "por_omision": "cumplimiento",
            },
            OPCION_VARIABLE,
            {
                "clave": "por",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["dispositivo", "area"],
                "por_omision": "dispositivo",
            },
            {
                "clave": "sentido",
                "tipo": "uno",
                "etiqueta": "Sentido",
                "valores": ["mejores", "peores"],
                "por_omision": "peores",
            },
            {
                "clave": "n",
                "tipo": "uno",
                "etiqueta": "Cantidad",
                "valores": [5, 10],
                "por_omision": 5,
            },
        ],
    },
    "matriz": {
        "nombre": "Matriz",
        "familia": "comparativos",
        "descripcion": "Filas por variable, con celdas coloreadas.",
        "minimo": [4, 2],
        "meta": False,
        "opciones": [
            {
                "clave": "filas",
                "tipo": "uno",
                "etiqueta": "Filas",
                "valores": ["area", "dispositivo"],
                "por_omision": "area",
            },
            {
                "clave": "valor",
                "tipo": "uno",
                "etiqueta": "Valor",
                "valores": ["promedio", "cumplimiento", "alertas"],
                "por_omision": "promedio",
            },
        ],
    },
    "mapa_calor": {
        "nombre": "Mapa de calor",
        "familia": "patrones",
        "descripcion": "Hora del día por día de la semana.",
        "minimo": [4, 2],
        "meta": False,
        "opciones": [
            OPCION_VARIABLE,
            {
                "clave": "estadistico",
                "tipo": "uno",
                "etiqueta": "Estadístico",
                "valores": ["promedio", "maximo", "minimo"],
                "por_omision": "promedio",
            },
            {
                "clave": "alertas",
                "tipo": "booleano",
                "etiqueta": "Contar alertas en vez de lecturas",
                "por_omision": False,
            },
        ],
    },
    "dispersion": {
        "nombre": "Dispersión",
        "familia": "patrones",
        "descripcion": "Dos variables, un punto por hora y dispositivo.",
        "minimo": [4, 3],
        "meta": False,
        "opciones": [
            {
                "clave": "x",
                "tipo": "uno",
                "etiqueta": "Variable X",
                "valores": ["TEMP", "HUM", "AIRE"],
                "por_omision": "TEMP",
            },
            {
                "clave": "y",
                "tipo": "uno",
                "etiqueta": "Variable Y",
                "valores": ["TEMP", "HUM", "AIRE"],
                "por_omision": "HUM",
            },
        ],
    },
    "histograma": {
        "nombre": "Histograma",
        "familia": "patrones",
        "descripcion": "Distribución de una variable en cubetas.",
        "minimo": [3, 2],
        "meta": False,
        "opciones": [OPCION_VARIABLE],
    },
    "alertas_dona": {
        "nombre": "Dona de alertas",
        "familia": "alertas",
        "descripcion": "Dona con el total de alertas al centro.",
        "minimo": [2, 2],
        "meta": False,
        "opciones": [
            {
                "clave": "por",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["estado", "nivel", "variable", "tipo"],
                "por_omision": "estado",
            },
        ],
    },
    "tiempo_atencion": {
        "nombre": "Tiempo de atención",
        "familia": "alertas",
        "descripcion": "Minutos promedio hasta atender o descartar.",
        "minimo": [3, 2],
        "meta": True,
        "opciones": [
            {
                "clave": "por",
                "tipo": "uno",
                "etiqueta": "Agrupar por",
                "valores": ["area", "dispositivo", "responsable"],
                "por_omision": "area",
            },
        ],
    },
    "disponibilidad": {
        "nombre": "Disponibilidad",
        "familia": "alertas",
        "descripcion": "Tiempo con datos por dispositivo y sus huecos.",
        "minimo": [4, 2],
        "meta": True,
        "opciones": [
            {
                "clave": "limite",
                "tipo": "numero",
                "etiqueta": "Límite",
                "minimo": 5,
                "maximo": 20,
                "por_omision": 10,
            },
            {
                "clave": "orden",
                "tipo": "uno",
                "etiqueta": "Orden",
                "valores": ["desc", "asc", "nombre"],
                "por_omision": "asc",
            },
        ],
    },
    "texto": {
        "nombre": "Texto",
        "familia": "otras",
        "descripcion": "Un título de sección y una nota.",
        "minimo": [2, 1],
        "meta": False,
        "opciones": [
            {
                "clave": "nota",
                "tipo": "texto",
                "etiqueta": "Nota",
                "max": NOTA_MAX,
                "por_omision": "",
            },
        ],
    },
    "hallazgos": {
        "nombre": "Hallazgos de Nico AI",
        "familia": "otras",
        "descripcion": "Hallazgos redactados por Nico AI sobre la página.",
        "minimo": [3, 2],
        "meta": False,
        "opciones": [],
    },
}


def conf_vacia():
    """Configuración inicial de un tablero recién creado, con una página vacía."""
    return {
        "esquema": VERSION_ESQUEMA,
        "filtros": {"periodo": PERIODO_POR_OMISION, "variable": VARIABLE_POR_OMISION},
        "paginas": [{"id": "p1", "nombre": "Página 1", "tarjetas": []}],
    }


def meta_sugerida(tipo, opciones=None):
    """Meta que propone el editor al agregar una tarjeta, o ``None`` si no aplica."""
    if tipo not in TIPOS or not TIPOS[tipo]["meta"]:
        return None
    opciones = opciones if isinstance(opciones, dict) else {}
    if tipo in ("kpi", "medidor"):
        clave = opciones.get("indicador")
    elif tipo == "barras":
        clave = opciones.get("metrica")
    elif tipo == "tiempo_atencion":
        clave = "tiempo_atencion"
    elif tipo == "disponibilidad":
        clave = "disponibilidad"
    else:
        return None
    meta = METAS_SUGERIDAS.get(clave)
    return dict(meta) if meta else None


def _error(pagina, tarjeta, mensaje):
    partes = []
    if pagina is not None:
        partes.append(f'Página "{pagina}"')
    if tarjeta is not None:
        partes.append(f'tarjeta "{tarjeta}"')
    prefijo = ", ".join(partes)
    raise ValidationError(f"{prefijo}: {mensaje}" if prefijo else mensaje)


def _nombre_pagina(pagina, indice):
    if isinstance(pagina, dict):
        nombre = pagina.get("nombre")
        if isinstance(nombre, str) and nombre.strip():
            return nombre.strip()
    return f"Página {indice}"


def _etiqueta_tarjeta(tarjeta):
    if isinstance(tarjeta, dict):
        titulo = tarjeta.get("titulo")
        if isinstance(titulo, str) and titulo.strip():
            return titulo.strip()
        identificador = tarjeta.get("id")
        if isinstance(identificador, str) and identificador.strip():
            return identificador.strip()
    return "sin título"


def _es_entero(valor):
    return isinstance(valor, int) and not isinstance(valor, bool)


def _es_numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool)


def _filtros(valor):
    if valor is None:
        valor = {}
    if not isinstance(valor, dict):
        raise ValidationError("Los filtros del tablero deben ser un objeto.")
    desconocidas = set(valor) - {"periodo", "variable"}
    if desconocidas:
        clave = sorted(desconocidas)[0]
        raise ValidationError(f"El filtro «{clave}» no existe; solo se admiten periodo y variable.")
    periodo = valor.get("periodo", PERIODO_POR_OMISION)
    if periodo not in PERIODOS:
        raise ValidationError(f"El periodo «{periodo}» no es válido para el tablero.")
    variable = valor.get("variable", VARIABLE_POR_OMISION)
    if variable not in VARIABLES:
        raise ValidationError(f"La variable «{variable}» no es válida para el tablero.")
    return {"periodo": periodo, "variable": variable}


def _validar_id(valor, pagina, tarjeta, que):
    if not isinstance(valor, str) or not valor.strip() or len(valor.strip()) > ID_MAX:
        _error(pagina, tarjeta, f"el identificador de {que} no es válido.")
    return valor.strip()


def _opcion(definicion, valor, pagina, tarjeta):
    clave = definicion["clave"]
    tipo = definicion["tipo"]
    if tipo == "uno":
        if valor not in definicion["valores"]:
            validos = ", ".join(str(v) for v in definicion["valores"] if v != "")
            _error(
                pagina,
                tarjeta,
                f"«{clave}» no admite el valor «{valor}»; debe ser uno de: {validos}.",
            )
        return valor
    if tipo == "varios":
        if not isinstance(valor, list):
            _error(pagina, tarjeta, f"«{clave}» debe ser una lista.")
        for elemento in valor:
            if elemento not in definicion["valores"]:
                _error(pagina, tarjeta, f"«{elemento}» no es un valor válido para «{clave}».")
        return list(dict.fromkeys(valor))
    if tipo == "booleano":
        if not isinstance(valor, bool):
            _error(pagina, tarjeta, f"«{clave}» debe ser verdadero o falso.")
        return valor
    if tipo == "numero":
        if not _es_entero(valor) or not definicion["minimo"] <= valor <= definicion["maximo"]:
            _error(
                pagina,
                tarjeta,
                f"«{clave}» debe ser un número entero entre "
                f"{definicion['minimo']} y {definicion['maximo']}.",
            )
        return valor
    if tipo == "texto":
        if not isinstance(valor, str):
            _error(pagina, tarjeta, f"«{clave}» debe ser texto.")
        texto = valor.strip()
        if len(texto) > definicion["max"]:
            _error(
                pagina,
                tarjeta,
                f"«{clave}» no puede pasar de {definicion['max']} caracteres.",
            )
        return texto
    raise RuntimeError(f"Tipo de opción desconocido en el catálogo: {tipo}")


def _opciones(tipo, valor, pagina, tarjeta):
    if valor is None:
        valor = {}
    if not isinstance(valor, dict):
        _error(pagina, tarjeta, "las opciones deben ser un objeto.")
    definiciones = TIPOS[tipo]["opciones"]
    por_clave = {definicion["clave"]: definicion for definicion in definiciones}
    desconocidas = set(valor) - set(por_clave)
    if desconocidas:
        clave = sorted(desconocidas)[0]
        _error(pagina, tarjeta, f"la opción «{clave}» no existe para este tipo de tarjeta.")
    normalizadas = {}
    for definicion in definiciones:
        clave = definicion["clave"]
        if clave in valor and valor[clave] is not None:
            normalizadas[clave] = _opcion(definicion, valor[clave], pagina, tarjeta)
        else:
            omision = definicion["por_omision"]
            normalizadas[clave] = list(omision) if isinstance(omision, list) else omision
    return normalizadas


def _meta(valor, tipo, pagina, tarjeta):
    if valor is None:
        return None
    if not isinstance(valor, dict):
        _error(pagina, tarjeta, "la meta debe ser un objeto.")
    if not valor:
        return None
    if not TIPOS[tipo]["meta"]:
        _error(pagina, tarjeta, "este tipo de tarjeta no admite meta.")
    numero = valor.get("valor")
    if not _es_numero(numero) or not math.isfinite(numero):
        _error(pagina, tarjeta, "la meta necesita un valor numérico.")
    sentido = valor.get("sentido")
    if sentido not in ("mayor", "menor"):
        _error(pagina, tarjeta, "el sentido de la meta debe ser «mayor» o «menor».")
    tolerancia = valor.get("tolerancia", TOLERANCIA_POR_OMISION)
    if (
        not _es_numero(tolerancia)
        or not math.isfinite(tolerancia)
        or not 0 <= tolerancia <= TOLERANCIA_MAX
    ):
        _error(
            pagina,
            tarjeta,
            f"la tolerancia de la meta debe estar entre 0 y {TOLERANCIA_MAX} %.",
        )
    return {"valor": numero, "sentido": sentido, "tolerancia": tolerancia}


def _tarjeta(tarjeta, indice, pagina, ids):
    etiqueta = _etiqueta_tarjeta(tarjeta)
    if not isinstance(tarjeta, dict):
        _error(pagina, etiqueta, "la tarjeta debe ser un objeto.")
    identificador = _validar_id(tarjeta.get("id"), pagina, etiqueta, "la tarjeta")
    if identificador in ids:
        _error(pagina, etiqueta, "el identificador de la tarjeta ya está usado.")
    ids.add(identificador)

    tipo = tarjeta.get("tipo")
    if not isinstance(tipo, str) or not tipo:
        _error(pagina, etiqueta, "falta el tipo de tarjeta.")
    if tipo not in TIPOS:
        _error(pagina, etiqueta, f"el tipo «{tipo}» no existe en el catálogo.")

    titulo = tarjeta.get("titulo", "")
    if titulo is None:
        titulo = ""
    if not isinstance(titulo, str):
        _error(pagina, etiqueta, "el título de la tarjeta debe ser texto.")
    titulo = titulo.strip()
    if len(titulo) > TITULO_MAX:
        _error(pagina, etiqueta, f"el título no puede pasar de {TITULO_MAX} caracteres.")
    if not titulo:
        titulo = TIPOS[tipo]["nombre"]

    coordenadas = {}
    for clave in ("x", "y", "w", "h"):
        valor = tarjeta.get(clave)
        if not _es_entero(valor):
            _error(pagina, titulo, f"«{clave}» debe ser un número entero.")
        coordenadas[clave] = valor
    x, y, w, h = (coordenadas[clave] for clave in ("x", "y", "w", "h"))
    if (
        x < 0
        or y < 0
        or w < 1
        or h < 1
        or x + w > COLUMNAS
        or y + h > FILAS
    ):
        _error(pagina, titulo, "se sale de la rejilla.")
    minimo_w, minimo_h = TIPOS[tipo]["minimo"]
    if w < minimo_w or h < minimo_h:
        _error(
            pagina,
            titulo,
            f"es más chica que el mínimo de {minimo_w} × {minimo_h}.",
        )

    opciones = _opciones(tipo, tarjeta.get("opciones"), pagina, titulo)
    meta = _meta(tarjeta.get("meta"), tipo, pagina, titulo)

    normalizada = {
        "id": identificador,
        "tipo": tipo,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "titulo": titulo,
        "opciones": opciones,
    }
    if meta is not None:
        normalizada["meta"] = meta
    return normalizada


def _pagina(pagina, indice, ids_paginas, ids_tarjetas):
    nombre = _nombre_pagina(pagina, indice)
    if not isinstance(pagina, dict):
        _error(nombre, None, "la página debe ser un objeto.")
    identificador = _validar_id(pagina.get("id"), nombre, None, "la página")
    if identificador in ids_paginas:
        _error(nombre, None, "el identificador de la página ya está usado.")
    ids_paginas.add(identificador)

    if not isinstance(pagina.get("nombre"), str) or not pagina["nombre"].strip():
        _error(nombre, None, "la página necesita un nombre.")
    nombre = pagina["nombre"].strip()
    if len(nombre) > NOMBRE_PAGINA_MAX:
        _error(nombre, None, f"el nombre no puede pasar de {NOMBRE_PAGINA_MAX} caracteres.")

    tarjetas_crudas = pagina.get("tarjetas")
    if tarjetas_crudas is None:
        tarjetas_crudas = []
    if not isinstance(tarjetas_crudas, list):
        _error(nombre, None, "las tarjetas de la página deben ser una lista.")
    if len(tarjetas_crudas) > TARJETAS_MAX:
        _error(nombre, None, f"no puede tener más de {TARJETAS_MAX} tarjetas.")

    tarjetas = []
    ocupadas = {}
    for posicion, tarjeta_cruda in enumerate(tarjetas_crudas, start=1):
        tarjeta = _tarjeta(tarjeta_cruda, posicion, nombre, ids_tarjetas)
        for columna in range(tarjeta["x"], tarjeta["x"] + tarjeta["w"]):
            for fila in range(tarjeta["y"], tarjeta["y"] + tarjeta["h"]):
                anterior = ocupadas.get((columna, fila))
                if anterior is not None:
                    _error(
                        nombre,
                        tarjeta["titulo"],
                        f'se encima con "{anterior}".',
                    )
                ocupadas[(columna, fila)] = tarjeta["titulo"]
        tarjetas.append(tarjeta)

    return {"id": identificador, "nombre": nombre, "tarjetas": tarjetas}


def validar_conf(conf):
    """Devuelve la configuración normalizada o lanza ``ValidationError``.

    Completa las opciones por omisión, recorta los textos, asigna el nombre del catálogo a
    las tarjetas sin título y valida rejilla, encimados, mínimos, límites e ids.
    """
    if not isinstance(conf, dict):
        raise ValidationError("La configuración del tablero no es válida.")
    esquema = conf.get("esquema", VERSION_ESQUEMA)
    if not _es_entero(esquema) or esquema != VERSION_ESQUEMA:
        raise ValidationError("La versión del esquema del tablero no es compatible.")
    filtros = _filtros(conf.get("filtros"))

    paginas_crudas = conf.get("paginas")
    if not isinstance(paginas_crudas, list) or not paginas_crudas:
        raise ValidationError("El tablero debe tener al menos una página.")
    if len(paginas_crudas) > PAGINAS_MAX:
        raise ValidationError(f"El tablero no puede tener más de {PAGINAS_MAX} páginas.")

    ids_paginas = set()
    ids_tarjetas = set()
    paginas = [
        _pagina(pagina, indice, ids_paginas, ids_tarjetas)
        for indice, pagina in enumerate(paginas_crudas, start=1)
    ]
    return {"esquema": VERSION_ESQUEMA, "filtros": filtros, "paginas": paginas}


def validar_tarjeta(tarjeta):
    """Valida y normaliza una tarjeta suelta, sin importar su posición en la rejilla.

    La usan ``analitica/consulta/`` y ``consulta/csv/`` para aceptar lo que el editor aún
    no guarda. La rejilla se valida al guardar el tablero, no en cada consulta.
    """
    etiqueta = _etiqueta_tarjeta(tarjeta)
    if not isinstance(tarjeta, dict):
        _error(None, etiqueta, "la tarjeta debe ser un objeto.")
    tipo = tarjeta.get("tipo")
    if not isinstance(tipo, str) or not tipo:
        _error(None, etiqueta, "falta el tipo de tarjeta.")
    if tipo not in TIPOS:
        _error(None, etiqueta, f"el tipo «{tipo}» no existe en el catálogo.")
    identificador = _validar_id(tarjeta.get("id"), None, etiqueta, "la tarjeta")

    titulo = tarjeta.get("titulo", "")
    if titulo is None:
        titulo = ""
    if not isinstance(titulo, str):
        _error(None, etiqueta, "el título de la tarjeta debe ser texto.")
    titulo = titulo.strip()
    if len(titulo) > TITULO_MAX:
        _error(None, etiqueta, f"el título no puede pasar de {TITULO_MAX} caracteres.")
    if not titulo:
        titulo = TIPOS[tipo]["nombre"]

    opciones = _opciones(tipo, tarjeta.get("opciones"), None, titulo)
    meta = _meta(tarjeta.get("meta"), tipo, None, titulo)
    normalizada = {
        "id": identificador,
        "tipo": tipo,
        "titulo": titulo,
        "opciones": opciones,
    }
    if meta is not None:
        normalizada["meta"] = meta
    return normalizada


def validar_tarjetas(tarjetas, maximo=TARJETAS_MAX):
    """Valida una lista de tarjetas sueltas y sus ids únicos."""
    if not isinstance(tarjetas, list):
        raise ValidationError("Las tarjetas deben ser una lista.")
    if len(tarjetas) > maximo:
        raise ValidationError(f"No se pueden consultar más de {maximo} tarjetas a la vez.")
    resultado = []
    ids = set()
    for tarjeta in tarjetas:
        normalizada = validar_tarjeta(tarjeta)
        if normalizada["id"] in ids:
            _error(None, normalizada["titulo"], "el identificador de la tarjeta ya está usado.")
        ids.add(normalizada["id"])
        resultado.append(normalizada)
    return resultado
