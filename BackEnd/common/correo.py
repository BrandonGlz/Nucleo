# ruff: noqa: E501 — la plantilla HTML usa estilos en línea, que no caben en 100 columnas.
"""Correos de Núcleo con el formato de la marca.

Todos los correos salen con la misma plantilla: encabezado con el logo, una franja con el
color del nivel, el contenido y un pie con Nico. Se envían en HTML y en texto plano para los
clientes que no muestran HTML. El logo y la cara de Nico van incrustados (``cid:``), así que
se ven aunque el cliente bloquee las imágenes externas.

Los colores son los del sistema de diseño de la web (``FrontEnd/src/design-system``).
"""

from email.mime.image import MIMEImage
from email.utils import formataddr, parseaddr
from functools import cache
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.core.mail.message import SafeMIMEMultipart
from django.utils import timezone

IMAGENES = Path(__file__).resolve().parent / "correo_imagenes"

# Paleta oficial (tema claro del sistema de diseño)
FONDO = "#EAECE6"
SUPERFICIE = "#FFFFFF"
BORDE = "#DEE1D8"
TEXTO = "#121413"
TEXTO_2 = "#4A4F4B"
TEXTO_3 = "#62675F"
ACENTO = "#2BC47A"
OSCURO = "#121413"
OSCURO_TEXTO = "#9DA39E"

# Nivel → color de los íconos (los mismos de Lucide que usa la web, en PNG)
COLOR_ICONO = {"peligro": "rojo", "advertencia": "ambar"}

# Nivel → (color del texto, fondo suave, color de la franja)
NIVELES = {
    "peligro": ("#C4291C", "#FDE6E3", "#C4291C"),
    "advertencia": ("#9A5B00", "#FDF0D5", "#F5B53D"),
    "normal": ("#0F7A45", "#E3F4E8", "#2BC47A"),
    "info": ("#0F6E3F", "#D3F1E1", "#2BC47A"),
}
FUENTE = "'Plus Jakarta Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"


@cache
def _imagen(nombre):
    return (IMAGENES / f"{nombre}.png").read_bytes()


def _parte_imagen(nombre):
    parte = MIMEImage(_imagen(nombre), "png")
    parte.add_header("Content-ID", f"<{nombre}@nucleo>")
    parte.add_header("Content-Disposition", "inline", filename=f"{nombre}.png")
    return parte


class CorreoNucleo(EmailMultiAlternatives):
    """Arma ``mixed[alternative[texto, related[html, imágenes]], adjuntos]``.

    Así Gmail asocia las imágenes ``cid:`` al HTML y no las muestra como adjuntos.
    """

    imagenes = ()

    def _create_alternatives(self, msg):
        msg = super()._create_alternatives(msg)
        if self.imagenes and msg.is_multipart():
            partes = msg.get_payload()
            relacionado = SafeMIMEMultipart(_subtype="related", encoding=self.encoding)
            relacionado.attach(partes[-1])
            for nombre in self.imagenes:
                relacionado.attach(_parte_imagen(nombre))
            partes[-1] = relacionado
        return msg


REMITENTE = "Nico de Núcleo"


def remitente():
    """La dirección configurada, con Nico como nombre visible."""
    _, direccion = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return formataddr((REMITENTE, direccion or settings.DEFAULT_FROM_EMAIL))


def url_web(ruta=""):
    return f"{settings.NUCLEO_URL_WEB.rstrip('/')}{ruta}"


def url_subdominio(sub, ruta=""):
    """``admin.`` o ``nicoai.`` + el dominio de la web (en local, la web misma)."""
    web = urlparse(settings.NUCLEO_URL_WEB)
    host = web.hostname or ""
    if not host or host in ("localhost", "127.0.0.1"):
        return url_web(ruta)
    return f"{web.scheme}://{sub}.{host}{ruta}"


def _html(
    *, titulo, intro, nivel, etiqueta, icono, destacado, filas, parrafos, boton, motivo, previa
):
    color, suave, franja = NIVELES.get(nivel or "info", NIVELES["info"])
    e = escape
    partes = []
    if icono or etiqueta:
        celda_icono = (
            f'<td width="52" style="padding-right:12px;vertical-align:middle">'
            f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            f'<td width="40" height="40" align="center" valign="middle" '
            f'style="width:40px;height:40px;border-radius:12px;background:{suave}">'
            f'<img src="cid:{icono}@nucleo" width="22" height="22" alt="" '
            f'style="display:block;border:0"></td></tr></table></td>'
            if icono
            else ""
        )
        celda_etiqueta = (
            f'<td style="vertical-align:middle"><span style="display:inline-block;'
            f"padding:4px 12px;border-radius:999px;background:{suave};color:{color};"
            f'font-size:12px;font-weight:700;letter-spacing:.02em">{e(etiqueta)}</span></td>'
            if etiqueta
            else ""
        )
        partes.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            f"{celda_icono}{celda_etiqueta}</tr></table>"
        )
    partes.append(
        f'<h1 style="margin:14px 0 8px;font-size:22px;line-height:1.3;color:{TEXTO};'
        f'font-weight:800">{e(titulo)}</h1>'
    )
    if intro:
        partes.append(
            f'<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:{TEXTO_2}">'
            f"{e(intro)}</p>"
        )
    if destacado:
        nota = destacado.get("nota")
        partes.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin:0 0 20px;background:{suave};border-radius:14px"><tr>'
            f'<td style="padding:18px 20px">'
            f'<div style="font-size:12px;font-weight:700;color:{color};'
            f'letter-spacing:.02em">{e(destacado.get("etiqueta", ""))}</div>'
            f'<div style="margin-top:4px;font-size:34px;line-height:1.1;font-weight:800;'
            f'color:{color}">{e(destacado["valor"])}'
            f'<span style="font-size:16px;font-weight:700"> {e(destacado.get("unidad", ""))}'
            f"</span></div>"
            + (
                f'<div style="margin-top:6px;font-size:13px;color:{TEXTO_2}">{e(nota)}</div>'
                if nota
                else ""
            )
            + "</td></tr></table>"
        )
    for parrafo in parrafos:
        partes.append(
            f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:{TEXTO_2}">'
            f"{e(parrafo).replace(chr(10), '<br>')}</p>"
        )
    if filas:
        renglones = "".join(
            f'<tr><td style="padding:10px 0;border-top:1px solid {BORDE};font-size:13px;'
            f'color:{TEXTO_3};width:42%;vertical-align:top">{e(etiq)}</td>'
            f'<td style="padding:10px 0;border-top:1px solid {BORDE};font-size:14px;'
            f'color:{TEXTO};font-weight:600;vertical-align:top">{e(str(valor))}</td></tr>'
            for etiq, valor in filas
        )
        partes.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin:0 0 22px;border-bottom:1px solid {BORDE}">{renglones}</table>'
        )
    if boton:
        texto_boton, enlace = boton
        partes.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 6px">'
            f'<tr><td style="border-radius:999px;background:{ACENTO}">'
            f'<a href="{e(enlace)}" style="display:inline-block;padding:13px 26px;'
            f"font-size:15px;font-weight:700;color:{TEXTO};text-decoration:none;"
            f'border-radius:999px">{e(texto_boton)} &rarr;</a></td></tr></table>'
        )
    anio = timezone.localdate().year
    motivo_html = (
        f'<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:{TEXTO_3}">{e(motivo)}</p>'
        if motivo
        else ""
    )
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>{e(titulo)}</title></head>
<body style="margin:0;padding:0;background:{SUPERFICIE};font-family:{FUENTE}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{e(previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{SUPERFICIE}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid {BORDE};border-radius:16px;border-collapse:separate">
<tr><td style="background:{OSCURO};border-radius:15px 15px 0 0;padding:18px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="cid:logo@nucleo" width="96" height="40" alt="núcleo" style="display:block;border:0;color:{ACENTO};font-size:24px;font-weight:800;line-height:40px;font-family:{FUENTE}"></td>
<td align="right" style="font-size:12px;color:{OSCURO_TEXTO};font-family:{FUENTE}">Monitoreo ambiental</td>
</tr></table></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:{franja}">&nbsp;</td></tr>
<tr><td style="background:{SUPERFICIE};padding:28px 28px 30px;font-family:{FUENTE}">
{"".join(partes)}
</td></tr>
<tr><td style="background:{FONDO};border-radius:0 0 15px 15px;padding:18px 28px;font-family:{FUENTE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="48" style="vertical-align:top"><img src="cid:nico@nucleo" width="36" height="36" alt="Nico" style="display:block;border:0;border-radius:50%"></td>
<td style="vertical-align:top">
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:{TEXTO_2}">Atentamente, <b style="color:{TEXTO}">Nico</b> · su asistente en Núcleo</p>
{motivo_html}
<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:{TEXTO_3}">Este mensaje se generó automáticamente; le pedimos no responder a este correo.</p>
<p style="margin:8px 0 0;font-size:12px;color:{TEXTO_3}">
<a href="{e(url_web())}" style="color:#0F7A45;font-weight:700;text-decoration:none">bynucleo.com</a>
&nbsp;·&nbsp; © {anio} Núcleo · Monitoreo ambiental IoT</p>
</td></tr></table></td></tr>
</table></td></tr></table></body></html>"""


def _texto(*, titulo, intro, etiqueta, destacado, filas, parrafos, boton, motivo):
    lineas = [f"{etiqueta} · {titulo}" if etiqueta else titulo, ""]
    if intro:
        lineas += [intro, ""]
    if destacado:
        lineas.append(
            f"{destacado.get('etiqueta', 'Valor')}: {destacado['valor']} "
            f"{destacado.get('unidad', '')}".rstrip()
        )
        if destacado.get("nota"):
            lineas.append(destacado["nota"])
        lineas.append("")
    for parrafo in parrafos:
        lineas += [parrafo, ""]
    if filas:
        lineas += [f"{etiq}: {valor}" for etiq, valor in filas] + [""]
    if boton:
        lineas += [f"{boton[0]}: {boton[1]}", ""]
    lineas += ["Atentamente,", "Nico · su asistente en Núcleo", "", "—"]
    if motivo:
        lineas.append(motivo)
    lineas += [
        "Este mensaje se generó automáticamente; le pedimos no responder a este correo.",
        f"Núcleo · {url_web()}",
    ]
    return "\n".join(lineas)


def construir(
    destinatarios,
    asunto,
    *,
    titulo,
    intro="",
    nivel="info",
    etiqueta="",
    icono="",
    destacado=None,
    filas=(),
    parrafos=(),
    boton=None,
    motivo="",
    previa="",
    adjuntos=(),
):
    """Arma el correo (sin enviarlo). ``adjuntos``: tuplas ``(nombre, contenido, tipo)``."""
    datos = dict(
        titulo=titulo,
        intro=intro,
        etiqueta=etiqueta,
        destacado=destacado,
        filas=list(filas),
        parrafos=[p for p in parrafos if p],
        boton=boton,
        motivo=motivo,
    )
    icono_png = f"icono-{icono}-{COLOR_ICONO.get(nivel, 'verde')}" if icono else ""
    mensaje = CorreoNucleo(
        subject=asunto,
        body=_texto(**datos),
        from_email=remitente(),
        to=list(destinatarios),
    )
    mensaje.attach_alternative(
        _html(nivel=nivel, icono=icono_png, previa=previa or intro or titulo, **datos),
        "text/html",
    )
    mensaje.imagenes = ["logo", "nico"] + ([icono_png] if icono_png else [])
    for nombre, contenido, tipo in adjuntos:
        mensaje.attach(nombre, contenido, tipo)
    return mensaje


def enviar(destinatarios, asunto, **datos):
    """Envía el correo con la plantilla de Núcleo. Devuelve cuántos mensajes salieron."""
    return construir(destinatarios, asunto, **datos).send()


def numero(valor):
    """Quita los ceros sobrantes: 1829.00 → «1829», 28.10 → «28.1»."""
    texto = f"{valor:f}" if hasattr(valor, "as_tuple") else str(valor)
    return texto.rstrip("0").rstrip(".") if "." in texto else texto
