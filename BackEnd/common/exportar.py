"""Exportación a CSV de las consultas de la API (lecturas y alertas).

El archivo se genera mientras se descarga (sin cargarlo entero en memoria), con BOM para que
Excel reconozca los acentos, y se corta en ``NUCLEO_EXPORTAR_MAX_FILAS``. Cada exportación queda
en la bitácora de auditoría.
"""

import csv
import itertools

from django.conf import settings
from django.http import StreamingHttpResponse
from django.utils import timezone


class _Eco:
    def write(self, valor):
        return valor


def _lineas(encabezado, filas):
    escritor = csv.writer(_Eco())
    yield "﻿" + escritor.writerow(encabezado)
    for fila in itertools.islice(filas, settings.NUCLEO_EXPORTAR_MAX_FILAS):
        yield escritor.writerow(fila)


def respuesta_csv(request, nombre, encabezado, filas):
    from apps.auditoria.models import RegistroAuditoria
    from apps.auditoria.servicios import registrar

    consulta = request.META.get("QUERY_STRING", "")
    registrar(
        RegistroAuditoria.Accion.EXPORTAR,
        organizacion_id=getattr(request.user, "organizacion_id", None),
        recurso=nombre,
        descripcion=f"CSV de {nombre}" + (f" ({consulta})" if consulta else ""),
    )
    archivo = f"nucleo-{nombre}-{timezone.localtime():%Y%m%d-%H%M}.csv"
    respuesta = StreamingHttpResponse(
        _lineas(encabezado, filas), content_type="text/csv; charset=utf-8"
    )
    respuesta["Content-Disposition"] = f'attachment; filename="{archivo}"'
    return respuesta
