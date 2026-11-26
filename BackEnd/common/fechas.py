"""Fechas de un periodo para mostrarlas: en hora local y con el fin inclusivo.

Los periodos se guardan como ``[inicio, fin)``: un reporte semanal que acaba a la medianoche
del domingo 22 abarca hasta el sábado 21. Así lo muestran también la web y la app.
"""

from datetime import timedelta

from django.utils import timezone


def _local(fecha):
    return timezone.localtime(fecha) if timezone.is_aware(fecha) else fecha


def dias_periodo(inicio, fin):
    """``(primer_día, último_día)`` en hora local; el último es el del instante previo a ``fin``."""
    a = _local(inicio)
    b = _local(fin - timedelta(microseconds=1))
    return a.date(), max(a, b).date()


def periodo_texto(inicio, fin, corto=False):
    """«15/11/2026 al 21/11/2026» (o «15/11 al 21/11/2026» con ``corto``)."""
    a, b = dias_periodo(inicio, fin)
    return f"{a:%d/%m}{'' if corto else a.strftime('/%Y')} al {b:%d/%m/%Y}"

MESES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


def periodo_titulo(inicio, fin):
    """«1–25 nov 2026» o «28 dic 2025 – 4 ene 2026», con el fin exclusivo.

    Es el mismo formato que ``periodo()`` de la web; se usa en el título del reporte.
    """
    a, b = dias_periodo(inicio, fin)
    if a.year != b.year:
        return f"{a.day} {MESES[a.month - 1]} {a.year} – {b.day} {MESES[b.month - 1]} {b.year}"
    if a.month == b.month:
        return f"{a.day}–{b.day} {MESES[b.month - 1]} {b.year}"
    return f"{a.day} {MESES[a.month - 1]} – {b.day} {MESES[b.month - 1]} {b.year}"
