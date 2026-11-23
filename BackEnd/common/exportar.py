"""Exportación a CSV de las consultas de la API (lecturas, alertas y alertas de seguridad).

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


# Un texto que empieza así se tomaría como fórmula en Excel o LibreOffice (inyección CSV):
# correos de intentos fallidos, notas y observaciones los escribe cualquiera.
_FORMULA = ("=", "+", "-", "@", "\t", "\r")


def _celda(valor):
    if isinstance(valor, str) and valor.startswith(_FORMULA):
        return "'" + valor
    return valor


def _lineas(encabezado, filas):
    escritor = csv.writer(_Eco())
    yield "\ufeff" + escritor.writerow(encabezado)
    for fila in itertools.islice(filas, settings.NUCLEO_EXPORTAR_MAX_FILAS):
        yield escritor.writerow([_celda(v) for v in fila])


def respuesta_csv(request, nombre, encabezado, filas, archivo=None):
    """CSV en streaming de ``filas`` bajo ``encabezado``, auditado como exportación de ``nombre``.

    ``archivo`` es el nombre del adjunto; por omisión ``nucleo-<nombre>-AAAAMMDD-HHMM.csv``.
    """
    from apps.auditoria.models import RegistroAuditoria
    from apps.auditoria.servicios import registrar

    consulta = request.META.get("QUERY_STRING", "")
    registrar(
        RegistroAuditoria.Accion.EXPORTAR,
        organizacion_id=getattr(request.user, "organizacion_id", None),
        recurso=nombre,
        descripcion=f"CSV de {nombre}" + (f" ({consulta})" if consulta else ""),
    )
    archivo = archivo or f"nucleo-{nombre}-{timezone.localtime():%Y%m%d-%H%M}.csv"
    respuesta = StreamingHttpResponse(
        _lineas(encabezado, filas), content_type="text/csv; charset=utf-8"
    )
    respuesta["Content-Disposition"] = f'attachment; filename="{archivo}"'
    return respuesta
