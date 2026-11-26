"""Crea una versión nueva de cada plantilla con las tarjetas de la etapa 4."""

from django.db import migrations

# Tarjetas nuevas: mismo catálogo que formatos.py, congelado aquí para la migración.
NUEVAS = [
    {"id": "cumplimiento", "fuente": "cumplimiento", "nombre": "Cumplimiento"},
    {"id": "comparativo", "fuente": "comparativo", "nombre": "Comparativo"},
    {"id": "dispositivos", "fuente": "dispositivos", "nombre": "Dispositivos"},
    {"id": "gestion_alertas", "fuente": "gestion_alertas", "nombre": "Gestión de alertas"},
    {"id": "disponibilidad", "fuente": "disponibilidad", "nombre": "Disponibilidad"},
    {"id": "incidentes", "fuente": "incidentes", "nombre": "Incidentes"},
    {"id": "observaciones", "fuente": "observaciones", "nombre": "Observaciones"},
]
BASE = ["cifras", "var:TEMP", "var:HUM", "var:AIRE", "serie", "alertas", "analisis"]
IDS = [*BASE, *[tarjeta["id"] for tarjeta in NUEVAS]]


def _conf(visibles, opciones):
    return {
        "version_esquema": 1,
        "base": True,
        "orden": [
            *visibles,
            *(id_tarjeta for id_tarjeta in IDS if id_tarjeta not in visibles),
        ],
        "ocultos": [id_tarjeta for id_tarjeta in IDS if id_tarjeta not in visibles],
        "opciones": opciones,
        "personalizadas": NUEVAS,
        "hoja": {},
    }


PLANTILLAS = [
    (
        "EJECUTIVO",
        "Ejecutivo",
        _conf(
            ["cifras", "cumplimiento", "comparativo", "serie", "analisis"],
            {
                "cumplimiento": {"grafica": "cifra"},
                "comparativo": {"grafica": "tabla"},
                "serie": {"grafica": "linea"},
            },
        ),
    ),
    (
        "CUMPLIMIENTO",
        "Cumplimiento",
        _conf(
            [
                "cumplimiento",
                "disponibilidad",
                "incidentes",
                "gestion_alertas",
                "observaciones",
                "analisis",
            ],
            {
                "cumplimiento": {"grafica": "tabla"},
                "incidentes": {"grafica": "tabla", "ancho": "12"},
                "gestion_alertas": {"grafica": "dona"},
                "disponibilidad": {"grafica": "barras"},
            },
        ),
    ),
    (
        "OPERATIVO",
        "Operativo detallado",
        _conf(
            [
                "cifras",
                "var:TEMP",
                "var:HUM",
                "var:AIRE",
                "serie",
                "alertas",
                "analisis",
                "dispositivos",
                "gestion_alertas",
                "disponibilidad",
            ],
            {},
        ),
    ),
    (
        "INCIDENTES",
        "Incidentes",
        _conf(
            ["incidentes", "alertas", "gestion_alertas", "observaciones"],
            {
                "incidentes": {"grafica": "tabla", "ancho": "12"},
                "alertas": {"grafica": "barras"},
                "gestion_alertas": {"grafica": "barras"},
            },
        ),
    ),
]


def crear_versiones(apps, schema_editor):
    FormatoReporte = apps.get_model("reportes", "FormatoReporte")
    VersionFormato = apps.get_model("reportes", "VersionFormato")
    for plantilla, nombre, conf in PLANTILLAS:
        formato = FormatoReporte.objects.filter(
            organizacion__isnull=True,
            plantilla=plantilla,
        ).first()
        if formato is None:
            formato = FormatoReporte.objects.create(
                organizacion=None,
                plantilla=plantilla,
                nombre=nombre,
                predeterminado=False,
                activo=True,
            )
        if VersionFormato.objects.filter(formato=formato, numero=2).exists():
            continue
        VersionFormato.objects.create(
            formato=formato,
            numero=2,
            conf=conf,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("reportes", "0010_programacionreporte_areas_reporte_areas"),
    ]

    operations = [
        migrations.RunPython(crear_versiones, migrations.RunPython.noop),
    ]
