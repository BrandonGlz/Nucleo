"""Redacción del texto de los reportes con un servicio externo de IA.

Las cifras las calcula el backend (``servicios.calcular_cifras``); la IA solo
redacta. El proveedor está por definir: mientras ``IA_PROVEEDOR`` no tenga un
valor soportado, los reportes y el agente no están disponibles, pero el
monitoreo y las alertas siguen operando.
"""

import json

from django.conf import settings


class IANoDisponible(Exception):
    """El servicio de IA no está configurado o no responde."""


INSTRUCCIONES = (
    "Redacta en español un reporte breve sobre el comportamiento ambiental del periodo. "
    "Usa únicamente las cifras proporcionadas; no inventes valores ni los redondees de otra "
    "forma. Describe tendencias, picos y alertas."
)

PROVEEDORES = {}


def redactar(cifras):
    """Devuelve el texto del reporte a partir de las cifras ya calculadas."""
    proveedor = PROVEEDORES.get(settings.IA_PROVEEDOR)
    if proveedor is None:
        raise IANoDisponible("El servicio de inteligencia artificial no está configurado.")
    try:
        return proveedor(INSTRUCCIONES, json.dumps(cifras, ensure_ascii=False))
    except Exception as error:
        raise IANoDisponible("El servicio de inteligencia artificial no respondió.") from error
