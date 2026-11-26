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
from reportlab.pdfbase.pdfmetrics import stringWidth
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
SIN_DATOS_NUEVO = "Sin datos para este reporte (generado antes de esta función)"
SIN_DATOS_PERIODO = "Sin datos en el periodo."
ESTADOS_ALERTA = {
    "ATENDIDA": "Atendidas",
    "DESCARTADA": "Descartadas",
    "PENDIENTE": "Pendientes",
}
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


def _fecha_corta(f):
    return f"{f.day} {MESES[f.month - 1]} {f:%H:%M}"


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
    alcance = c.get("alcance") or area or "Todas las áreas"
    lugar = "todas las áreas" if alcance == "Toda la organización" else alcance
    titulo = f"{_sin_parentesis(info['nombre'])} en {lugar}" if info else f"Monitoreo en {lugar}"
    nombres = {
        codigo: (nombre, area_nombre)
        for codigo, nombre, area_nombre in Dispositivo.objects.filter(
            codigo_mqtt__in=(c.get("dispositivos") or {}).keys()
        ).values_list("codigo_mqtt", "nombre", "area__nombre")
    }
    detalle_dispositivos = []
    for codigo, valores in (c.get("dispositivos") or {}).items():
        nombre, area_nombre = nombres.get(codigo, (codigo, ""))
        detalle = {
            "codigo": codigo,
            "nombre": valores.get("nombre") or nombre,
            "area": valores.get("area") or area_nombre,
        }
        for variable in ORDEN:
            if variable in valores:
                detalle[variable] = valores[variable]
        detalle_dispositivos.append(detalle)

    por_dia = c.get("intervalo_serie") != "hora"
    series = {
        v: _puntos_serie(c.get("series", {}).get(v) or [], por_dia) for v in codigos
    }
    puntos = series.get(principal, [])
    tramo = "día" if por_dia else "hora"
    return {
        "titulo": titulo,
        "area": alcance,
        "dispositivos": [nombres.get(k, (k, ""))[0] for k in (c.get("dispositivos") or {})],
        "por_dispositivo": detalle_dispositivos,
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
        "cumplimiento": c.get("cumplimiento"),
        "comparativo": c.get("comparativo"),
        "gestion_alertas": c.get("gestion_alertas"),
        "disponibilidad": c.get("disponibilidad"),
        "incidentes": c.get("incidentes"),
        "observaciones": c.get("observaciones"),
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


def _recortar_texto(texto, ancho, fuente="Helvetica", tam=7):
    """Recorta un texto con «…» para que quepa en el ancho de una celda."""
    texto = str(texto)
    if stringWidth(texto, fuente, tam) <= ancho:
        return texto
    puntos = "…"
    while texto and stringWidth(texto + puntos, fuente, tam) > ancho:
        texto = texto[:-1]
    return texto + puntos


def _anchos_tabla(c, encabezado, filas, disponible, tam=7, recortar=()):
    """Reparte el ancho según el contenido y recorta solo las columnas de texto."""
    naturales = []
    for i in range(len(encabezado)):
        textos = [str(encabezado[i])] + [
            str(fila[i]) for fila in filas if i < len(fila)
        ]
        naturales.append(
            max(stringWidth(texto, "Helvetica", tam) for texto in textos) + 8
        )
    total = sum(naturales)
    if not total:
        return [disponible / len(encabezado)] * len(encabezado)
    anchos = list(naturales)
    if total < disponible:
        extra = disponible - total
        return [ancho + extra * ancho / total for ancho in naturales]
    sobrante = total - disponible
    elegidas = [i for i in recortar if i < len(anchos)]
    if elegidas:
        base = sum(anchos[i] for i in elegidas)
        for i in elegidas:
            anchos[i] = max(18, anchos[i] - sobrante * anchos[i] / base)
    total = sum(anchos)
    if total > disponible:
        factor = disponible / total
        anchos = [ancho * factor for ancho in anchos]
    return anchos


def _tabla_compacta(
    c,
    x,
    y,
    ancho,
    alto,
    encabezado,
    filas,
    tam=7,
    fila_alto=14,
    recortar=(),
    colores=None,
):
    """Tabla de filas de su alto y columnas calculadas por contenido."""
    margen = 10
    disponible = ancho - 2 * margen
    anchos = _anchos_tabla(c, encabezado, filas, disponible, tam, recortar)
    total_filas = 1 + len(filas)
    for i, fila in enumerate([encabezado, *filas]):
        arriba = y - i * fila_alto
        abajo = arriba - fila_alto
        c.setFillColor(SUAVE if i == 0 else colors.white)
        c.setStrokeColor(BORDE)
        c.setLineWidth(0.5)
        c.rect(x + margen, abajo, disponible, fila_alto, stroke=1, fill=1)
        cursor = x + margen
        for j, celda in enumerate(fila):
            ancho_celda = anchos[j] if j < len(anchos) else disponible / len(fila)
            if j:
                c.line(cursor, abajo, cursor, arriba)
            texto = _recortar_texto(
                celda,
                max(4, ancho_celda - 6),
                "Helvetica-Bold" if i == 0 else "Helvetica",
                tam,
            )
            c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", tam)
            if i and colores and j == len(fila) - 1:
                c.setFillColor(colores[i - 1])
            else:
                c.setFillColor(TINTA if i == 0 else SECUNDARIO)
            c.drawString(cursor + 3, abajo + 4, texto)
            cursor += ancho_celda
    return min(alto, total_filas * fila_alto)


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


def _mensaje_tarjeta(c, x, y, ancho, alto, titulo, texto, color=TENUE):
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, titulo, 6.5, SECUNDARIO)
    c.setFont("Helvetica", 8)
    c.setFillColor(color)
    c.drawString(x + 11, y - 38, texto)
    return alto


def _alto_cumplimiento(hoja, opciones):
    datos = hoja.get("cumplimiento")
    if not datos:
        return 68
    if opciones.get("grafica") == "tabla":
        return max(100, 34 + 16 * (len(datos) + 1))
    if opciones.get("grafica") == "cifra":
        return 96
    return max(92, 42 + 17 * len(datos))


def _dibujar_cumplimiento(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("cumplimiento")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Cumplimiento", SIN_DATOS_NUEVO)
    if not datos:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Cumplimiento", SIN_DATOS_PERIODO)
    filas = [(codigo, datos[codigo]) for codigo in ORDEN if codigo in datos]
    grafica = opciones.get("grafica", "barras")
    seleccion = _datos(opciones, ("pct", "fuera"))
    if grafica == "tabla":
        encabezado = ["Variable"]
        if "pct" in seleccion:
            encabezado.append("Cumplimiento")
        if "fuera" in seleccion:
            encabezado.append("Fuera")
        encabezado.append("Lecturas")
        cuerpo = []
        for codigo, info in filas:
            fila = [VARIABLE[codigo]["corta"]]
            if "pct" in seleccion:
                fila.append(f"{info['dentro_pct']:.1f} %")
            if "fuera" in seleccion:
                fila.append(f"{info['fuera_min']:.1f} min")
            fila.append(_miles(info["lecturas"]))
            cuerpo.append(fila)
        _tarjeta(c, x, y, ancho, alto)
        _mayus(c, x + 11, y - 18, "Cumplimiento", 6.5, SECUNDARIO)
        _tabla_compacta(
            c, x, y - 26, ancho, alto - 30, encabezado, cuerpo, recortar=(0,)
        )
        return alto
    if grafica == "cifra":
        _tarjeta(c, x, y, ancho, alto)
        _mayus(c, x + 11, y - 18, "Cumplimiento", 6.5, SECUNDARIO)
        ancho_item = (ancho - 22) / max(1, len(filas))
        for i, (codigo, info) in enumerate(filas):
            ix = x + 11 + i * ancho_item
            _mayus(c, ix, y - 36, VARIABLE[codigo]["corta"], 6, TENUE)
            c.setFont("Helvetica-Bold", 14)
            c.setFillColor(TINTA)
            c.drawString(ix, y - 54, f"{info['dentro_pct']:.0f} %")
            if "fuera" in seleccion:
                c.setFont("Helvetica", 7)
                c.setFillColor(TENUE)
                c.drawString(ix, y - 68, f"{info['fuera_min']:.1f} min fuera")
        return alto
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Cumplimiento", 6.5, SECUNDARIO)
    fila_y = y - 38
    for codigo, info in filas:
        pct = max(0.0, min(100.0, float(info["dentro_pct"])))
        c.setFont("Helvetica", 7)
        c.setFillColor(SECUNDARIO)
        c.drawString(x + 11, fila_y, VARIABLE[codigo]["corta"])
        c.setFillColor(PISTA)
        c.rect(x + 82, fila_y - 1, ancho - 118, 6, stroke=0, fill=1)
        c.setFillColor(VERDE)
        c.rect(x + 82, fila_y - 1, (ancho - 118) * pct / 100, 6, stroke=0, fill=1)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(TINTA)
        c.drawRightString(x + ancho - 11, fila_y, f"{pct:.1f} %")
        fila_y -= 17
    return alto


def _alto_comparativo(hoja, opciones):
    datos = hoja.get("comparativo")
    if not datos or datos.get("sin_datos_previos"):
        return 68
    if opciones.get("grafica") == "cifra":
        return 100
    return max(100, 42 + 18 * len(datos.get("variables") or []))


def _signo(valor, decimales=1, unidad=""):
    if valor is None:
        return "—"
    signo = "+" if valor > 0 else "-" if valor < 0 else ""
    return f"{signo}{abs(float(valor)):.{decimales}f}{f' {unidad}' if unidad else ''}"


def _signo_pct(valor):
    if valor is None:
        return ""
    signo = "+" if valor > 0 else "-" if valor < 0 else ""
    return f" ({signo}{abs(float(valor)):.1f} %)"


def _dibujar_comparativo(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("comparativo")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Comparativo", SIN_DATOS_NUEVO)
    if datos.get("sin_datos_previos"):
        return _mensaje_tarjeta(
            c,
            x,
            y,
            ancho,
            alto,
            "Comparativo",
            "Sin datos del periodo anterior para comparar.",
        )
    filas = datos.get("variables") or []
    seleccion = _datos(opciones, ("promedio", "extremos", "alertas"))
    if not filas and not datos.get("alertas"):
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Comparativo", SIN_DATOS_PERIODO)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Comparativo", 6.5, SECUNDARIO)
    if opciones.get("grafica") == "cifra":
        ancho_item = (ancho - 22) / max(1, len(filas) + (1 if "alertas" in seleccion else 0))
        for i, fila in enumerate(filas):
            ix = x + 11 + i * ancho_item
            _mayus(
                c,
                ix,
                y - 36,
                VARIABLE.get(fila["variable"], {}).get("corta", fila["variable"]),
                6,
                TENUE,
            )
            c.setFont("Helvetica-Bold", 12)
            c.setFillColor(TINTA)
            c.drawString(ix, y - 54, _num(fila.get("promedio") or 0, 1))
            c.setFont("Helvetica", 7)
            c.setFillColor(EXITO if fila.get("mejora") else AVISO)
            c.drawString(
                ix,
                y - 68,
                f"{_signo(fila.get('dif_promedio'), 1, fila.get('unidad', ''))}"
                f"{_signo_pct(fila.get('dif_promedio_pct'))}",
            )
        if "alertas" in seleccion and datos.get("alertas"):
            alertas = datos["alertas"]
            ix = x + 11 + len(filas) * ancho_item
            _mayus(c, ix, y - 36, "Alertas", 6, TENUE)
            c.setFont("Helvetica-Bold", 12)
            c.setFillColor(TINTA)
            c.drawString(ix, y - 54, str(alertas["total"]))
            c.setFont("Helvetica", 7)
            c.setFillColor(EXITO if alertas.get("mejora") else AVISO)
            c.drawString(
                ix,
                y - 68,
                f"{_signo(alertas.get('diferencia'), 0)}"
                f"{_signo_pct(alertas.get('diferencia_pct'))}",
            )
        return alto

    encabezado = ["Variable"]
    if "promedio" in seleccion:
        encabezado.append("Promedio")
    if "extremos" in seleccion:
        encabezado.append("Mín. / Máx.")
    encabezado.append("Cambio")
    filas_tabla = []
    colores = []
    for fila in filas:
        datos_fila = [
            VARIABLE.get(fila["variable"], {}).get("corta", fila["variable"])
        ]
        if "promedio" in seleccion:
            datos_fila.append(f"{_num(fila.get('promedio') or 0, 1)} {fila.get('unidad', '')}")
        if "extremos" in seleccion:
            datos_fila.append(
                f"{_num(fila.get('minimo') or 0, 1)} / {_num(fila.get('maximo') or 0, 1)}"
            )
        datos_fila.append(
            f"{_signo(fila.get('dif_promedio'), 1, fila.get('unidad', ''))}"
            f"{_signo_pct(fila.get('dif_promedio_pct'))}"
        )
        filas_tabla.append(datos_fila)
        colores.append(EXITO if fila.get("mejora") else AVISO)
    _tabla_compacta(
        c,
        x,
        y - 26,
        ancho,
        alto - 30,
        encabezado,
        filas_tabla,
        tam=6,
        recortar=(0,),
        colores=colores,
    )
    if "alertas" in seleccion and datos.get("alertas"):
        alertas = datos["alertas"]
        c.setFont("Helvetica", 7)
        c.setFillColor(SECUNDARIO)
        c.drawString(
            x + 11,
            y - alto + 10,
            f"Alertas: {alertas['total']} contra {alertas['total_previo']}",
        )
        c.setFillColor(EXITO if alertas.get("mejora") else AVISO)
        c.drawString(
            x + 145,
            y - alto + 10,
            f"{_signo(alertas.get('diferencia'), 0)}"
            f"{_signo_pct(alertas.get('diferencia_pct'))}",
        )
    return alto
    return alto


def _alto_dispositivos(hoja):
    filas = hoja.get("por_dispositivo")
    if not filas:
        return 68
    return max(100, 34 + 16 * (len(filas) + 1))


def _dibujar_dispositivos(c, x, y, ancho, alto, hoja, opciones):
    filas = hoja.get("por_dispositivo")
    if filas is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Dispositivos", SIN_DATOS_NUEVO)
    if not filas:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Dispositivos", SIN_DATOS_PERIODO)
    seleccion = _datos(opciones, ("minimo", "promedio", "maximo", "area"))
    variables = [codigo for codigo in ORDEN if any(codigo in fila for fila in filas)]
    encabezado = ["Dispositivo"]
    if "area" in seleccion:
        encabezado.append("Área")
    encabezado.extend(VARIABLE[codigo]["corta"] for codigo in variables)
    cuerpo = []
    for fila in filas:
        datos = [fila.get("nombre") or fila.get("codigo", "")]
        if "area" in seleccion:
            datos.append(fila.get("area") or "—")
        for codigo in variables:
            info = fila.get(codigo)
            if not info or info.get("promedio") is None:
                datos.append("—")
            else:
                decimales = VARIABLE[codigo]["decimales"]
                datos.append(f"{_num(info['promedio'], decimales)} {VARIABLE[codigo]['unidad']}")
        cuerpo.append(datos)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Dispositivos", 6.5, SECUNDARIO)
    _tabla_compacta(
        c,
        x,
        y - 26,
        ancho,
        alto - 30,
        encabezado,
        cuerpo,
        tam=6,
        recortar=(0,),
    )
    return alto


def _alto_gestion(hoja, opciones):
    if not hoja.get("gestion_alertas"):
        return 68
    if opciones.get("grafica") == "tabla":
        datos = hoja["gestion_alertas"]
        filas = len(datos.get("estados") or {}) + len(datos.get("responsables") or {})
        return max(100, 42 + 16 * (filas + 1))
    return 132


def _dibujar_gestion(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("gestion_alertas")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Gestión de alertas", SIN_DATOS_NUEVO)
    if not datos or not datos.get("total"):
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Gestión de alertas", SIN_DATOS_PERIODO)
    seleccion = _datos(opciones, ("estados", "tiempo", "responsables"))
    estados = [(ESTADOS_ALERTA.get(k, k), v) for k, v in (datos.get("estados") or {}).items()]
    responsables = [(r["usuario"], r["total"]) for r in (datos.get("responsables") or [])]
    grafica = opciones.get("grafica", "dona")
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Gestión de alertas", 6.5, SECUNDARIO)
    if grafica == "dona":
        puntos = estados if "estados" in seleccion else responsables
        total = sum(valor for _, valor in puntos) or 1
        colores = [AVISO, VERDE, PISTA, TINTA, SECUNDARIO]
        radio = min(42, (alto - 62) / 2, ancho / 4)
        cx, cy = x + ancho / 2, y - 36 - radio
        angulo = 90
        for i, (_, valor) in enumerate(puntos):
            grados = 360 * valor / total
            if grados <= 0:
                continue
            c.setFillColor(colores[i % len(colores)])
            if grados >= 359.999:
                c.circle(cx, cy, radio, stroke=0, fill=1)
            else:
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
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(TINTA)
        c.drawCentredString(cx, cy - 3, str(datos["total"]))
        leyenda_x, leyenda_y = x + ancho / 2 + radio + 10, cy + radio - 5
        for i, (etiqueta, valor) in enumerate(puntos):
            c.setFillColor(colores[i % len(colores)])
            c.rect(leyenda_x, leyenda_y - 5, 6, 6, stroke=0, fill=1)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(SECUNDARIO)
            c.drawString(leyenda_x + 9, leyenda_y - 4, f"{etiqueta} {valor}")
            leyenda_y -= 12
    elif grafica == "tabla":
        filas = []
        if "estados" in seleccion:
            filas.extend([("Estado", etiqueta, str(valor)) for etiqueta, valor in estados])
        if "responsables" in seleccion:
            filas.extend(
                [("Responsable", etiqueta, str(valor)) for etiqueta, valor in responsables]
            )
        _tabla_compacta(
            c,
            x,
            y - 26,
            ancho,
            alto - 30,
            ["Tipo", "Detalle", "Total"],
            filas or [["—", "—", "—"]],
        )
    else:
        puntos = estados if "estados" in seleccion else responsables
        maximo = max((valor for _, valor in puntos), default=1) or 1
        fila_y = y - 36
        for etiqueta, valor in puntos:
            c.setFont("Helvetica", 7)
            c.setFillColor(SECUNDARIO)
            c.drawString(x + 11, fila_y, etiqueta)
            c.setFillColor(PISTA)
            c.rect(x + 100, fila_y - 1, ancho - 150, 6, stroke=0, fill=1)
            c.setFillColor(AVISO)
            c.rect(x + 100, fila_y - 1, (ancho - 150) * valor / maximo, 6, stroke=0, fill=1)
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 11, fila_y, str(valor))
            fila_y -= 16
    if "tiempo" in seleccion and datos.get("tiempo_medio_min") is not None:
        c.setFont("Helvetica", 6.5)
        c.setFillColor(TENUE)
        c.drawString(
            x + 11,
            y - alto + 14,
            f"Tiempo medio de atención: {datos['tiempo_medio_min']:.1f} min",
        )
    return alto


def _alto_disponibilidad(hoja, opciones):
    datos = hoja.get("disponibilidad")
    if not datos:
        return 68
    if opciones.get("grafica") == "tabla":
        return max(100, 34 + 16 * (len(datos) + 1))
    return max(100, 42 + 16 * len(datos))


def _dibujar_disponibilidad(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("disponibilidad")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Disponibilidad", SIN_DATOS_NUEVO)
    if not datos:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Disponibilidad", SIN_DATOS_PERIODO)
    seleccion = _datos(opciones, ("pct", "huecos"))
    filas = list(datos.items())
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Disponibilidad", 6.5, SECUNDARIO)
    if opciones.get("grafica") == "tabla":
        encabezado = ["Dispositivo", "Área"]
        if "pct" in seleccion:
            encabezado.append("Disponibilidad")
        if "huecos" in seleccion:
            encabezado.append("Huecos")
        cuerpo = []
        for _, info in filas:
            fila = [info.get("nombre", ""), info.get("area", "—")]
            if "pct" in seleccion:
                fila.append(f"{info['pct']:.1f} %")
            if "huecos" in seleccion:
                huecos = info.get("huecos") or []
                fila.append(f"{huecos[0]['minutos']} min" if huecos else "—")
            cuerpo.append(fila)
        _tabla_compacta(
            c, x, y - 26, ancho, alto - 30, encabezado, cuerpo, tam=6, recortar=(0,)
        )
    else:
        fila_y = y - 38
        for _, info in filas:
            c.setFont("Helvetica", 7)
            c.setFillColor(SECUNDARIO)
            c.drawString(x + 11, fila_y, (info.get("nombre") or "")[:34])
            c.setFillColor(PISTA)
            c.rect(x + 110, fila_y - 1, ancho - 160, 6, stroke=0, fill=1)
            c.setFillColor(VERDE if info["pct"] >= 90 else AVISO)
            c.rect(
                x + 110,
                fila_y - 1,
                (ancho - 160) * min(100, info["pct"]) / 100,
                6,
                stroke=0,
                fill=1,
            )
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(TINTA)
            c.drawRightString(x + ancho - 11, fila_y, f"{info['pct']:.1f} %")
            fila_y -= 16
        if "huecos" in seleccion:
            total = sum(len(info.get("huecos") or []) for _, info in filas)
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawString(
                x + 11,
                y - alto + 14,
                f"{total} huecos registrados" if total else "Sin huecos en el periodo",
            )
    return alto


def _alto_incidentes(hoja, opciones):
    datos = hoja.get("incidentes")
    if not datos:
        return 68
    return max(100, 34 + 16 * len(datos))


def _dibujar_incidentes(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("incidentes")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Incidentes", SIN_DATOS_NUEVO)
    if not datos:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Incidentes", SIN_DATOS_PERIODO)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Incidentes", 6.5, SECUNDARIO)
    if opciones.get("grafica") == "lista":
        fila_y = y - 36
        for incidente in datos:
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(TINTA)
            c.drawString(
                x + 11,
                fila_y,
                _recortar_texto(incidente.get("dispositivo", ""), 130, "Helvetica-Bold", 7),
            )
            c.setFont("Helvetica", 6.5)
            c.setFillColor(SECUNDARIO)
            c.drawString(
                x + 150,
                fila_y,
                _recortar_texto(
                    f"{incidente.get('variable_nombre') or incidente.get('variable', '')} · "
                    f"{_fecha_corta(_local(incidente['inicio']))} · "
                    f"{incidente.get('duracion_min', 0):.1f} min · "
                    f"pico {incidente.get('valor_pico', '')}",
                    ancho - 200,
                    "Helvetica",
                    6.5,
                ),
            )
            c.setFillColor(AVISO if incidente.get("nivel") == "PELIGRO" else TENUE)
            c.drawRightString(x + ancho - 11, fila_y, incidente.get("nivel", ""))
            fila_y -= 16
        return alto
    encabezado = ["Dispositivo", "Variable", "Inicio", "Duración", "Pico", "Nivel"]
    filas = [
        [
            incidente.get("dispositivo", ""),
            incidente.get("variable_nombre") or incidente.get("variable", ""),
            _fecha_corta(_local(incidente["inicio"])),
            f"{incidente.get('duracion_min', 0):.1f} min",
            f"{incidente.get('valor_pico', '')}",
            incidente.get("nivel", ""),
        ]
        for incidente in datos
    ]
    _tabla_compacta(
        c, x, y - 26, ancho, alto - 30, encabezado, filas, tam=6, recortar=(0, 1)
    )
    return alto


def _alto_observaciones(hoja, opciones):
    datos = hoja.get("observaciones")
    if not datos:
        return 68
    if opciones.get("grafica") == "tabla":
        filas = min(len(datos), 8)
        return max(100, 34 + 14 * (filas + 1) + (16 if len(datos) > filas else 0))
    return 220


def _dibujar_observaciones(c, x, y, ancho, alto, hoja, opciones):
    datos = hoja.get("observaciones")
    if datos is None:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Observaciones", SIN_DATOS_NUEVO)
    if not datos:
        return _mensaje_tarjeta(c, x, y, ancho, alto, "Observaciones", SIN_DATOS_PERIODO)
    _tarjeta(c, x, y, ancho, alto)
    _mayus(c, x + 11, y - 18, "Observaciones", 6.5, SECUNDARIO)
    if opciones.get("grafica") == "tabla":
        visibles = datos[:8]
        filas = [
            [
                _fecha_corta(_local(fila["fecha"])),
                fila.get("dispositivo", ""),
                fila.get("variable_nombre") or fila.get("variable", ""),
                fila.get("usuario", ""),
                fila.get("texto") or "",
            ]
            for fila in visibles
        ]
        _tabla_compacta(
            c,
            x,
            y - 26,
            ancho,
            alto - 30,
            ["Fecha", "Dispositivo", "Variable", "Quién", "Observación"],
            filas,
            tam=6,
            recortar=(4,),
        )
        if len(datos) > len(visibles):
            c.setFont("Helvetica", 6.5)
            c.setFillColor(TENUE)
            c.drawString(
                x + 11,
                y - alto + 8,
                f"y {len(datos) - len(visibles)} más en el sistema",
            )
        return alto
    fila_y = y - 36
    limite = y - alto + 12
    mostradas = 0
    for fila in datos:
        texto = (fila.get("texto") or "")[:220]
        parrafo = Paragraph(escape(texto), NOTA)
        _, alto_texto = parrafo.wrap(ancho - 22, 100)
        alto_entrada = 16 + alto_texto + 8
        if fila_y - alto_entrada < limite:
            break
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(TINTA)
        c.drawString(
            x + 11,
            fila_y,
            _recortar_texto(
                f"{fila.get('dispositivo', '')} · "
                f"{fila.get('variable_nombre') or fila.get('variable', '')}",
                ancho - 22,
                "Helvetica-Bold",
                7,
            ),
        )
        c.setFont("Helvetica", 6.5)
        c.setFillColor(TENUE)
        c.drawString(
            x + 11,
            fila_y - 10,
            f"{_fecha_corta(_local(fila['fecha']))} · {fila.get('usuario', '')}",
        )
        parrafo.drawOn(c, x + 11, fila_y - 16 - alto_texto)
        fila_y -= alto_entrada
        mostradas += 1
    if mostradas < len(datos):
        c.setFont("Helvetica", 6.5)
        c.setFillColor(TENUE)
        c.drawString(
            x + 11,
            limite,
            f"y {len(datos) - mostradas} más en el sistema",
        )
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
    if fuente == "cumplimiento":
        return _alto_cumplimiento(hoja, opciones)
    if fuente == "comparativo":
        return _alto_comparativo(hoja, opciones)
    if fuente == "dispositivos":
        return _alto_dispositivos(hoja)
    if fuente == "gestion_alertas":
        return _alto_gestion(hoja, opciones)
    if fuente == "disponibilidad":
        return _alto_disponibilidad(hoja, opciones)
    if fuente == "incidentes":
        return _alto_incidentes(hoja, opciones)
    if fuente == "observaciones":
        return _alto_observaciones(hoja, opciones)
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
    if fuente == "cumplimiento":
        return _dibujar_cumplimiento(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "comparativo":
        return _dibujar_comparativo(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "dispositivos":
        return _dibujar_dispositivos(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "gestion_alertas":
        return _dibujar_gestion(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "disponibilidad":
        return _dibujar_disponibilidad(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "incidentes":
        return _dibujar_incidentes(c, x, y, ancho, alto, hoja, opciones)
    if fuente == "observaciones":
        return _dibujar_observaciones(c, x, y, ancho, alto, hoja, opciones)
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
