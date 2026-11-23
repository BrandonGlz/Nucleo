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
