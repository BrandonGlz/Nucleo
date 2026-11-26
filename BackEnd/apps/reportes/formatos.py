"""Catálogo y validación de la configuración de un formato de reporte.

Debe coincidir con ``FrontEnd/src/features/reportes/personalizacion.js``: cuando la web
agrega una tarjeta, una fuente o una opción, se agrega también aquí. La configuración que
guarda cada versión se valida y normaliza antes de guardarse.
"""

from django.core.exceptions import ValidationError

from apps.reportes.models import FormatoReporte

VERSION_ESQUEMA = 1

# Tarjetas de siempre: id, nombre y ancho por omisión (columnas de 12).
WIDGETS = [
    {"id": "cifras", "nombre": "Cifras clave", "ancho": 12},
    {"id": "var:TEMP", "nombre": "Temperatura", "ancho": 4},
    {"id": "var:HUM", "nombre": "Humedad", "ancho": 4},
    {"id": "var:AIRE", "nombre": "Calidad del aire", "ancho": 4},
    {"id": "serie", "nombre": "Gráfica del periodo", "ancho": 6},
    {"id": "alertas", "nombre": "Alertas por variable", "ancho": 6},
    {"id": "analisis", "nombre": "Análisis", "ancho": 12},
]

# Opciones de cada tarjeta de siempre. «uno» elige una sola opción (el tipo de gráfica);
# «varios» marca la información que se muestra.
OPCIONES = {
    "cifras": [
        {
            "clave": "datos",
            "tipo": "varios",
            "etiqueta": "Cifras a mostrar",
            "valores": [
                ("lecturas", "Lecturas"),
                ("dispositivos", "Dispositivos"),
                ("alertas", "Alertas"),
                ("dias", "Días"),
            ],
        },
    ],
    "var": [
        {
            "clave": "grafica",
            "tipo": "uno",
            "etiqueta": "Tipo de gráfica",
            "valores": [
                ("rango", "Rango"),
                ("barras", "Barras"),
                ("cifra", "Solo cifra"),
            ],
        },
        {
            "clave": "datos",
            "tipo": "varios",
            "etiqueta": "Información",
            "valores": [
                ("minmax", "Mínimo y máximo"),
                ("alertas", "Alertas"),
            ],
        },
    ],
    "serie": [
        {
            "clave": "grafica",
            "tipo": "uno",
            "etiqueta": "Tipo de gráfica",
            "valores": [
                ("horizontal", "Barras"),
                ("columnas", "Columnas"),
                ("linea", "Línea"),
            ],
        },
        {
            "clave": "datos",
            "tipo": "varios",
            "etiqueta": "Información",
            "valores": [
                ("valores", "Valor de cada periodo"),
                ("maximo", "Resaltar el más alto"),
            ],
        },
    ],
    "alertas": [
        {
            "clave": "grafica",
            "tipo": "uno",
            "etiqueta": "Tipo de gráfica",
            "valores": [
                ("barras", "Barras"),
                ("dona", "Dona"),
                ("lista", "Lista"),
            ],
        },
        {
            "clave": "datos",
            "tipo": "varios",
            "etiqueta": "Información",
            "valores": [
                ("total", "Total del periodo"),
                ("porcentaje", "Porcentaje"),
            ],
        },
    ],
    "analisis": [
        {
            "clave": "datos",
            "tipo": "varios",
            "etiqueta": "Información",
            "valores": [
                ("texto", "Texto del análisis"),
                ("pie", "Nota de origen"),
            ],
        },
    ],
}

# Ancho de una tarjeta en columnas de 12; vale para todas.
ANCHO = {
    "clave": "ancho",
    "tipo": "uno",
    "etiqueta": "Ancho",
    "valores": [
        ("4", "Un tercio"),
        ("6", "Mitad"),
        ("8", "Dos tercios"),
        ("12", "Completa"),
    ],
}

CAMPOS = {
    "clave": "datos",
    "tipo": "varios",
    "etiqueta": "Información",
    "valores": [
        ("minimo", "Mínimo"),
        ("promedio", "Promedio"),
        ("maximo", "Máximo"),
        ("alertas", "Alertas"),
    ],
}


def _variable_fuente(nombre):
    return {
        "nombre": nombre,
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("barras", "Barras"),
                    ("columnas", "Columnas"),
                    ("tabla", "Tabla"),
                    ("cifra", "Cifras"),
                ],
            },
            CAMPOS,
        ],
    }


# Fuentes que puede usar una tarjeta personalizada, con sus gráficas e información posibles.
FUENTES = {
    "cifras": {"nombre": "Cifras clave", "opciones": OPCIONES["cifras"]},
    "var:TEMP": _variable_fuente("Temperatura"),
    "var:HUM": _variable_fuente("Humedad"),
    "var:AIRE": _variable_fuente("Calidad del aire"),
    "serie": {
        "nombre": "Evolución del periodo",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("linea", "Línea"),
                    ("columnas", "Columnas"),
                    ("barras", "Barras"),
                    ("tabla", "Tabla"),
                ],
            },
        ],
    },
    "alertas": {
        "nombre": "Alertas por variable",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("dona", "Dona"),
                    ("barras", "Barras"),
                    ("columnas", "Columnas"),
                    ("tabla", "Tabla"),
                ],
            },
        ],
    },
    "analisis": {"nombre": "Análisis", "opciones": OPCIONES["analisis"]},
    "resumen": {
        "nombre": "Resumen por variable",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [("tabla", "Tabla")],
            },
            CAMPOS,
        ],
    },
    "cumplimiento": {
        "nombre": "Cumplimiento",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("barras", "Barras"),
                    ("tabla", "Tabla"),
                    ("cifra", "Cifras"),
                ],
            },
            {
                "clave": "datos",
                "tipo": "varios",
                "etiqueta": "Información",
                "valores": [
                    ("pct", "Porcentaje"),
                    ("fuera", "Tiempo fuera"),
                ],
            },
        ],
    },
    "comparativo": {
        "nombre": "Comparativo",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("tabla", "Tabla"),
                    ("cifra", "Cifras"),
                ],
            },
            {
                "clave": "datos",
                "tipo": "varios",
                "etiqueta": "Información",
                "valores": [
                    ("promedio", "Promedio"),
                    ("extremos", "Mínimo y máximo"),
                    ("alertas", "Alertas"),
                ],
            },
        ],
    },
    "dispositivos": {
        "nombre": "Dispositivos",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [("tabla", "Tabla")],
            },
            {
                "clave": "datos",
                "tipo": "varios",
                "etiqueta": "Información",
                "valores": [
                    ("minimo", "Mínimo"),
                    ("promedio", "Promedio"),
                    ("maximo", "Máximo"),
                    ("area", "Área"),
                ],
            },
        ],
    },
    "gestion_alertas": {
        "nombre": "Gestión de alertas",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("dona", "Dona"),
                    ("barras", "Barras"),
                    ("tabla", "Tabla"),
                ],
            },
            {
                "clave": "datos",
                "tipo": "varios",
                "etiqueta": "Información",
                "valores": [
                    ("estados", "Estados"),
                    ("tiempo", "Tiempo medio"),
                    ("responsables", "Responsables"),
                ],
            },
        ],
    },
    "disponibilidad": {
        "nombre": "Disponibilidad",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("barras", "Barras"),
                    ("tabla", "Tabla"),
                ],
            },
            {
                "clave": "datos",
                "tipo": "varios",
                "etiqueta": "Información",
                "valores": [
                    ("pct", "Porcentaje"),
                    ("huecos", "Huecos"),
                ],
            },
        ],
    },
    "incidentes": {
        "nombre": "Incidentes",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("tabla", "Tabla"),
                    ("lista", "Lista"),
                ],
            },
        ],
    },
    "observaciones": {
        "nombre": "Observaciones",
        "opciones": [
            {
                "clave": "grafica",
                "tipo": "uno",
                "etiqueta": "Tipo de gráfica",
                "valores": [
                    ("lista", "Lista"),
                    ("tabla", "Tabla"),
                ],
            },
        ],
    },
}

# Tarjetas nuevas que pueden usar las plantillas y los formatos personalizados.
PERSONALIZADAS = [
    {"id": "cumplimiento", "fuente": "cumplimiento", "nombre": "Cumplimiento"},
    {"id": "comparativo", "fuente": "comparativo", "nombre": "Comparativo"},
    {"id": "dispositivos", "fuente": "dispositivos", "nombre": "Dispositivos"},
    {"id": "gestion_alertas", "fuente": "gestion_alertas", "nombre": "Gestión de alertas"},
    {"id": "disponibilidad", "fuente": "disponibilidad", "nombre": "Disponibilidad"},
    {"id": "incidentes", "fuente": "incidentes", "nombre": "Incidentes"},
    {"id": "observaciones", "fuente": "observaciones", "nombre": "Observaciones"},
]


def grupo(id_tarjeta):
    """Grupo de opciones de una tarjeta de siempre (las tres variables comparten uno)."""
    return "var" if id_tarjeta.startswith("var:") else id_tarjeta


def _personalizadas(lista):
    """Normaliza las tarjetas personalizadas y valida su fuente."""
    if lista is None:
        return []
    if not isinstance(lista, list):
        raise ValidationError("Las tarjetas personalizadas deben ser una lista.")
    base_ids = {w["id"] for w in WIDGETS}
    ids = set()
    resultado = []
    for item in lista:
        if not isinstance(item, dict):
            raise ValidationError("Cada tarjeta personalizada debe ser un objeto.")
        id_tarjeta = item.get("id")
        if not isinstance(id_tarjeta, str) or not id_tarjeta.strip():
            raise ValidationError("Cada tarjeta personalizada necesita un id.")
        id_tarjeta = id_tarjeta.strip()
        if id_tarjeta in ids or id_tarjeta in base_ids:
            raise ValidationError(f"El id de tarjeta «{id_tarjeta}» está repetido.")
        fuente = item.get("fuente")
        if fuente not in FUENTES:
            raise ValidationError(f"La fuente «{fuente}» no existe.")
        nombre = item.get("nombre") or FUENTES[fuente]["nombre"]
        if not isinstance(nombre, str):
            raise ValidationError("El nombre de una tarjeta personalizada debe ser texto.")
        ids.add(id_tarjeta)
        resultado.append({"id": id_tarjeta, "fuente": fuente, "nombre": nombre.strip()})
    return resultado


def _definiciones(tarjeta):
    """Opciones válidas de una tarjeta, incluido el ancho."""
    if "fuente" in tarjeta:
        opciones = FUENTES[tarjeta["fuente"]]["opciones"]
    else:
        opciones = OPCIONES.get(grupo(tarjeta["id"]), [])
    return [*opciones, ANCHO]


def _opciones_de(tarjeta, entrada):
    """Completa las opciones por omisión y valida las que vienen en la configuración."""
    if entrada is None:
        entrada = {}
    if not isinstance(entrada, dict):
        raise ValidationError(f"Las opciones de «{tarjeta['id']}» deben ser un objeto.")

    definiciones = _definiciones(tarjeta)
    por_clave = {d["clave"]: d for d in definiciones}
    # «alto» es común a todas las tarjetas y no se rellena por omisión.
    desconocidas = set(entrada) - set(por_clave) - {"alto"}
    if desconocidas:
        clave = sorted(desconocidas)[0]
        raise ValidationError(f"La opción «{clave}» no existe en «{tarjeta['id']}».")

    resultado = {}
    for definicion in definiciones:
        clave = definicion["clave"]
        if clave == "ancho":
            resultado[clave] = str(tarjeta.get("ancho", 6))
        elif definicion["tipo"] == "uno":
            resultado[clave] = definicion["valores"][0][0]
        else:
            resultado[clave] = [valor for valor, _ in definicion["valores"]]

    for clave, valor in entrada.items():
        if clave == "alto":
            continue
        definicion = por_clave[clave]
        validos = [v for v, _ in definicion["valores"]]
        if clave == "ancho":
            valor = str(valor)
            if valor not in validos:
                raise ValidationError(f"El ancho «{valor}» no es válido.")
            resultado[clave] = valor
        elif definicion["tipo"] == "uno":
            if valor not in validos:
                raise ValidationError(f"El valor «{valor}» no es válido para «{clave}».")
            resultado[clave] = valor
        else:
            if not isinstance(valor, list) or any(v not in validos for v in valor):
                raise ValidationError(f"Los valores de «{clave}» no son válidos.")
            resultado[clave] = list(dict.fromkeys(valor))

    alto = entrada.get("alto")
    if alto is not None:
        if isinstance(alto, bool) or not isinstance(alto, int) or not 80 <= alto <= 2000:
            raise ValidationError("El alto debe ser un entero entre 80 y 2000.")
        resultado["alto"] = alto
    return resultado


def validar_conf(conf):
    """Devuelve la configuración normalizada o lanza ``ValidationError``.

    Quita los ids desconocidos del orden y de los ocultos, completa las tarjetas que falten
    (como ``normalizar()`` en la web) y rellena las opciones por omisión.
    """
    if not isinstance(conf, dict):
        raise ValidationError("La configuración del formato no es válida.")
    version = conf.get("version_esquema", VERSION_ESQUEMA)
    if version != VERSION_ESQUEMA:
        raise ValidationError("La versión del esquema del formato no es compatible.")
    base = conf.get("base", True)
    if not isinstance(base, bool):
        raise ValidationError("«base» debe ser verdadero o falso.")

    personalizadas = _personalizadas(conf.get("personalizadas"))
    tarjetas = ([*WIDGETS] if base else []) + personalizadas
    por_id = {t["id"]: t for t in tarjetas}

    orden_crudo = conf.get("orden", [])
    if not isinstance(orden_crudo, list):
        raise ValidationError("El orden de las tarjetas debe ser una lista.")
    orden = []
    for id_tarjeta in orden_crudo:
        if isinstance(id_tarjeta, str) and id_tarjeta in por_id and id_tarjeta not in orden:
            orden.append(id_tarjeta)
    orden.extend(id_tarjeta for id_tarjeta in por_id if id_tarjeta not in orden)

    ocultos_crudo = conf.get("ocultos", [])
    if ocultos_crudo is None:
        ocultos_crudo = []
    if not isinstance(ocultos_crudo, list):
        raise ValidationError("Las tarjetas ocultas deben ser una lista.")
    ocultos = []
    for id_tarjeta in ocultos_crudo:
        if isinstance(id_tarjeta, str) and id_tarjeta in por_id and id_tarjeta not in ocultos:
            ocultos.append(id_tarjeta)

    opciones_crudo = conf.get("opciones") or {}
    if not isinstance(opciones_crudo, dict):
        raise ValidationError("Las opciones del formato deben ser un objeto.")
    opciones = {
        id_tarjeta: _opciones_de(por_id[id_tarjeta], opciones_crudo.get(id_tarjeta))
        for id_tarjeta in orden
    }

    hoja = conf.get("hoja") or {}
    if not isinstance(hoja, dict):
        raise ValidationError("La hoja del formato debe ser un objeto.")
    adjuntar_csv = hoja.get("adjuntar_csv", False)
    if not isinstance(adjuntar_csv, bool):
        raise ValidationError("«adjuntar_csv» debe ser verdadero o falso.")
    hoja = {**hoja, "adjuntar_csv": adjuntar_csv}

    return {
        "version_esquema": VERSION_ESQUEMA,
        "base": base,
        "orden": orden,
        "ocultos": ocultos,
        "opciones": opciones,
        "personalizadas": personalizadas,
        "hoja": hoja,
    }


def _conf(visibles, opciones=None, personalizadas=None):
    """Configuración de una plantilla: las visibles primero y el resto ocultas."""
    personalizadas = personalizadas or []
    ids = [w["id"] for w in WIDGETS] + [p["id"] for p in personalizadas]
    return {
        "version_esquema": VERSION_ESQUEMA,
        "base": True,
        "orden": [
            *visibles,
            *(id_tarjeta for id_tarjeta in ids if id_tarjeta not in visibles),
        ],
        "ocultos": [id_tarjeta for id_tarjeta in ids if id_tarjeta not in visibles],
        "opciones": opciones or {},
        "personalizadas": personalizadas,
        "hoja": {},
    }


# Operativo detallado = la configuración BASE de la web: las 7 tarjetas de siempre.
CONF_OPERATIVO = _conf([w["id"] for w in WIDGETS])
CONF_OPERATIVO_AMPLIADO = _conf(
    [w["id"] for w in WIDGETS] + ["dispositivos", "gestion_alertas", "disponibilidad"],
    {},
    PERSONALIZADAS,
)
# Las demás plantillas usan las tarjetas nuevas declaradas arriba.
CONF_EJECUTIVO = _conf(
    ["cifras", "cumplimiento", "comparativo", "serie", "analisis"],
    {
        "cumplimiento": {"grafica": "cifra"},
        "comparativo": {"grafica": "tabla"},
        "serie": {"grafica": "linea"},
    },
    PERSONALIZADAS,
)
CONF_CUMPLIMIENTO = _conf(
    [
        "cumplimiento",
        "incidentes",
        "gestion_alertas",
        "observaciones",
        "disponibilidad",
        "analisis",
    ],
    {
        "cumplimiento": {"grafica": "tabla"},
        "incidentes": {"grafica": "tabla", "ancho": "12"},
        "gestion_alertas": {"grafica": "dona"},
        "disponibilidad": {"grafica": "barras"},
    },
    PERSONALIZADAS,
)
CONF_INCIDENTES = _conf(
    ["incidentes", "alertas", "gestion_alertas", "observaciones"],
    {
        "incidentes": {"grafica": "tabla", "ancho": "12"},
        "alertas": {"grafica": "barras"},
        "gestion_alertas": {"grafica": "barras"},
    },
    PERSONALIZADAS,
)


def formato_para(organizacion, area, formato=None):
    """Formato que corresponde a un reporte, según los predeterminados.

    Orden: el elegido → el del área → el de la organización → la plantilla Operativo
    detallado.
    """
    if formato is not None:
        return formato
    if area is not None and area.formato_reporte_id and area.formato_reporte.activo:
        return area.formato_reporte
    predeterminado = FormatoReporte.objects.filter(
        organizacion=organizacion,
        predeterminado=True,
        activo=True,
    ).first()
    if predeterminado is not None:
        return predeterminado
    return FormatoReporte.objects.filter(
        plantilla=FormatoReporte.Plantilla.OPERATIVO,
    ).first()
