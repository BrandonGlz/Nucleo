"""Crea las cuatro plantillas de tableros de analítica y su versión 1."""

from django.db import migrations

META_CUMPLIMIENTO = {"valor": 95, "sentido": "mayor", "tolerancia": 5}
META_DISPONIBILIDAD = {"valor": 98, "sentido": "mayor", "tolerancia": 5}
META_TIEMPO = {"valor": 30, "sentido": "menor", "tolerancia": 5}
META_ALERTAS = {"valor": 10, "sentido": "menor", "tolerancia": 5}


def _tarjeta(id_tarjeta, tipo, x, y, w, h, titulo, opciones, meta=None):
    tarjeta = {
        "id": id_tarjeta,
        "tipo": tipo,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "titulo": titulo,
        "opciones": opciones,
    }
    if meta is not None:
        tarjeta["meta"] = meta
    return tarjeta


def _kpi(id_tarjeta, x, y, w, titulo, indicador, variable="filtro", meta=None):
    return _tarjeta(
        id_tarjeta,
        "kpi",
        x,
        y,
        w,
        1,
        titulo,
        {
            "indicador": indicador,
            "variable": variable,
            "nivel": "",
            "comparar": True,
            "sparkline": True,
        },
        meta,
    )


def _tendencia(id_tarjeta, x, y, w, h, titulo, variable, agrupar="total", umbrales=True):
    return _tarjeta(
        id_tarjeta,
        "tendencia",
        x,
        y,
        w,
        h,
        titulo,
        {
            "variable": variable,
            "estadistico": "promedio",
            "agrupar": agrupar,
            "estilo": "linea",
            "comparar": True,
            "umbrales": umbrales,
        },
    )


def _barras(id_tarjeta, x, y, w, h, titulo, metrica, variable, por, meta=None):
    return _tarjeta(
        id_tarjeta,
        "barras",
        x,
        y,
        w,
        h,
        titulo,
        {
            "metrica": metrica,
            "variable": variable,
            "por": por,
            "orientacion": "horizontal",
            "orden": "desc",
            "limite": 10,
        },
        meta,
    )


def _pagina(id_pagina, nombre, tarjetas):
    return {"id": id_pagina, "nombre": nombre, "tarjetas": tarjetas}


def _conf(periodo, paginas):
    return {
        "esquema": 1,
        "filtros": {"periodo": periodo, "variable": "TEMP"},
        "paginas": paginas,
    }


def _ejecutivo():
    resumen = _pagina(
        "p1",
        "Resumen",
        [
            _kpi("t1", 0, 0, 3, "Cumplimiento", "cumplimiento", meta=META_CUMPLIMIENTO),
            _kpi("t2", 3, 0, 2, "Disponibilidad", "disponibilidad", meta=META_DISPONIBILIDAD),
            _kpi("t3", 5, 0, 2, "Alertas", "alertas", meta=META_ALERTAS),
            _kpi("t4", 7, 0, 2, "Tiempo de atención", "tiempo_atencion", meta=META_TIEMPO),
            _kpi("t5", 9, 0, 3, "Dispositivos en línea", "dispositivos_en_linea"),
            _tendencia("t6", 0, 1, 8, 3, "Temperatura por área", "TEMP", agrupar="area"),
            _tarjeta(
                "t7",
                "alertas_dona",
                8,
                1,
                4,
                3,
                "Alertas por estado",
                {"por": "estado"},
            ),
            _barras(
                "t8",
                0,
                4,
                6,
                2,
                "Cumplimiento por área",
                "cumplimiento",
                "TEMP",
                "area",
                meta=META_CUMPLIMIENTO,
            ),
            _tarjeta(
                "t9",
                "ranking",
                6,
                4,
                6,
                2,
                "Dispositivos con menor cumplimiento",
                {
                    "metrica": "cumplimiento",
                    "variable": "TEMP",
                    "por": "dispositivo",
                    "sentido": "peores",
                    "n": 5,
                },
            ),
        ],
    )
    tendencias = _pagina(
        "p2",
        "Tendencias",
        [
            _tendencia("t10", 0, 0, 12, 2, "Temperatura", "TEMP"),
            _tendencia("t11", 0, 2, 12, 2, "Humedad", "HUM"),
            _tendencia("t12", 0, 4, 12, 2, "Calidad del aire", "AIRE"),
        ],
    )
    return _conf("30d", [resumen, tendencias])


def _pagina_variable(id_pagina, nombre, prefijo, variable):
    return _pagina(
        id_pagina,
        nombre,
        [
            _kpi(f"{prefijo}1", 0, 0, 3, "Promedio", "promedio", variable=variable),
            _kpi(f"{prefijo}2", 3, 0, 3, "Mínimo", "minimo", variable=variable),
            _kpi(f"{prefijo}3", 6, 0, 3, "Máximo", "maximo", variable=variable),
            _kpi(
                f"{prefijo}4",
                9,
                0,
                3,
                "Cumplimiento",
                "cumplimiento",
                variable=variable,
                meta=META_CUMPLIMIENTO,
            ),
            _tendencia(
                f"{prefijo}5",
                0,
                1,
                8,
                3,
                f"{nombre} en el periodo",
                variable,
            ),
            _tarjeta(
                f"{prefijo}6",
                "histograma",
                8,
                1,
                4,
                3,
                f"Distribución de {nombre.lower()}",
                {"variable": variable},
            ),
            _tarjeta(
                f"{prefijo}7",
                "mapa_calor",
                0,
                4,
                6,
                2,
                f"{nombre} por hora y día",
                {"variable": variable, "estadistico": "promedio", "alertas": False},
            ),
            _tarjeta(
                f"{prefijo}8",
                "matriz",
                6,
                4,
                6,
                2,
                "Promedio por área y variable",
                {"filas": "area", "valor": "promedio"},
            ),
        ],
    )


def _ambiental():
    paginas = [
        _pagina_variable("p1", "Temperatura", "t", "TEMP"),
        _pagina_variable("p2", "Humedad", "h", "HUM"),
        _pagina_variable("p3", "Calidad del aire", "a", "AIRE"),
        _pagina(
            "p4",
            "Relación",
            [
                _tarjeta(
                    "r1",
                    "dispersion",
                    0,
                    0,
                    8,
                    6,
                    "Temperatura y humedad",
                    {"x": "TEMP", "y": "HUM"},
                ),
                _tarjeta(
                    "r2",
                    "texto",
                    8,
                    0,
                    4,
                    6,
                    "Cómo leer este tablero",
                    {
                        "nota": (
                            "Cada punto es el promedio de una hora de un dispositivo. "
                            "Si la temperatura sube, la humedad suele bajar; los valores "
                            "extremos ayudan a detectar fallas."
                        )
                    },
                ),
            ],
        ),
    ]
    return _conf("7d", paginas)


def _alertas():
    return _conf(
        "30d",
        [
            _pagina(
                "p1",
                "Alertas",
                [
                    _kpi("t1", 0, 0, 4, "Alertas", "alertas", meta=META_ALERTAS),
                    _kpi("t2", 4, 0, 4, "Alertas pendientes", "alertas_pendientes"),
                    _kpi(
                        "t3",
                        8,
                        0,
                        4,
                        "Tiempo de atención",
                        "tiempo_atencion",
                        meta=META_TIEMPO,
                    ),
                    _tarjeta(
                        "t4",
                        "barras_apiladas",
                        0,
                        1,
                        8,
                        3,
                        "Alertas por estado y día",
                        {"serie": "alertas_estado", "por": "dia", "porcentaje": False},
                    ),
                    _tarjeta(
                        "t5",
                        "alertas_dona",
                        8,
                        1,
                        4,
                        3,
                        "Alertas por nivel",
                        {"por": "nivel"},
                    ),
                    _tarjeta(
                        "t6",
                        "tiempo_atencion",
                        0,
                        4,
                        4,
                        2,
                        "Tiempo de atención por área",
                        {"por": "area"},
                        META_TIEMPO,
                    ),
                    _tarjeta(
                        "t7",
                        "ranking",
                        4,
                        4,
                        4,
                        2,
                        "Dispositivos con más alertas",
                        {
                            "metrica": "alertas",
                            "variable": "filtro",
                            "por": "dispositivo",
                            "sentido": "peores",
                            "n": 5,
                        },
                    ),
                    _tarjeta(
                        "t8",
                        "mapa_calor",
                        8,
                        4,
                        4,
                        2,
                        "Alertas por hora y día",
                        {"variable": "TEMP", "estadistico": "promedio", "alertas": True},
                    ),
                ],
            )
        ],
    )


def _operacion():
    return _conf(
        "7d",
        [
            _pagina(
                "p1",
                "Operación",
                [
                    _kpi("t1", 0, 0, 4, "Dispositivos en línea", "dispositivos_en_linea"),
                    _kpi("t2", 4, 0, 4, "Disponibilidad", "disponibilidad", meta=META_DISPONIBILIDAD),
                    _kpi("t3", 8, 0, 4, "Lecturas", "lecturas"),
                    _tarjeta(
                        "t4",
                        "disponibilidad",
                        0,
                        1,
                        8,
                        5,
                        "Disponibilidad por dispositivo",
                        {"limite": 10, "orden": "asc"},
                        META_DISPONIBILIDAD,
                    ),
                    _tarjeta(
                        "t5",
                        "medidor",
                        8,
                        1,
                        4,
                        2,
                        "Disponibilidad",
                        {"indicador": "disponibilidad", "variable": "filtro"},
                        META_DISPONIBILIDAD,
                    ),
                    _tarjeta(
                        "t6",
                        "barras_apiladas",
                        8,
                        3,
                        4,
                        3,
                        "Lecturas dentro de rango",
                        {"serie": "lecturas_rango", "por": "dia", "porcentaje": False},
                    ),
                ],
            )
        ],
    )


PLANTILLAS = [
    (
        "EJECUTIVO",
        "Ejecutivo",
        "Vista general de cumplimiento, alertas y disponibilidad de la organización.",
        _ejecutivo(),
    ),
    (
        "AMBIENTAL",
        "Calidad ambiental",
        "Temperatura, humedad y calidad del aire, con patrones y relación entre variables.",
        _ambiental(),
    ),
    (
        "ALERTAS",
        "Alertas y respuesta",
        "Alertas por estado, nivel y dispositivo, y tiempos de respuesta.",
        _alertas(),
    ),
    (
        "OPERACION",
        "Disponibilidad y operación",
        "Disponibilidad de los dispositivos y lecturas dentro de rango.",
        _operacion(),
    ),
]


def crear_plantillas(apps, schema_editor):
    TableroAnalitica = apps.get_model("analitica", "TableroAnalitica")
    VersionTablero = apps.get_model("analitica", "VersionTablero")
    for plantilla, nombre, descripcion, conf in PLANTILLAS:
        tablero, _ = TableroAnalitica.objects.get_or_create(
            organizacion=None,
            plantilla=plantilla,
            defaults={
                "nombre": nombre,
                "descripcion": descripcion,
                "predeterminado": False,
                "activo": True,
            },
        )
        if not VersionTablero.objects.filter(tablero=tablero).exists():
            VersionTablero.objects.create(tablero=tablero, numero=1, conf=conf)


class Migration(migrations.Migration):
    dependencies = [
        ("analitica", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(crear_plantillas, migrations.RunPython.noop),
    ]
