"""PDF descargable de un reporte (el de la app y los correos).

Sigue el formato estándar de la sección Reportes de la web: membrete, ficha del reporte, cifras
clave, una tarjeta por variable, la gráfica del periodo, las alertas por variable y el análisis,
en hojas A4 con pie y número de página.
"""

from datetime import datetime, timedelta
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

ANCHO, ALTO = A4
MARGEN_X = 45
MARGEN_Y = 42
PIE = 30
UTIL = ANCHO - 2 * MARGEN_X
SEPARACION = 12

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
    a = _local(inicio)
    b = _local(fin) - timedelta(microseconds=1)
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
    serie = c.get("series", {}).get(principal) or []
    por_dia = c.get("intervalo_serie") != "hora"
    puntos = []
    for p in serie:
        f = _local(p["t"])
        if por_dia:
            etiqueta = DIAS[f.weekday()] if len(serie) <= 7 else f"{f.day}/{f.month}"
        else:
            etiqueta = f"{f.hour:02d}:00"
        puntos.append((etiqueta, p["promedio"]))
    tramo = "día" if por_dia else "hora"
    return {
        "titulo": titulo,
        "area": area or "Todas las áreas",
        "dispositivos": [nombres.get(k, k) for k in (c.get("dispositivos") or {})],
        "lecturas": sum(variables[v].get("muestras") or 0 for v in codigos),
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


def _cifras(c, y, reporte, hoja):
    alertas = sum(v["alertas"] for v in hoja["variables"])
    dias = round((reporte.periodo_fin - reporte.periodo_inicio).total_seconds() / 86400)
    items = (
        ("Lecturas", _miles(hoja["lecturas"]), False),
        ("Dispositivos", str(len(hoja["dispositivos"])), False),
        ("Alertas", str(alertas), alertas > 0),
        ("Días", str(dias), False),
    )
    alto = 52
    ancho = UTIL / len(items)
    c.setFillColor(SUAVE)
    c.rect(MARGEN_X, y - alto, UTIL, 2, stroke=0, fill=1)
    c.setStrokeColor(BORDE)
    c.setLineWidth(0.6)
    c.rect(MARGEN_X, y - alto + 2, UTIL, alto - 2, stroke=1, fill=0)
    for i, (etiqueta, valor, alerta) in enumerate(items):
        x = MARGEN_X + i * ancho
        if i:
            c.line(x, y, x, y - alto + 2)
        _mayus(c, x + 11, y - 15, etiqueta, 6.5, TENUE)
        c.setFont("Helvetica-Bold", 15)
        c.setFillColor(AVISO if alerta else TINTA)
        c.drawString(x + 11, y - 36, valor)
    return y - alto - SEPARACION


def _variables(c, y, hoja):
    lista = hoja["variables"]
    if not lista:
        return y
    alto = 112
    hueco = 11
    ancho = (UTIL - hueco * 2) / 3
    for i, v in enumerate(lista):
        info = VARIABLE[v["variable"]]
        d = info["decimales"]
        x = MARGEN_X + i * (ancho + hueco)
        _tarjeta(c, x, y, ancho, alto)
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(TINTA)
        c.drawString(x + 11, y - 18, info["etiqueta"])
        texto = (
            f"{v['alertas']} {'alerta' if v['alertas'] == 1 else 'alertas'}"
            if v["alertas"]
            else "Sin alertas"
        )
        _insignia(c, x + ancho - 10, y - 18, texto, v["alertas"] > 0)
        _mayus(c, x + 11, y - 38, "Promedio", 6.5, TENUE)
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(TINTA)
        valor = _num(v["promedio"], d)
        c.drawString(x + 11, y - 58, valor)
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 15 + c.stringWidth(valor, "Helvetica-Bold", 16), y - 58, info["unidad"])
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
    return y - alto - SEPARACION


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


def _serie_y_alertas(c, y, hoja):
    serie = hoja["serie"]
    puntos = serie["puntos"] if serie else []
    paso = _paso(len(puntos))
    alto = _alto_serie(len(puntos))
    hueco = 11
    ancho = (UTIL - hueco) / 2
    # Gráfica del periodo: barras horizontales con el valor más alto resaltado.
    x = MARGEN_X
    _tarjeta(c, x, y, ancho, alto)
    if serie:
        info = VARIABLE[serie["variable"]]
        _mayus(c, x + 11, y - 18, f"{serie['etiqueta']} · {info['unidad']}", 6.5, SECUNDARIO)
        maximo = max(v for _, v in puntos) or 1
        for i, (etiqueta, valor) in enumerate(puntos):
            fila_y = y - 38 - i * paso
            es_max = valor == maximo
            c.setFont("Helvetica-Bold" if es_max else "Helvetica", 8 if paso > 12 else 6.5)
            c.setFillColor(TINTA if es_max else SECUNDARIO)
            c.drawString(x + 11, fila_y, etiqueta)
            _barra(c, x + 46, fila_y, ancho - 120, valor / maximo, TINTA if es_max else PISTA)
            texto = _num(valor, info["decimales"])
            c.setFont("Helvetica-Bold", 8 if paso > 12 else 6.5)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 26, fila_y, texto)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawString(x + ancho - 24, fila_y, info["unidad"])
    else:
        _mayus(c, x + 11, y - 18, "Gráfica del periodo", 6.5, SECUNDARIO)
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "Este reporte no tiene gráfica.")

    # Alertas por variable: total y barras con su porcentaje.
    x = MARGEN_X + ancho + hueco
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Alertas por variable", 6.5, SECUNDARIO)
    total = sum(v["alertas"] for v in hoja["variables"])
    if not total:
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        c.drawString(x + 11, y - 38, "No hubo alertas en el periodo.")
    else:
        c.setFont("Helvetica-Bold", 16)
        c.setFillColor(AVISO)
        c.drawString(x + 11, y - 42, str(total))
        c.setFont("Helvetica", 8)
        c.setFillColor(TENUE)
        texto = "alerta en el periodo" if total == 1 else "alertas en el periodo"
        c.drawString(x + 18 + c.stringWidth(str(total), "Helvetica-Bold", 16), y - 42, texto)
        for i, v in enumerate(hoja["variables"]):
            fila_y = y - 62 - i * 17
            pct = round(v["alertas"] / total * 100)
            c.setFont("Helvetica", 8)
            c.setFillColor(SECUNDARIO)
            c.drawString(x + 11, fila_y, VARIABLE[v["variable"]]["corta"])
            _barra(c, x + 80, fila_y, ancho - 150, v["alertas"] / total, AVISO)
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 34, fila_y, str(v["alertas"]))
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawString(x + ancho - 31, fila_y, f"{pct} %")
    return y - alto - SEPARACION


def _analisis(c, y, reporte, hoja):
    """Análisis en una tarjeta de ancho completo; si no cabe, sigue en otra hoja."""
    parrafos = [
        Paragraph(escape(p).replace("\n", "<br/>"), TEXTO)
        for p in reporte.contenido.split("\n\n")
        if p.strip()
    ]
    nota = Paragraph(
        f"Texto redactado con IA a partir de {_miles(hoja['lecturas'])} lecturas.", NOTA
    )
    interior = UTIL - 22
    altos = [p.wrap(interior, ALTO)[1] for p in parrafos]
    alto_nota = nota.wrap(interior, ALTO)[1]
    alto = 34 + sum(altos) + 6 * len(altos) + alto_nota + 8
    if y - alto < PIE + 24:
        c.showPage()
        _franja(c)
        y = ALTO - MARGEN_Y
    _tarjeta(c, MARGEN_X, y, UTIL, alto)
    _mayus(c, MARGEN_X + 11, y - 18, "Análisis", 6.5, SECUNDARIO)
    cursor = y - 30
    for parrafo, a in zip(parrafos, altos, strict=True):
        parrafo.drawOn(c, MARGEN_X + 11, cursor - a)
        cursor -= a + 6
    nota.drawOn(c, MARGEN_X + 11, cursor - alto_nota)
    return y - alto - SEPARACION


def construir(reporte):
    """Devuelve el PDF del reporte como bytes."""
    hoja = datos_hoja(reporte)
    memoria = BytesIO()
    c = _Lienzo(memoria, pagesize=A4)
    c.setTitle(f"Reporte R-{reporte.num:04d} · {hoja['titulo']}")
    c.setAuthor("Núcleo")
    _franja(c)
    y = _cabeza(c, reporte, hoja)
    y = _cifras(c, y, reporte, hoja)
    y = _variables(c, y, hoja)
    alto_serie = _alto_serie(len(hoja["serie"]["puntos"]) if hoja["serie"] else 0)
    if y - alto_serie < PIE + 24:
        c.showPage()
        _franja(c)
        y = ALTO - MARGEN_Y
    y = _serie_y_alertas(c, y, hoja)
    _analisis(c, y, reporte, hoja)
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
