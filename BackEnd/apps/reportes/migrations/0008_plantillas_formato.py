"""Crea las cuatro plantillas de formato compartidas y su versión 1."""

from django.db import migrations

PLANTILLAS = [
    (
        "EJECUTIVO",
        "Ejecutivo",
        {
            "version_esquema": 1,
            "base": True,
            "orden": [
                "cifras",
                "serie",
                "analisis",
                "var:TEMP",
                "var:HUM",
                "var:AIRE",
                "alertas",
            ],
            "ocultos": ["var:TEMP", "var:HUM", "var:AIRE", "alertas"],
            "opciones": {"serie": {"grafica": "linea"}},
            "personalizadas": [],
            "hoja": {},
        },
    ),
    (
        "CUMPLIMIENTO",
        "Cumplimiento",
        {
            "version_esquema": 1,
            "base": True,
            "orden": [
                "cifras",
                "alertas",
                "var:TEMP",
                "var:HUM",
                "var:AIRE",
                "analisis",
                "serie",
            ],
            "ocultos": ["serie"],
            "opciones": {
                "alertas": {"grafica": "dona", "ancho": "12"},
                "var:TEMP": {"datos": ["minmax", "alertas"]},
                "var:HUM": {"datos": ["minmax", "alertas"]},
                "var:AIRE": {"datos": ["minmax", "alertas"]},
            },
            "personalizadas": [],
            "hoja": {},
        },
    ),
    (
        "OPERATIVO",
        "Operativo detallado",
        {
            "version_esquema": 1,
            "base": True,
            "orden": [
                "cifras",
                "var:TEMP",
                "var:HUM",
                "var:AIRE",
                "serie",
                "alertas",
                "analisis",
            ],
            "ocultos": [],
            "opciones": {},
            "personalizadas": [],
            "hoja": {},
        },
    ),
    (
        "INCIDENTES",
        "Incidentes",
        {
            "version_esquema": 1,
            "base": True,
            "orden": [
                "alertas",
                "serie",
                "analisis",
                "cifras",
                "var:TEMP",
                "var:HUM",
                "var:AIRE",
            ],
            "ocultos": ["cifras", "var:TEMP", "var:HUM", "var:AIRE"],
            "opciones": {"alertas": {"grafica": "barras"}, "serie": {"grafica": "columnas"}},
            "personalizadas": [],
            "hoja": {},
        },
    ),
]


def crear_plantillas(apps, schema_editor):
    FormatoReporte = apps.get_model("reportes", "FormatoReporte")
    VersionFormato = apps.get_model("reportes", "VersionFormato")
    for plantilla, nombre, conf in PLANTILLAS:
        formato, _ = FormatoReporte.objects.get_or_create(
            organizacion=None,
            plantilla=plantilla,
            defaults={"nombre": nombre, "predeterminado": False, "activo": True},
        )
        if not VersionFormato.objects.filter(formato=formato).exists():
            VersionFormato.objects.create(formato=formato, numero=1, conf=conf)


class Migration(migrations.Migration):
    dependencies = [
        ("organizaciones", "0002_area_formato_reporte"),
        ("reportes", "0007_formatoreporte_versionformato_and_more"),
    ]

    operations = [
        migrations.RunPython(crear_plantillas, migrations.RunPython.noop),
    ]
