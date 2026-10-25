"""Generación del PDF descargable de un reporte."""

from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERDE = colors.HexColor("#1f7a4c")
ROJO = colors.HexColor("#b3261e")
GRIS = colors.HexColor("#6b7280")


def _grafica(nombre, unidad, serie, por_hora):
    """Curva del promedio con el máximo y el mínimo del tramo, para ver tendencias y picos."""
    puntos = [(datetime.fromisoformat(p["t"]).timestamp(), p) for p in serie]
    dibujo = Drawing(16 * cm, 6 * cm)
    dibujo.add(String(0, 5.5 * cm, f"{nombre} ({unidad})", fontSize=9, fontName="Helvetica-Bold"))
    grafica = LinePlot()
    grafica.x, grafica.y = 1.4 * cm, 0.9 * cm
    grafica.width, grafica.height = 14 * cm, 4.2 * cm
    grafica.data = [
        [(t, p["promedio"]) for t, p in puntos],
        [(t, p["maximo"]) for t, p in puntos],
        [(t, p["minimo"]) for t, p in puntos],
    ]
    for indice, (color, ancho) in enumerate(((VERDE, 1.6), (ROJO, 0.7), (GRIS, 0.7))):
        grafica.lines[indice].strokeColor = color
        grafica.lines[indice].strokeWidth = ancho
        grafica.lines[indice].symbol = None
    formato = "%d/%m %H:%M" if por_hora else "%d/%m"
    grafica.xValueAxis.labelTextFormat = lambda t: timezone.localtime(
        datetime.fromtimestamp(t, UTC)
    ).strftime(formato)
    grafica.xValueAxis.labels.fontSize = 6
    grafica.xValueAxis.labels.angle = 30
    grafica.xValueAxis.labels.boxAnchor = "ne"
    grafica.xValueAxis.visibleGrid = True
    grafica.xValueAxis.gridStrokeColor = colors.lightgrey
    grafica.yValueAxis.labels.fontSize = 6
    grafica.yValueAxis.visibleGrid = True
    grafica.yValueAxis.gridStrokeColor = colors.lightgrey
    dibujo.add(grafica)
    dibujo.add(String(11.2 * cm, 5.5 * cm, "— promedio  — máximo  — mínimo", fontSize=6))
    return dibujo


def construir(reporte):
    """Devuelve el PDF del reporte como bytes."""
    estilos = getSampleStyleSheet()
    cifras = reporte.cifras
    area = reporte.area.nombre if reporte.area_id else "Toda la organización"

    historia = [
        Paragraph("Núcleo — Reporte ambiental", estilos["Title"]),
        Paragraph(
            f"{escape(reporte.organizacion.nombre)} · {escape(area)}<br/>"
            f"Periodo: {reporte.periodo_inicio:%Y-%m-%d %H:%M} "
            f"a {reporte.periodo_fin:%Y-%m-%d %H:%M}",
            estilos["Normal"],
        ),
        Spacer(1, 0.6 * cm),
        Paragraph("Cifras del periodo", estilos["Heading2"]),
    ]

    filas = [["Variable", "Promedio", "Mínimo", "Máximo", "Muestras"]]
    for datos in cifras.get("variables", {}).values():
        unidad = datos["unidad"]
        filas.append(
            [
                f"{datos['nombre']} ({unidad})",
                datos["promedio"],
                datos["minimo"],
                datos["maximo"],
                datos["muestras"],
            ]
        )
    tabla = Table(filas, hAlign="LEFT")
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), VERDE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ]
        )
    )
    historia += [tabla, Spacer(1, 0.4 * cm)]

    series = cifras.get("series", {})
    if series:
        historia += [Paragraph("Tendencias", estilos["Heading2"])]
        por_hora = cifras.get("intervalo_serie") == "hora"
        for codigo, datos in cifras.get("variables", {}).items():
            if len(series.get(codigo, [])) >= 2:
                historia += [
                    _grafica(datos["nombre"], datos["unidad"], series[codigo], por_hora),
                    Paragraph(
                        f"Pico máximo: {datos['maximo']} {datos['unidad']} "
                        f"({datetime.fromisoformat(datos['pico_maximo_en']):%Y-%m-%d %H:%M}) · "
                        f"mínimo: {datos['minimo']} {datos['unidad']} "
                        f"({datetime.fromisoformat(datos['pico_minimo_en']):%Y-%m-%d %H:%M})",
                        estilos["Normal"],
                    ),
                    Spacer(1, 0.3 * cm),
                ]

    alertas = cifras.get("alertas", {})
    historia.append(
        Paragraph(f"Alertas en el periodo: {alertas.get('total', 0)}", estilos["Normal"])
    )
    por_nivel = alertas.get("por_nivel", {})
    if por_nivel:
        historia.append(
            Paragraph(
                "Por nivel: "
                + ", ".join(f"{k.lower()}: {v}" for k, v in sorted(por_nivel.items())),
                estilos["Normal"],
            )
        )
    historia += [Spacer(1, 0.6 * cm), Paragraph("Análisis", estilos["Heading2"])]
    for parrafo in reporte.contenido.split("\n\n"):
        historia.append(Paragraph(escape(parrafo).replace("\n", "<br/>"), estilos["Normal"]))
        historia.append(Spacer(1, 0.2 * cm))

    memoria = BytesIO()
    SimpleDocTemplate(memoria, pagesize=A4, title=f"Reporte {reporte.num}").build(historia)
    return memoria.getvalue()


def ruta_relativa(reporte):
    return f"reportes/reporte-{reporte.num}.pdf"


def guardar(reporte):
    """Escribe el PDF en ``MEDIA_ROOT`` y devuelve su ruta relativa."""
    relativa = ruta_relativa(reporte)
    destino = Path(settings.MEDIA_ROOT) / relativa
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(construir(reporte))
    return relativa
