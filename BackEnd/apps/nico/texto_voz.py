"""Prepara el texto que Nico lee en voz alta: cifras, unidades, siglas, fechas y horas en palabras.

El motor de voz lee mejor palabras que símbolos: «21.5 °C» se vuelve «veintiuno punto cinco
grados», «68 %» «sesenta y ocho por ciento», «CO2» «ce o dos» y «Núcleo A-01» «Núcleo A cero
uno». Se escribe para el español de México: el punto es el separador decimal y la coma separa
miles («1,250» = mil doscientos cincuenta).
"""

import re

_UNIDADES = (
    "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince "
    "dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro "
    "veinticinco veintiséis veintisiete veintiocho veintinueve"
).split()
_DECENAS = "_ _ _ treinta cuarenta cincuenta sesenta setenta ochenta noventa".split()
_CENTENAS = (
    "_ ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos "
    "ochocientos novecientos"
).split()
_MESES = (
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre"
).split()


def _menor_de_mil(n):
    if n < 30:
        return _UNIDADES[n]
    if n < 100:
        d, u = divmod(n, 10)
        return _DECENAS[d] + (f" y {_UNIDADES[u]}" if u else "")
    if n == 100:
        return "cien"
    c, resto = divmod(n, 100)
    return _CENTENAS[c] + (f" {_menor_de_mil(resto)}" if resto else "")


def numero_a_palabras(n):
    """Entero a palabras («1250» → «mil doscientos cincuenta»). Hasta billones."""
    if n < 0:
        return f"menos {numero_a_palabras(-n)}"
    if n < 1000:
        return _menor_de_mil(n)
    if n < 1_000_000:
        miles, resto = divmod(n, 1000)
        cabeza = "mil" if miles == 1 else f"{_apocopar(_menor_de_mil(miles))} mil"
        return cabeza + (f" {_menor_de_mil(resto)}" if resto else "")
    if n < 10**12:
        millones, resto = divmod(n, 1_000_000)
        cabeza = (
            "un millón" if millones == 1 else f"{_apocopar(numero_a_palabras(millones))} millones"
        )
        return cabeza + (f" {numero_a_palabras(resto)}" if resto else "")
    return " ".join(_UNIDADES[int(d)] for d in str(n))


def _apocopar(palabras):
    # Delante de un sustantivo: «veintiuno grados» → «veintiún grados», «uno por ciento» se queda.
    return re.sub(r"(veinti)?uno$", lambda m: "veintiún" if m.group(1) else "un", palabras)


def _femenino(palabras):
    # Delante de un sustantivo femenino: «doscientos uno lecturas» → «doscientas una lecturas».
    palabras = re.sub(r"ientos\b", "ientas", palabras)
    return re.sub(r"uno$", "una", palabras)


# Sustantivos femeninos frecuentes en las respuestas de Nico (concordancia de «una», «doscientas»).
_FEMENINOS = re.compile(
    r"(?:lecturas?|alertas?|alarmas?|horas?|veces|vez|semanas?|personas?|áreas?|partes?|zonas?"
    r"|salas?|empresas?|organizaciones|organización|notificaciones|notificación|mediciones"
    r"|medición|cuentas?|fallas?|variables?|unidades|unidad|ubicaciones|ubicación|incidencias?"
    r"|páginas?|preguntas?|respuestas?|sesiones|sesión|naves?|oficinas?|plantas?|bodegas?)\b",
    re.IGNORECASE,
)
# Palabras tras las que «uno» se queda entero («uno de ellos», «uno punto cinco»).
_NO_SUSTANTIVO = re.compile(
    r"(?:de|del|a|al|y|e|o|u|en|por|para|con|sin|que|punto|mil|millón|millones|es|son|fue|más"
    r"|menos|hasta|desde|entre|sobre|contra|como|ya|no|sí|se|lo|la|las|los|el)\b",
    re.IGNORECASE,
)


def _cifra_en_contexto(m):
    dicho = _cifra(m.group(1))
    siguiente = m.string[m.end() :].lstrip()
    if "punto" in dicho or not siguiente[:1].isalpha():
        return dicho
    if _FEMENINOS.match(siguiente):
        return _femenino(dicho)
    if not _NO_SUSTANTIVO.match(siguiente):
        return _apocopar(dicho)
    return dicho


def _cifra(texto):
    """«21.5», «1,250», «-3» o «0.05» a palabras."""
    negativo = texto.startswith(("-", "−"))
    texto = texto.lstrip("-−")
    entero, _, decimales = texto.partition(".")
    dicho = numero_a_palabras(int(entero.replace(",", "") or "0"))
    if decimales:
        # Los ceros a la izquierda se leen («0.05» → «cero punto cero cinco»).
        ceros = len(decimales) - len(decimales.lstrip("0"))
        resto = decimales.lstrip("0")
        partes = ["cero"] * ceros + ([numero_a_palabras(int(resto))] if resto else [])
        dicho += " punto " + " ".join(partes)
    return f"menos {dicho}" if negativo else dicho


# Una cifra, con miles separados por coma (1,250 o 12,500,000) o sin ellos y decimales opcionales.
_NUMERO = r"[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"

_LETRAS = {
    "A": "a", "B": "be", "C": "ce", "D": "de", "E": "e", "F": "efe", "G": "ge", "H": "hache",
    "I": "i", "J": "jota", "K": "ka", "L": "ele", "M": "eme", "N": "ene", "Ñ": "eñe", "O": "o",
    "P": "pe", "Q": "cu", "R": "erre", "S": "ese", "T": "te", "U": "u", "V": "uve", "W": "doble u",
    "X": "equis", "Y": "ye", "Z": "zeta",
}  # fmt: skip


def deletrear(sigla):
    return " ".join(_LETRAS.get(letra, letra) for letra in sigla.upper())


def _digitos(texto):
    return " ".join(_UNIDADES[int(d)] for d in texto)


# Unidades después de una cifra. El orden importa: las más largas primero.
_UNIDADES_MEDIDA = [
    (r"°\s?C\b|ºC\b|° centígrados", "grados", True),
    (r"°\s?F\b", "grados Fahrenheit", True),
    (r"°", "grados", True),
    (r"%\s?HR\b|%\s?RH\b", "por ciento de humedad", False),
    (r"%", "por ciento", False),
    (r"ppm\b", "partes por millón", False),
    (r"ppb\b", "partes por billón", False),
    (r"(?:µg|ug|μg)/m(?:³|3)\b", "microgramos por metro cúbico", True),
    (r"mg/m(?:³|3)\b", "miligramos por metro cúbico", True),
    (r"hPa\b", "hectopascales", True),
    (r"km/h\b", "kilómetros por hora", True),
    (r"kWh\b", "kilovatios hora", True),
    (r"dBm?\b", "decibeles", True),
    (r"ms\b", "milisegundos", True),
    (r"min\b", "minutos", True),
    (r"(?:h|hrs?)\b(?!\w)", "horas", True),
    (r"s\b(?![\w'])", "segundos", True),
    (r"V\b", "voltios", True),
    (r"mAh\b", "miliamperios hora", True),
    (r"MB\b", "megabytes", True),
    (r"GB\b", "gigabytes", True),
]

# Siglas y términos que el motor lee mal tal cual. Se aplican antes de leer las cifras.
_TERMINOS = [
    (r"\bCO(?:2|₂)\b", "ce o dos"),
    (r"\bNO(?:2|₂)\b", "ene o dos"),
    (r"\bO(?:3|₃)\b", "ozono"),
    (r"\bPM\s?2[.,]5\b", "pe eme dos punto cinco"),
    (r"\bPM\s?10\b", "pe eme diez"),
    (r"\bCOVs?\b|\bTVOC\b", "compuestos orgánicos volátiles"),
    (r"\bESP32\b", "e ese pe treinta y dos"),
    (r"\bIoT\b", "internet de las cosas"),
    (r"\bMQTT\b", "eme cu te te"),
    (r"\bWi-?Fi\b", "wifi"),
    (r"\bAPK\b", "a pe ka"),
    (r"\bIA\b", "i a"),
    (r"\bNico\s+AI\b", "Nico"),
    (r"\bAI\b", "i a"),
    (r"\bAPI\b", "a pe i"),
    (r"\bURL\b", "u erre ele"),
    (r"\bPDF\b", "pe de efe"),
    (r"\bCSV\b", "ce ese uve"),
    (r"\bOK\b|\bok\b|\bOk\b", "okey"),
    (r"(?<!%)(?<!% )\bHR\b", "humedad relativa"),
    (r"\b24/7\b", "a toda hora"),
    (r"\bTEMP\b", "temperatura"),
    (r"\bHUM\b", "humedad"),
    (r"\bAIRE\b", "aire"),
    (r"\bvs\.?(?=\s)", "contra"),
    (r"\baprox\.(?=\s)", "aproximadamente"),
    (r"\bmáx\.(?=\s)|\bmax\.(?=\s)", "máximo"),
    (r"\bmín\.(?=\s)", "mínimo"),
    (r"\bprom\.(?=\s)", "promedio"),
]


def _fecha(m):
    if m.group("anio1"):
        anio, mes, dia = m.group("anio1"), m.group("mes1"), m.group("dia1")
    else:
        dia, mes, anio = m.group("dia2"), m.group("mes2"), m.group("anio2")
    d, me = int(dia), int(mes)
    if not (1 <= d <= 31 and 1 <= me <= 12):
        return m.group(0)
    dicho = f"{'primero' if d == 1 else numero_a_palabras(d)} de {_MESES[me - 1]}"
    if anio:
        a = int(anio) if len(anio) == 4 else 2000 + int(anio)
        dicho += f" de {numero_a_palabras(a)}"
    return dicho


def _hora(m):
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return m.group(0)
    if mi == 0:
        return f"{numero_a_palabras(h)} horas" if h != 1 else "una en punto"
    minutos = numero_a_palabras(mi) if mi >= 10 else f"cero {numero_a_palabras(mi)}"
    return f"{'una' if h == 1 else numero_a_palabras(h)} {minutos}"


def _codigo(m):
    # «NC-0501» → «ene ce cero cinco cero uno»; «A-01» → «A cero uno».
    letras, cifras = m.group(1), m.group(2)
    dicho_letras = letras if len(letras) == 1 else deletrear(letras)
    return f"{dicho_letras} {_digitos(cifras)}"


_SINGULAR = {
    "grados": "un grado",
    "minutos": "un minuto",
    "segundos": "un segundo",
    "horas": "una hora",
}

_ORDINALES = ("primer segundo tercer cuarto quinto sexto séptimo octavo noveno décimo").split()


def _ordinal(m):
    n, sufijo = int(m.group(1)), m.group(2)
    if not 1 <= n <= 10:
        return m.group(0)
    palabra = _ORDINALES[n - 1]
    if sufijo in ("a", "ª"):
        return f"{palabra}a" if n in (1, 3) else f"{palabra[:-1]}a"
    if n in (1, 3) and sufijo in ("ero", "ro", "º"):
        return f"{palabra}o"
    return palabra


def _con_unidad(m):
    cifra, unidad = m.group(1), m.group(2)
    for patron, palabras, sustantivo in _UNIDADES_MEDIDA:
        if re.fullmatch(patron, unidad):
            if cifra == "1" and palabras in _SINGULAR:
                return _SINGULAR[palabras]
            dicho = _cifra(cifra)
            if palabras.startswith("partes") and "punto" not in dicho:
                dicho = _femenino(dicho)
            elif sustantivo and "punto" not in dicho:
                dicho = _apocopar(dicho)
            return f"{dicho} {palabras}"
    return m.group(0)


_PATRON_UNIDAD = "|".join(f"(?:{p})" for p, _, _ in _UNIDADES_MEDIDA)


def normalizar(texto):
    """Texto listo para el motor de voz: sin símbolos que no se leen bien."""
    t = texto.replace("\u00a0", " ").replace("\u202f", " ")  # espacios duros
    t = re.sub(r"\s*[›»→]\s*", ", ", t)  # rutas de menú (Histórico › Comparar)
    for patron, palabras in _TERMINOS:
        t = re.sub(patron, palabras, t)
    # Fechas: 2026-11-19 y 19/11/2026 (o 19/11).
    t = re.sub(
        r"\b(?:(?P<anio1>\d{4})-(?P<mes1>\d{1,2})-(?P<dia1>\d{1,2})"
        r"|(?P<dia2>\d{1,2})/(?P<mes2>\d{1,2})(?:/(?P<anio2>\d{4}|\d{2}))?)\b",
        _fecha,
        t,
    )
    t = re.sub(r"\b(\d{1,2}):(\d{2})\b(?:\s?(?:h|hrs|horas)\b)?", _hora, t)
    # Códigos de equipos: letras, guion y cifras (NC-0501, A-01).
    t = re.sub(r"\b([A-ZÑ]{1,4})-(\d{1,6})\b", _codigo, t)
    # Versiones (v1.2.3) y ordinales (1er, 3ro, 2do, 1ª).
    t = re.sub(
        r"\bv?(\d+(?:\.\d+){2,})\b",
        lambda m: (
            "versión " + " punto ".join(numero_a_palabras(int(x)) for x in m.group(1).split("."))
        ),
        t,
    )
    t = re.sub(r"\b(\d{1,2})(er|ero|ro|do|to|vo|no|mo|º|ª)(?!\w)", _ordinal, t)
    # Rangos «20-25 °C» o «20–25»: «20 a 25».
    t = re.sub(rf"(?<![\w.,])({_NUMERO})\s?[-–—]\s?({_NUMERO})(?![\w])", r"\1 a \2", t)
    t = re.sub(rf"(?<![\w.,])({_NUMERO})\s?({_PATRON_UNIDAD})", _con_unidad, t)
    t = re.sub(rf"(?<![\w.,])({_NUMERO})(?![\w])", _cifra_en_contexto, t)
    # Cifras pegadas a letras que quedaron (p. ej. «x2» o «12B»): se leen como número.
    t = re.sub(r"\d+", lambda m: numero_a_palabras(int(m.group(0))), t)
    t = re.sub(r"\s*&\s*", " y ", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()
