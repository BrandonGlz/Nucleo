"""Consultas de lecturas en TimescaleDB.

Las lecturas viven en ``nucleo_iot`` y los dispositivos, sensores y variables en
``nucleo_db``; no se pueden combinar en una sola consulta. Por eso primero se resuelven
en ``nucleo_db`` los ``sensor_num`` del alcance del usuario y luego se consultan las
lecturas con ellos.
"""

from apps.catalogos.models import VariableAmbiental
from apps.mediciones.models import Lectura
from common.scoping import sensores_visibles


def sensores_del_alcance(usuario, dispositivo=None):
    """``{sensor_num: dispositivo_num}`` de los sensores que el usuario puede consultar."""
    consulta = sensores_visibles(usuario)
    if dispositivo is not None:
        consulta = consulta.filter(dispositivo_id=dispositivo)
    return dict(consulta.values_list("num", "dispositivo_id"))


def unidades():
    """``{variable_codigo: unidad}`` de los catálogos."""
    return dict(VariableAmbiental.objects.values_list("codigo", "unidad"))


def lecturas_de(sensores):
    """Lecturas de los sensores dados, de la más reciente a la más antigua."""
    return Lectura.objects.filter(sensor_num__in=list(sensores))


def ultimas_por_variable(sensores):
    """Última lectura estabilizada de cada variable, para el panel en tiempo real."""
    return (
        lecturas_de(sensores)
        .filter(estabilizada=True)
        .order_by("variable_codigo", "-fecha_hora")
        .distinct("variable_codigo")
    )
