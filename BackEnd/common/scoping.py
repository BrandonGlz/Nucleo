"""Aislamiento de datos: qué registros puede ver cada usuario.

Toda la información cuelga de una organización. Dentro de ella, el rol acota
más: el operador solo ve su dispositivo asignado y el supervisor y el analista
con área asignada solo ven su área. El administrador de plataforma no pertenece a
ninguna organización, por lo que no ve dispositivos, sensores ni lecturas.
"""

from apps.dispositivos.models import Dispositivo, Sensor
from apps.organizaciones.models import Area
from apps.usuarios.models import Usuario
from common import roles


def areas_visibles(usuario):
    consulta = Area.objects.filter(organizacion_id=usuario.organizacion_id)
    if usuario.rol_id != roles.ADMIN and usuario.area_id:
        consulta = consulta.filter(pk=usuario.area_id)
    return consulta


def dispositivos_visibles(usuario):
    consulta = Dispositivo.objects.filter(area__organizacion_id=usuario.organizacion_id)
    if usuario.rol_id == roles.OPERADOR:
        return consulta.filter(operador_id=usuario.pk)
    if usuario.rol_id != roles.ADMIN and usuario.area_id:
        return consulta.filter(area_id=usuario.area_id)
    return consulta


def sensores_visibles(usuario):
    return Sensor.objects.filter(dispositivo__in=dispositivos_visibles(usuario))


def usuarios_gestionables(usuario):
    """Usuarios que puede consultar y administrar: todos los de su organización
    (administrador) o los operadores de su área (supervisor)."""
    consulta = Usuario.objects.filter(organizacion_id=usuario.organizacion_id)
    if usuario.rol_id == roles.SUPERVISOR:
        return consulta.filter(rol_id=roles.OPERADOR, area_id=usuario.area_id)
    return consulta
