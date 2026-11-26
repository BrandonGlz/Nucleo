"""Etapa 9: nueva versión de cada plantilla con el acomodo en una sola hoja."""

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


def _conf(visibles, opciones, hoja=None):
    """Las visibles primero y el resto ocultas, como en formatos.py."""
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
        "hoja": hoja or {},
    }


PLANTILLAS = [
    (
        "EJECUTIVO",
        "Ejecutivo",
        _conf(
            ["cifras", "cumplimiento", "comparativo", "serie", "analisis"],
            {
                "cumplimiento": {"grafica": "cifra", "ancho": "12"},
                "comparativo": {"grafica": "lista", "ancho": "6"},
                "serie": {"grafica": "linea", "ancho": "6"},
                "analisis": {"ancho": "12"},
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
                "cumplimiento": {"grafica": "tabla", "ancho": "8"},
                "disponibilidad": {"grafica": "barras", "ancho": "4"},
                "incidentes": {"grafica": "tabla", "ancho": "12"},
                "gestion_alertas": {"grafica": "dona", "ancho": "4"},
                "observaciones": {"grafica": "lista", "ancho": "8"},
                "analisis": {"ancho": "12"},
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
                "dispositivos",
                "gestion_alertas",
                "disponibilidad",
                "analisis",
            ],
            {
                "serie": {"grafica": "linea", "ancho": "6"},
                "alertas": {"grafica": "barras", "ancho": "6"},
                "dispositivos": {"grafica": "tabla", "ancho": "6"},
                "gestion_alertas": {"grafica": "dona", "ancho": "3"},
                "disponibilidad": {"grafica": "barras", "ancho": "3"},
                "analisis": {"ancho": "12"},
            },
            {"analisis_largo": "breve"},
        ),
    ),
    (
        "INCIDENTES",
        "Incidentes",
        _conf(
            ["incidentes", "alertas", "gestion_alertas", "observaciones"],
            {
                "incidentes": {"grafica": "tabla", "ancho": "12"},
                "alertas": {"grafica": "barras", "ancho": "6"},
                "gestion_alertas": {"grafica": "barras", "ancho": "6"},
                "observaciones": {"grafica": "lista", "ancho": "12"},
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
        if VersionFormato.objects.filter(formato=formato, numero=3).exists():
            continue
        VersionFormato.objects.create(
            formato=formato,
            numero=3,
            conf=conf,
        )


def borrar_versiones(apps, schema_editor):
    VersionFormato = apps.get_model("reportes", "VersionFormato")
    VersionFormato.objects.filter(
        formato__organizacion__isnull=True,
        numero=3,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("reportes", "0013_reporte_asunto"),
    ]

    operations = [
        migrations.RunPython(crear_versiones, borrar_versiones),
    ]
