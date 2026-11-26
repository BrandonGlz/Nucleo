"""Título visible de un reporte: formato, lugar y periodo."""

from common.fechas import periodo_titulo


def titulo_reporte(reporte):
    """«<formato> · <lugar> · <periodo>»; sin formato, «Reporte».

    El lugar es el área o «Toda la organización». El periodo se calcula al vuelo con el fin
    exclusivo, así los reportes viejos también toman el título nuevo.
    """
    # getattr: la vista previa y las pruebas arman reportes en memoria sin todos los campos.
    version = getattr(reporte, "formato_version", None)
    formato = getattr(getattr(version, "formato", None), "nombre", None) or "Reporte"
    area = getattr(reporte, "area", None)
    lugar = area.nombre if area is not None else "Toda la organización"
    return f"{formato} · {lugar} · {periodo_titulo(reporte.periodo_inicio, reporte.periodo_fin)}"
