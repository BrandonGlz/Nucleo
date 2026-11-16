"""Códigos de un solo uso por tiempo (TOTP, RFC 6238) para la verificación en dos pasos.

Compatible con Google Authenticator, Microsoft Authenticator y similares: SHA-1, 6 dígitos y
pasos de 30 segundos. Solo usa la biblioteca estándar; el QR se dibuja con reportlab, que el
proyecto ya usa para los PDF.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

PASO_SEGUNDOS = 30
DIGITOS = 6
EMISOR = "Núcleo"


def generar_secreto():
    """Secreto aleatorio de 160 bits en base32 (sin relleno), como lo piden las apps."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _bytes_secreto(secreto):
    relleno = "=" * (-len(secreto) % 8)
    return base64.b32decode(secreto.upper() + relleno)


def paso_actual(ahora=None):
    return int((time.time() if ahora is None else ahora) // PASO_SEGUNDOS)


def codigo(secreto, paso):
    resumen = hmac.new(_bytes_secreto(secreto), struct.pack(">Q", paso), hashlib.sha1).digest()
    desplazamiento = resumen[-1] & 0x0F
    numero = struct.unpack(">I", resumen[desplazamiento : desplazamiento + 4])[0] & 0x7FFFFFFF
    return str(numero % 10**DIGITOS).zfill(DIGITOS)


def verificar(secreto, entrada, ultimo_paso=None, ahora=None, ventana=1):
    """Devuelve el paso del código si es válido (con ±``ventana`` pasos de tolerancia al reloj)
    o ``None``. Un código de un paso ya usado (``ultimo_paso``) no vale otra vez."""
    entrada = "".join(c for c in str(entrada or "") if c.isdigit())
    if len(entrada) != DIGITOS:
        return None
    actual = paso_actual(ahora)
    for paso in range(actual - ventana, actual + ventana + 1):
        if ultimo_paso is not None and paso <= ultimo_paso:
            continue
        if hmac.compare_digest(codigo(secreto, paso), entrada):
            return paso
    return None


def uri(secreto, cuenta):
    """URI ``otpauth://`` que leen las apps de autenticación (y que va dentro del QR)."""
    etiqueta = quote(f"{EMISOR}:{cuenta}")
    parametros = urlencode(
        {"secret": secreto, "issuer": EMISOR, "digits": DIGITOS, "period": PASO_SEGUNDOS}
    )
    return f"otpauth://totp/{etiqueta}?{parametros}"


def qr_svg(texto, tamano=220):
    """QR en SVG (texto) para mostrar en la web y en la app."""
    from reportlab.graphics import renderSVG
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing

    widget = QrCodeWidget(texto)
    x1, y1, x2, y2 = widget.getBounds()
    ancho, alto = x2 - x1, y2 - y1
    dibujo = Drawing(tamano, tamano, transform=[tamano / ancho, 0, 0, tamano / alto, 0, 0])
    dibujo.add(widget)
    svg = renderSVG.drawToString(dibujo)
    # Sin la declaración XML ni el DOCTYPE: se incrusta tal cual en la web y en la app.
    return svg[svg.index("<svg") :]


def generar_codigos_recuperacion(cantidad=10):
    """Códigos de un solo uso para entrar sin el teléfono (formato ``xxxxx-xxxxx``)."""
    alfabeto = "abcdefghjkmnpqrstuvwxyz23456789"
    codigos = []
    for _ in range(cantidad):
        crudo = "".join(secrets.choice(alfabeto) for _ in range(10))
        codigos.append(f"{crudo[:5]}-{crudo[5:]}")
    return codigos


def resumen_codigo_recuperacion(codigo_recuperacion):
    """Los códigos se guardan como SHA-256: son aleatorios y largos, no hace falta un hash lento."""
    limpio = "".join(c for c in codigo_recuperacion.lower() if c.isalnum())
    return hashlib.sha256(limpio.encode()).hexdigest()
