"""PDF descargable de un reporte (el de la app y los correos).

Dibuja las tarjetas de la configuración del formato en una rejilla de 12 columnas: membrete,
ficha del reporte, cifras clave, variables, gráficas, alertas, análisis y tarjetas nuevas, en
hojas A4 con pie y número de página.
"""

from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as lienzo
from reportlab.platypus import Paragraph

from apps.reportes import formatos
from common.fechas import dias_periodo

TINTA = colors.HexColor("#121413")
SECUNDARIO = colors.HexColor("#4A4F4B")
TENUE = colors.HexColor("#62675F")
BORDE = colors.HexColor("#E1E4DC")
SUAVE = colors.HexColor("#F5F6F3")
PISTA = colors.HexColor("#D9DCD5")
VERDE = colors.HexColor("#2BC47A")
EXITO = colors.HexColor("#0F7A45")
EXITO_SUAVE = colors.HexColor("#E3F4E8")
AVISO = colors.HexColor("#9A5B00")
AVISO_SUAVE = colors.HexColor("#FDF0D5")
# Color fijo de cada variable en la dona y su leyenda: no depende del orden ni de las alertas.
COLORES_ALERTAS = {"TEMP": TINTA, "HUM": VERDE, "AIRE": AVISO}

ANCHO, ALTO = A4
MARGEN_X = 45
MARGEN_Y = 42
PIE = 30
UTIL = ANCHO - 2 * MARGEN_X
SEPARACION = 12
HUECO = 11

ORDEN = ("TEMP", "HUM", "AIRE")
VARIABLE = {
    "TEMP": {"etiqueta": "Temperatura", "corta": "Temperatura", "decimales": 1, "unidad": "°C"},
    "HUM": {"etiqueta": "Humedad", "corta": "Humedad", "decimales": 1, "unidad": "%HR"},
    "AIRE": {"etiqueta": "Calidad del aire", "corta": "Aire", "decimales": 0, "unidad": "ppm"},
}
ORIGEN = {"MANUAL": "Manual", "PROGRAMADO": "Programado", "AGENTE": "Nico AI"}
MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
MESES_LARGOS = (
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)
DIAS = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")

TEXTO = ParagraphStyle("texto", fontName="Helvetica", fontSize=8, leading=12, textColor=SECUNDARIO)
FICHA = ParagraphStyle("ficha", fontName="Helvetica", fontSize=8, leading=11, textColor=TINTA)
NOTA = ParagraphStyle(
    "nota", fontName="Helvetica", fontSize=6.5, leading=9, textColor=TENUE, alignment=TA_LEFT
)


# --- Formato de fechas y números, igual que en la web -------------------------------------
def _local(valor):
    fecha = datetime.fromisoformat(valor) if isinstance(valor, str) else valor
    return timezone.localtime(fecha) if timezone.is_aware(fecha) else fecha


def _fecha(f):
    return f"{f.day} {MESES[f.month - 1]} {f.year}"


def _periodo(inicio, fin):
    a, b = dias_periodo(_local(inicio), _local(fin))
    if (a.year, a.month) == (b.year, b.month):
        return f"{a.day}–{b.day} {MESES[b.month - 1]} {b.year}"
    return f"{a.day} {MESES[a.month - 1]} – {_fecha(b)}"


def _miles(n):
    return f"{n:,}".replace(",", " ")


def _num(valor, decimales):
    return f"{float(valor):.{decimales}f}"


def _sin_parentesis(nombre):
    return nombre.split(" (")[0]


# --- Datos de la hoja, con la misma forma que la vista previa de la web ------------------
def _puntos_serie(serie, por_dia):
    puntos = []
    for p in serie:
        f = _local(p["t"])
        if por_dia:
            etiqueta = DIAS[f.weekday()] if len(serie) <= 7 else f"{f.day}/{f.month}"
        else:
            etiqueta = f"{f.hour:02d}:00"
        puntos.append((etiqueta, p["promedio"]))
    return puntos


def datos_hoja(reporte):
    from apps.dispositivos.models import Dispositivo

    c = reporte.cifras or {}
    variables = c.get("variables") or {}
    alertas = c.get("alertas") or {}
    por_variable = alertas.get("por_variable") or {}
    codigos = [v for v in ORDEN if v in variables]
    principal = max(codigos, key=lambda v: por_variable.get(v, 0), default="TEMP")
    area = reporte.area.nombre if reporte.area_id else None
    info = variables.get(principal)
    lugar = area or "todas las áreas"
    titulo = f"{_sin_parentesis(info['nombre'])} en {lugar}" if info else f"Monitoreo en {lugar}"
    nombres = dict(
        Dispositivo.objects.filter(
            codigo_mqtt__in=(c.get("dispositivos") or {}).keys()
        ).values_list("codigo_mqtt", "nombre")
    )
    por_dia = c.get("intervalo_serie") != "hora"
    series = {
        v: _puntos_serie(c.get("series", {}).get(v) or [], por_dia) for v in codigos
    }
    puntos = series.get(principal, [])
    tramo = "día" if por_dia else "hora"
    return {
        "titulo": titulo,
        "area": area or "Todas las áreas",
        "dispositivos": [nombres.get(k, k) for k in (c.get("dispositivos") or {})],
        "lecturas": sum(variables[v].get("muestras") or 0 for v in codigos),
        "contenido": reporte.contenido or "",
        "dias": round(
            (reporte.periodo_fin - reporte.periodo_inicio).total_seconds() / 86400
        ),
        "variables": [
            {
                "variable": v,
                "promedio": variables[v]["promedio"],
                "minimo": variables[v]["minimo"],
                "maximo": variables[v]["maximo"],
                "alertas": por_variable.get(v, 0),
            }
            for v in codigos
        ],
        "series": series,
        "serie": {
            "variable": principal,
            "etiqueta": f"{_sin_parentesis(info['nombre'])} promedio por {tramo}",
            "puntos": puntos,
        }
        if puntos and info
        else None,
    }


# --- Dibujo -------------------------------------------------------------------------------
class _Lienzo(lienzo.Canvas):
    """Guarda cada página para dibujar al final el pie con «Página n de N»."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._paginas = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for numero, estado in enumerate(self._paginas, start=1):
            self.__dict__.update(estado)
            _pie(self, numero, total)
            super().showPage()
        super().save()


def _pie(c, numero, total):
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.6)
    c.line(MARGEN_X, PIE + 8, ANCHO - MARGEN_X, PIE + 8)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(TINTA)
    c.drawString(MARGEN_X, PIE - 4, "Núcleo")
    c.setFont("Helvetica", 7)
    c.setFillColor(TENUE)
    c.drawString(
        MARGEN_X + c.stringWidth("Núcleo ", "Helvetica-Bold", 7),
        PIE - 4,
        "· Reporte de monitoreo ambiental",
    )
    c.drawRightString(ANCHO - MARGEN_X, PIE - 4, f"Página {numero} de {total}")


def _franja(c):
    c.setFillColor(TINTA)
    c.rect(0, ALTO - 4.5, ANCHO * 0.72, 4.5, stroke=0, fill=1)
    c.setFillColor(VERDE)
    c.rect(ANCHO * 0.72, ALTO - 4.5, ANCHO * 0.28, 4.5, stroke=0, fill=1)


def _mayus(c, x, y, texto, tam=6.5, color=TENUE, derecha=False):
    c.setFont("Helvetica-Bold", tam)
    c.setFillColor(color)
    espacio = tam * 0.12
    texto = texto.upper()
    ancho = c.stringWidth(texto, "Helvetica-Bold", tam) + espacio * (len(texto) - 1)
    objeto = c.beginText(x - ancho if derecha else x, y)
    objeto.setCharSpace(espacio)
    objeto.textOut(texto)
    objeto.setCharSpace(0)
    c.drawText(objeto)
    return ancho


def _tarjeta(c, x, y, ancho, alto):
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.75)
    c.setFillColor(colors.white)
    c.roundRect(x, y - alto, ancho, alto, 6, stroke=1, fill=1)


def _insignia(c, x_derecha, y, texto, alerta):
    c.setFont("Helvetica-Bold", 6.5)
    ancho = c.stringWidth(texto, "Helvetica-Bold", 6.5) + 10
    c.setFillColor(AVISO_SUAVE if alerta else EXITO_SUAVE)
    c.roundRect(x_derecha - ancho, y - 3.5, ancho, 12, 2.5, stroke=0, fill=1)
    c.setFillColor(AVISO if alerta else EXITO)
    c.drawString(x_derecha - ancho + 5, y, texto)


def _cabeza(c, reporte, hoja):
    y = ALTO - MARGEN_Y - 8
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(VERDE)
    c.drawString(MARGEN_X, y - 2, "núcleo")
    x = MARGEN_X + c.stringWidth("núcleo", "Helvetica-Bold", 15) + 9
    c.setStrokeColor(BORDE)
    c.line(x, y - 3, x, y + 9)
    _mayus(c, x + 9, y, "Reporte de monitoreo ambiental", 7, SECUNDARIO)
    _mayus(c, ANCHO - MARGEN_X, y, f"Folio R-{reporte.num:04d}", 7, SECUNDARIO, derecha=True)
    y -= 13
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.6)
    c.line(MARGEN_X, y, ANCHO - MARGEN_X, y)

    y -= 22
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(TINTA)
    c.drawString(MARGEN_X, y, hoja["titulo"])
    y -= 13
    inicio = _local(reporte.periodo_inicio)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(TENUE)
    c.drawString(MARGEN_X, y, f"Periodo de {MESES_LARGOS[inicio.month - 1]} {inicio.year}")

    y -= 22
    generado = _local(reporte.fecha_generacion or timezone.now())
    filas = [
        (
            ("Área", hoja["area"]),
            ("Periodo", _periodo(reporte.periodo_inicio, reporte.periodo_fin)),
        ),
        (
            ("Dispositivos", ", ".join(hoja["dispositivos"]) or "—"),
            (
                "Generado",
                f"{_fecha(generado)}, {generado:%H:%M} · {ORIGEN.get(reporte.origen, 'Manual')}",
            ),
        ),
    ]
    columna = UTIL / 2 + 10
    for fila in filas:
        alto_fila = 0
        for i, (etiqueta, valor) in enumerate(fila):
            x = MARGEN_X + i * columna
            etiqueta_ancho = 84 if i == 0 else 66
            _mayus(c, x, y, etiqueta, 6.5, TENUE)
            parrafo = Paragraph(escape(valor), FICHA)
            _, alto = parrafo.wrap(columna - etiqueta_ancho - 24, 100)
            parrafo.drawOn(c, x + etiqueta_ancho, y - alto + 8.5)
            alto_fila = max(alto_fila, alto)
        y -= alto_fila + 6
    y -= 4
    c.setStrokeColor(TINTA)
    c.setLineWidth(1)
    c.line(MARGEN_X, y, ANCHO - MARGEN_X, y)
    return y - 14


def _datos(opciones, por_omision):
    datos = opciones.get("datos")
    return set(datos) if isinstance(datos, list) else set(por_omision)


def _alto_cifras():
    return 52


def _dibujar_cifras(c, x, y, ancho, alto, hoja, opciones):
    datos = _datos(opciones, ("lecturas", "dispositivos", "alertas", "dias"))
    alertas = sum(v["alertas"] for v in hoja["variables"])
    items = []
    if "lecturas" in datos:
        items.append(("Lecturas", _miles(hoja["lecturas"]), False))
    if "dispositivos" in datos:
        items.append(("Dispositivos", str(len(hoja["dispositivos"])), False))
    if "alertas" in datos:
        items.append(("Alertas", str(alertas), alertas > 0))
    if "dias" in datos:
        items.append(("Días", str(hoja["dias"]), False))
    if not items:
        items = [("Sin datos", "—", False)]
    c.setFillColor(SUAVE)
    c.rect(x, y - alto, ancho, 2, stroke=0, fill=1)
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.6)
    c.rect(x, y - alto + 2, ancho, alto - 2, stroke=1, fill=0)
    ancho_item = ancho / len(items)
    for i, (etiqueta, valor, alerta) in enumerate(items):
        ix = x + i * ancho_item
        if i:
            c.line(ix, y, ix, y - alto + 2)
        _mayus(c, ix + 11, y - 15, etiqueta, 6.5, TENUE)
        c.setFont("Helvetica-Bold", 15)
        c.setFillColor(AVISO if alerta else TINTA)
        c.drawString(ix + 11, y - 36, valor)
    return alto


def _alto_variable(opciones):
    grafica = opciones.get("grafica", "rango")
    if grafica == "cifra":
        return 96
    if grafica == "columnas":
        return 132
    return 112


def _dibujar_variable(c, x, y, ancho, alto, hoja, opciones, codigo):
    info = VARIABLE[codigo]
    v = next((fila for fila in hoja["variables"] if fila["variable"] == codigo), None)
    datos = _datos(opciones, ("minmax", "alertas"))
    grafica = opciones.get("grafica", "rango")
    _tarjeta(c, x, y, ancho, alto)
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(TINTA)
    c.drawString(x + 11, y - 18, info["etiqueta"])
    if v is not None and "alertas" in datos:
        texto = (
            f"{v['alertas']} {'alerta' if v['alertas'] == 1 else 'alertas'}"
            if v["alertas"]
            else "Sin alertas"
        )
        _insignia(c, x + ancho - 10, y - 18, texto, v["alertas"] > 0)
    if v is None:
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 40, "Sin lecturas en el periodo.")
        return alto

    d = info["decimales"]
    extremos = []
    if "minmax" in datos or "minimo" in datos:
        extremos.append(("Mín", v["minimo"]))
    if "minmax" in datos or "maximo" in datos:
        extremos.append(("Máx", v["maximo"]))
    if grafica == "tabla":
        filas = [("Promedio", f"{_num(v['promedio'], d)} {info['unidad']}")]
        if "minmax" in datos or "minimo" in datos:
            filas.append(("Mínimo", f"{_num(v['minimo'], d)} {info['unidad']}"))
        if "minmax" in datos or "maximo" in datos:
            filas.append(("Máximo", f"{_num(v['maximo'], d)} {info['unidad']}"))
        if "alertas" in datos:
            filas.append(("Alertas", str(v["alertas"])))
        _tabla_simple(c, x, y - 28, ancho, alto - 34, ("Dato", "Valor"), filas)
        return alto

    if grafica == "cifra":
        _mayus(c, x + 11, y - 38, "Promedio", 6.5, TENUE)
        c.setFillColor(TINTA)
        c.setFont("Helvetica-Bold", 24)
        c.drawString(x + 11, y - 66, _num(v["promedio"], d))
        c.setFont("Helvetica", 9)
        c.setFillColor(TENUE)
        ancho_valor = c.stringWidth(_num(v["promedio"], d), "Helvetica-Bold", 24)
        c.drawString(x + 13 + ancho_valor, y - 66, info["unidad"])
        for i, (etiqueta, numero) in enumerate(extremos):
            c.setFont("Helvetica", 7)
            if i == 0:
                c.drawString(x + 11, y - 84, f"{etiqueta} {_num(numero, d)}")
            else:
                c.drawRightString(x + ancho - 11, y - 84, f"{etiqueta} {_num(numero, d)}")
        return alto

    _mayus(c, x + 11, y - 38, "Promedio", 6.5, TENUE)
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(TINTA)
    valor = _num(v["promedio"], d)
    c.drawString(x + 11, y - 58, valor)
    c.setFont("Helvetica", 8)
    c.setFillColor(TENUE)
    c.drawString(x + 15 + c.stringWidth(valor, "Helvetica-Bold", 16), y - 58, info["unidad"])

    if "minmax" not in datos and "minimo" not in datos and "maximo" not in datos:
        return alto
    if grafica == "barras":
        maximo = max(abs(numero) for _, numero in extremos) or 1
        for i, (etiqueta, numero) in enumerate(extremos):
            fila_y = y - 82 - i * 17
            c.setFont("Helvetica", 7)
            c.setFillColor(TENUE)
            c.drawString(x + 11, fila_y, etiqueta)
            color = TINTA if abs(numero) == maximo else PISTA
            largo = (ancho - 82) * abs(numero) / maximo
            c.setFillColor(SUAVE)
            c.rect(x + 40, fila_y, ancho - 82, 6, stroke=0, fill=1)
            c.setFillColor(color)
            c.rect(x + 40, fila_y, largo, 6, stroke=0, fill=1)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 11, fila_y, f"{_num(numero, d)} {info['unidad']}")
        return alto
    if grafica == "columnas":
        base = y - 104
        barras = [("Prom", v["promedio"]), *extremos]
        maximo = max(abs(numero) for _, numero in barras) or 1
        ancho_barra = (ancho - 44) / len(barras) * 0.55
        for i, (etiqueta, numero) in enumerate(barras):
            altura = 24 * abs(numero) / maximo
            bx = x + 22 + i * (ancho - 44) / len(barras)
            es_maximo = abs(numero) == maximo
            c.setFillColor(TINTA if es_maximo else PISTA)
            c.rect(bx, base, ancho_barra, altura, stroke=0, fill=1)
            c.setFont("Helvetica", 5.5)
            c.setFillColor(TINTA if es_maximo else SECUNDARIO)
            c.drawCentredString(
                bx + ancho_barra / 2,
                base + altura + 4,
                f"{_num(numero, d)} {info['unidad']}",
            )
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawCentredString(bx + ancho_barra / 2, base - 10, etiqueta)
        return alto

    if "minmax" not in datos:
        return alto
    # Rango mínimo–máximo con la marca del promedio.
    pista_y = y - 76
    izquierda, derecha = x + 11, x + ancho - 11
    c.setStrokeColor(TINTA)
    c.setLineWidth(2.2)
    c.line(izquierda, pista_y, derecha, pista_y)
    rango = (v["maximo"] - v["minimo"]) or 1
    marca = izquierda + (derecha - izquierda) * min(
        1, max(0, (v["promedio"] - v["minimo"]) / rango)
    )
    c.setFillColor(colors.white)
    c.setLineWidth(1.6)
    c.circle(marca, pista_y, 4, stroke=1, fill=1)
    c.setFont("Helvetica", 7)
    c.setFillColor(TENUE)
    c.drawString(izquierda, pista_y - 17, f"Mín {_num(v['minimo'], d)}")
    c.drawRightString(derecha, pista_y - 17, f"Máx {_num(v['maximo'], d)}")
    return alto


def _barra(c, x, y, ancho, fraccion, color):
    c.setFillColor(SUAVE if color == AVISO else PISTA)
    c.rect(x, y, ancho, 6, stroke=0, fill=1)
    if fraccion > 0:
        c.setFillColor(color)
        c.rect(x, y, ancho * min(1, fraccion), 6, stroke=0, fill=1)


def _paso(n):
    """Separación entre barras: más juntas cuando el periodo tiene muchos días u horas."""
    return 17 if n <= 10 else 11


def _alto_serie(n):
    return 40 + max(n * _paso(n), 4 * 17)


def _escala_linea(valores):
    """Escala con 15 % de margen arriba y abajo, y un rango mínimo si no hay variación."""
    minimo, maximo = min(valores), max(valores)
    rango = max(maximo - minimo, 1.0)
    return minimo - rango * 0.15, maximo + rango * 0.15


def _alto_tabla(n):
    return max(100, 34 + 16 * (n + 1))


def _tabla_simple(c, x, y, ancho, alto, encabezado, filas):
    """Tabla de borde fino; la primera fila es el encabezado."""
    columnas = len(encabezado)
    if not columnas:
        return
    total = len(filas) + 1
    margen = 10
    ancho_util = ancho - 2 * margen
    alto_fila = alto / total
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.5)
    arriba = y
    for i, fila in enumerate([encabezado, *filas]):
        abajo = arriba - alto_fila
        c.setFillColor(SUAVE if i == 0 else colors.white)
        c.rect(x + margen, abajo, ancho_util, alto_fila, stroke=1, fill=1)
        for j in range(1, columnas):
            linea_x = x + margen + j * ancho_util / columnas
            c.line(linea_x, abajo, linea_x, arriba)
        c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 7)
        c.setFillColor(TINTA if i == 0 else SECUNDARIO)
        for j, texto in enumerate(fila):
            c.drawString(
                x + margen + j * ancho_util / columnas + 4,
                abajo + alto_fila / 2 - 2.5,
                str(texto),
            )
        arriba = abajo


def _alto_serie_carta(hoja, opciones):
    puntos = hoja["serie"]["puntos"] if hoja.get("serie") else []
    n = len(puntos)
    grafica = opciones.get("grafica", "horizontal")
    if grafica in ("horizontal", "barras"):
        return _alto_serie(n)
    if grafica == "tabla":
        return _alto_tabla(n)
    if grafica in ("columnas", "linea"):
        return max(150, _alto_serie(n))
    return max(120, _alto_serie(n))


def _dibujar_serie(c, x, y, ancho, alto, hoja, opciones):
    serie = hoja.get("serie")
    datos = _datos(opciones, ("valores", "maximo"))
    grafica = opciones.get("grafica", "horizontal")
    if grafica == "barras":
        grafica = "horizontal"
    _tarjeta(c, x, y, ancho, alto)
    if not serie:
        _mayus(c, x + 11, y - 18, "Gráfica del periodo", 6.5, SECUNDARIO)
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "Este reporte no tiene gráfica.")
        return alto
    info = VARIABLE[serie["variable"]]
    puntos = serie["puntos"]
    if grafica == "tabla":
        _mayus(c, x + 11, y - 18, f"{serie['etiqueta']} · {info['unidad']}", 6.5, SECUNDARIO)
        filas = [(etiqueta, _num(valor, info["decimales"])) for etiqueta, valor in puntos]
        _tabla_simple(c, x, y - 28, ancho, alto - 34, ("Periodo", "Valor"), filas)
        return alto

    _mayus(c, x + 11, y - 18, f"{serie['etiqueta']} · {info['unidad']}", 6.5, SECUNDARIO)
    if not puntos:
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "Este reporte no tiene gráfica.")
        return alto
    maximo = max(valor for _, valor in puntos) or 1
    resaltar = "maximo" in datos
    mostrar_valores = "valores" in datos
    if grafica == "horizontal":
        paso = _paso(len(puntos))
        for i, (etiqueta, valor) in enumerate(puntos):
            fila_y = y - 38 - i * paso
            es_max = valor == maximo and resaltar
            c.setFont("Helvetica-Bold" if es_max else "Helvetica", 8 if paso > 12 else 6.5)
            c.setFillColor(TINTA if es_max else SECUNDARIO)
            c.drawString(x + 11, fila_y, etiqueta)
            _barra(
                c,
                x + 46,
                fila_y,
                max(20, ancho - 120),
                valor / maximo,
                TINTA if es_max else PISTA,
            )
            if mostrar_valores:
                c.setFont("Helvetica-Bold", 8 if paso > 12 else 6.5)
                c.setFillColor(TINTA)
                c.drawRightString(x + ancho - 26, fila_y, _num(valor, info["decimales"]))
                c.setFont("Helvetica", 6.5)
                c.setFillColor(TENUE)
                c.drawString(x + ancho - 24, fila_y, info["unidad"])
        return alto

    if grafica == "columnas":
        x0, x1 = x + 18, x + ancho - 14
        techo, base = y - 34, y - alto + 28
        ancho_barra = min(24, (x1 - x0) / max(1, len(puntos)) * 0.62)
        for i, (etiqueta, valor) in enumerate(puntos):
            cx = x0 + (i + 0.5) * (x1 - x0) / len(puntos)
            altura = (techo - base) * valor / maximo
            es_max = valor == maximo and resaltar
            c.setFillColor(TINTA if es_max else PISTA)
            c.rect(cx - ancho_barra / 2, base, ancho_barra, altura, stroke=0, fill=1)
            if mostrar_valores:
                c.setFont("Helvetica", 6)
                c.setFillColor(TINTA)
                c.drawCentredString(cx, base + altura + 3, _num(valor, info["decimales"]))
            if i % max(1, len(puntos) // 8) == 0:
                c.setFont("Helvetica", 6)
                c.setFillColor(TENUE)
                c.drawCentredString(cx, base - 9, etiqueta)
        c.setStrokeColor(BORDE)
        c.setLineWidth(0.5)
        c.line(x0, base, x1, base)
        return alto

    if grafica == "linea":
        x0, x1 = x + 18, x + ancho - 14
        techo, base = y - 34, y - alto + 28
        valores = [valor for _, valor in puntos]
        escala_min, escala_max = _escala_linea(valores)
        rango = escala_max - escala_min
        coords = []
        for i, (_, valor) in enumerate(puntos):
            cx = x0 + (i + 0.5) * (x1 - x0) / len(puntos)
            cy = base + (techo - base) * (valor - escala_min) / rango
            coords.append((cx, cy, valor))
        c.setStrokeColor(TINTA)
        c.setLineWidth(1.4)
        for (xa, ya, _), (xb, yb, _) in zip(coords, coords[1:], strict=False):
            c.line(xa, ya, xb, yb)
        for i, (cx, cy, valor) in enumerate(coords):
            es_max = valor == maximo and resaltar
            c.setFillColor(TINTA if es_max else colors.white)
            c.setStrokeColor(TINTA)
            c.setLineWidth(1)
            c.circle(cx, cy, 2.4, stroke=1, fill=1)
            if mostrar_valores:
                # En un mínimo local la línea sube por los dos lados y cruzaría la etiqueta:
                # ahí va debajo del punto; en los demás, arriba.
                vecinos = [coords[j][1] for j in (i - 1, i + 1) if 0 <= j < len(coords)]
                abajo = bool(vecinos) and all(v > cy for v in vecinos)
                c.setFont("Helvetica", 6)
                c.setFillColor(TINTA)
                c.drawCentredString(cx, cy - 9 if abajo else cy + 6, _num(valor, info["decimales"]))
            if i % max(1, len(puntos) // 8) == 0:
                c.setFont("Helvetica", 6)
                c.setFillColor(TENUE)
                c.drawCentredString(cx, base - 9, puntos[i][0])
        return alto

    # Cualquier tipo no previsto se dibuja como tabla para no dejar la tarjeta vacía.
    filas = [(etiqueta, _num(valor, info["decimales"])) for etiqueta, valor in puntos]
    _tabla_simple(c, x, y - 28, ancho, alto - 34, ("Periodo", "Valor"), filas)
    return alto


def _alto_alertas(hoja, opciones):
    grafica = opciones.get("grafica", "barras")
    if grafica in ("barras", "horizontal"):
        n = len(hoja["serie"]["puntos"]) if hoja.get("serie") else 0
        return _alto_serie(n)
    if grafica == "tabla":
        return _alto_tabla(len(hoja["variables"]))
    return 150


def segmentos_dona(variables, total):
    """Segmentos de la dona: variable, color fijo y grados. Ignora las variables sin alertas."""
    if not total:
        return []
    return [
        (v["variable"], COLORES_ALERTAS.get(v["variable"], SECUNDARIO), 360 * v["alertas"] / total)
        for v in variables
        if v["alertas"]
    ]


def _dibujar_alertas(c, x, y, ancho, alto, hoja, opciones):
    datos = _datos(opciones, ("total", "porcentaje"))
    grafica = opciones.get("grafica", "barras")
    variables = hoja["variables"]
    total = sum(v["alertas"] for v in variables)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Alertas por variable", 6.5, SECUNDARIO)
    if not total:
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "No hubo alertas en el periodo.")
        return alto

    if grafica == "barras":
        if "total" in datos:
            c.setFont("Helvetica-Bold", 16)
            c.setFillColor(AVISO)
            c.drawString(x + 11, y - 42, str(total))
            c.setFont("Helvetica", 8)
            c.setFillColor(TENUE)
            texto = "alerta en el periodo" if total == 1 else "alertas en el periodo"
            c.drawString(
                x + 18 + c.stringWidth(str(total), "Helvetica-Bold", 16), y - 42, texto
            )
        inicio = 62 if "total" in datos else 42
        for i, v in enumerate(variables):
            fila_y = y - inicio - i * 17
            pct = round(v["alertas"] / total * 100)
            c.setFont("Helvetica", 8)
            c.setFillColor(SECUNDARIO)
            c.drawString(x + 11, fila_y, VARIABLE[v["variable"]]["corta"])
            _barra(
                c,
                x + 80,
                fila_y,
                max(20, ancho - 150),
                v["alertas"] / total,
                AVISO,
            )
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 34, fila_y, str(v["alertas"]))
            if "porcentaje" in datos:
                c.setFont("Helvetica", 6.5)
                c.setFillColor(TENUE)
                c.drawString(x + ancho - 31, fila_y, f"{pct} %")
        return alto

    if grafica == "lista":
        fila_y = y - 42
        for v in variables:
            pct = round(v["alertas"] / total * 100)
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(TINTA)
            c.drawString(x + 11, fila_y, VARIABLE[v["variable"]]["corta"])
            c.setFont("Helvetica", 8)
            c.setFillColor(SECUNDARIO)
            detalle = f"{v['alertas']} de {total}"
            if "porcentaje" in datos:
                detalle += f" · {pct} %"
            c.drawString(x + 92, fila_y, detalle)
            fila_y -= 17
        return alto

    if grafica == "columnas":
        x0, x1 = x + 26, x + ancho - 14
        techo, base = y - 44, y - alto + 28
        maximo = max(v["alertas"] for v in variables) or 1
        for i, v in enumerate(variables):
            cx = x0 + (i + 0.5) * (x1 - x0) / len(variables)
            altura = (techo - base) * v["alertas"] / maximo
            c.setFillColor(AVISO if v["alertas"] else PISTA)
            c.rect(cx - 12, base, 24, altura, stroke=0, fill=1)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawCentredString(cx, base - 9, VARIABLE[v["variable"]]["corta"])
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(TINTA)
            c.drawCentredString(cx, base + altura + 3, str(v["alertas"]))
        c.setStrokeColor(BORDE)
        c.setLineWidth(0.5)
        c.line(x0, base, x1, base)
        return alto

    if grafica == "dona":
        radio = min(48, (alto - 64) / 2, ancho / 4)
        cx = x + ancho / 2
        cy = y - 36 - radio
        angulo = 90
        for _, color, grados in segmentos_dona(variables, total):
            c.setFillColor(color)
            c.wedge(
                cx - radio,
                cy - radio,
                cx + radio,
                cy + radio,
                angulo,
                grados,
                stroke=0,
                fill=1,
            )
            angulo += grados
        c.setFillColor(colors.white)
        c.circle(cx, cy, radio * 0.58, stroke=0, fill=1)
        c.setFillColor(TINTA)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(cx, cy - 3, str(total))
        leyenda_x = x + ancho / 2 + radio + 12
        leyenda_y = cy + radio - 6
        for v in variables:
            c.setFillColor(COLORES_ALERTAS.get(v["variable"], SECUNDARIO))
            c.rect(leyenda_x, leyenda_y - 6, 6, 6, stroke=0, fill=1)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(SECUNDARIO)
            c.drawString(
                leyenda_x + 10,
                leyenda_y - 5,
                f"{VARIABLE[v['variable']]['corta']} {v['alertas']}",
            )
            leyenda_y -= 13
        return alto

    # Tabla como respaldo de cualquier otro tipo.
    filas = []
    for v in variables:
        pct = round(v["alertas"] / total * 100)
        filas.append((VARIABLE[v["variable"]]["corta"], str(v["alertas"]), f"{pct} %"))
    _tabla_simple(c, x, y - 28, ancho, alto - 34, ("Variable", "Alertas", "%"), filas)
    return alto


def _textos_analisis(hoja, opciones):
    datos = _datos(opciones, ("texto", "pie"))
    textos = []
    if "texto" in datos:
        textos = [p for p in hoja["contenido"].split("\n\n") if p.strip()]
    nota = ""
    if "pie" in datos:
        nota = f"Texto redactado con IA a partir de {_miles(hoja['lecturas'])} lecturas."
    return textos, nota


def _alto_analisis(ancho, hoja, opciones):
    textos, nota = _textos_analisis(hoja, opciones)
    interior = ancho - 22
    altos = [
        Paragraph(escape(p).replace("\n", "<br/>"), TEXTO).wrap(interior, ALTO)[1]
        for p in textos
    ]
    alto_nota = Paragraph(nota, NOTA).wrap(interior, ALTO)[1] if nota else 0
    return 34 + sum(altos) + 6 * len(altos) + (alto_nota + 8 if nota else 0)


def _dibujar_analisis(c, x, y, ancho, alto, hoja, opciones):
    textos, nota = _textos_analisis(hoja, opciones)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Análisis", 6.5, SECUNDARIO)
    interior = ancho - 22
    cursor = y - 30
    for texto in textos:
        parrafo = Paragraph(escape(texto).replace("\n", "<br/>"), TEXTO)
        _, usado = parrafo.wrap(interior, ALTO)
        parrafo.drawOn(c, x + 11, cursor - usado)
        cursor -= usado + 6
    if nota:
        parrafo = Paragraph(nota, NOTA)
        _, usado = parrafo.wrap(interior, ALTO)
        parrafo.drawOn(c, x + 11, cursor - usado)
    return alto


def _alto_resumen():
    return 112


def _dibujar_resumen(c, x, y, ancho, alto, hoja, opciones):
    datos = _datos(opciones, ("minimo", "promedio", "maximo", "alertas"))
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Resumen por variable", 6.5, SECUNDARIO)
    if not hoja["variables"]:
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "Sin datos en el periodo.")
        return alto
    encabezado = ["Variable"]
    if "minimo" in datos:
        encabezado.append("Mín.")
    if "promedio" in datos:
        encabezado.append("Prom.")
    if "maximo" in datos:
        encabezado.append("Máx.")
    if "alertas" in datos:
        encabezado.append("Alertas")
    filas = []
    for v in hoja["variables"]:
        info = VARIABLE[v["variable"]]
        d = info["decimales"]
        fila = [info["corta"]]
        if "minimo" in datos:
            fila.append(_num(v["minimo"], d))
        if "promedio" in datos:
            fila.append(_num(v["promedio"], d))
        if "maximo" in datos:
            fila.append(_num(v["maximo"], d))
        if "alertas" in datos:
            fila.append(str(v["alertas"]))
        filas.append(fila)
    _tabla_simple(c, x, y - 28, ancho, alto - 34, encabezado, filas)
    return alto


def _medir(fuente, ancho, hoja, opciones):
    if fuente.startswith("var:"):
        return _alto_variable(opciones)
    if fuente == "cifras":
        return _alto_cifras()
    if fuente == "serie":
        return _alto_serie_carta(hoja, opciones)
    if fuente == "alertas":
        return _alto_alertas(hoja, opciones)
    if fuente == "analisis":
        return _alto_analisis(ancho, hoja, opciones)
    if fuente == "resumen":
        return _alto_resumen()
    return 100


def _dibujar_tarjeta(c, fuente, x, y, ancho, alto, hoja, opciones):
    if fuente.startswith("var:"):
        return _dibujar_variable(c, x, y, ancho, alto, hoja, opciones, fuente.split(":")[1])
    if fuente == "cifras":
        return _dibujar_cifras(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "serie":
        return _dibujar_serie(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "alertas":
        return _dibujar_alertas(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "analisis":
        return _dibujar_analisis(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "resumen":
        return _dibujar_resumen(c, x, y, ancho, alto, hoja, opciones)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Sin datos", 6.5, SECUNDARIO)
    c.setFont("Helvetica", 8)
    c.setFillColor(TENUE)
    c.drawString(x + 11, y - 38, "Esta tarjeta no tiene datos.")
    return alto


def _posiciones_fila(spans):
    """Posición y ancho de cada tarjeta; las filas completas respetan la rejilla de 12."""
    n = len(spans)
    if sum(spans) == 12:
        disponible = UTIL - HUECO * (n - 1)
        anchos = [disponible * span / 12 for span in spans]
        posiciones = []
        cursor = MARGEN_X
        for ancho in anchos:
            posiciones.append((cursor, ancho))
            cursor += ancho + HUECO
        return posiciones
    slot = UTIL / 12
    posiciones = []
    prefijo = 0
    for span in spans:
        posiciones.append((MARGEN_X + prefijo * slot, max(80, slot * span - HUECO)))
        prefijo += span
    return posiciones


def construir(reporte):
    """Devuelve el PDF del reporte como bytes, con las tarjetas de su formato."""
    conf = (
        reporte.formato_version.conf
        if reporte.formato_version_id
        else formatos.CONF_OPERATIVO
    )
    conf = formatos.validar_conf(conf)
    hoja = datos_hoja(reporte)
    memoria = BytesIO()
    c = _Lienzo(memoria, pagesize=A4)
    c.setTitle(f"Reporte R-{reporte.num:04d} · {hoja['titulo']}")
    c.setAuthor("Núcleo")
    _franja(c)
    y = _cabeza(c, reporte, hoja)

    ocultos = set(conf["ocultos"])
    personalizadas = {p["id"]: p for p in conf["personalizadas"]}
    filas = []
    fila = []
    usado = 0
    for id_tarjeta in conf["orden"]:
        if id_tarjeta in ocultos:
            continue
        opciones = conf["opciones"].get(id_tarjeta, {})
        ancho_col = int(opciones.get("ancho", 12))
        if fila and usado + ancho_col > 12:
            filas.append(fila)
            fila = []
            usado = 0
        fuente = (
            personalizadas[id_tarjeta]["fuente"]
            if id_tarjeta in personalizadas
            else id_tarjeta
        )
        fila.append((fuente, ancho_col, opciones))
        usado += ancho_col
    if fila:
        filas.append(fila)

    for fila in filas:
        spans = [span for _, span, _ in fila]
        posiciones = _posiciones_fila(spans)
        altos = [
            _medir(fuente, ancho, hoja, opciones)
            for (fuente, _, opciones), (_, ancho) in zip(fila, posiciones, strict=True)
        ]
        minimos = [
            opciones["alto"] * 0.75
            for _, _, opciones in fila
            if opciones.get("alto") is not None
        ]
        alto_fila = max([*altos, *minimos]) if altos else 0
        if y - alto_fila < PIE + 24:
            c.showPage()
            _franja(c)
            y = ALTO - MARGEN_Y
        for (fuente, _, opciones), (x, ancho) in zip(fila, posiciones, strict=True):
            _dibujar_tarjeta(c, fuente, x, y, ancho, alto_fila, hoja, opciones)
        y -= alto_fila + SEPARACION

    c.showPage()
    c.save()
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
