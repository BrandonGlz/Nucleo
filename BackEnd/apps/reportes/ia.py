"""Redacción del texto de los reportes con un servicio externo de IA.

Las cifras las calcula el backend (``servicios.calcular_cifras``); la IA solo
redacta. ``IA_PROVEEDOR=local`` usa una redacción con plantillas a partir de las
cifras, sin servicio externo; mientras ``IA_PROVEEDOR`` no tenga un valor soportado,
los reportes no están disponibles, pero el monitoreo y las alertas siguen operando.
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

# El largo lo elige el formato del reporte; no cambia el modelo ni el contexto del proveedor.
INSTRUCCIONES_LARGO = {
    "breve": " Escribe un solo párrafo de 3 a 4 frases.",
    "normal": "",
    "detallado": " Escribe hasta 4 párrafos, con detalle de cada variable y de las alertas.",
}
LARGOS = tuple(INSTRUCCIONES_LARGO)

NIVEL = {"PELIGRO": "de peligro", "ADVERTENCIA": "de advertencia"}


def _fmt(valor, unidad):
    if valor is None:
        return "—"
    decimales = 0 if unidad == "ppm" else 1
    return f"{valor:.{decimales}f} {unidad}"


def redaccion_local(_instrucciones, cifras_json):
    """Texto del reporte armado solo con las cifras (sin servicio externo)."""
    cifras = json.loads(cifras_json)
    variables = cifras.get("variables", {})
    alertas = cifras.get("alertas", {})
    if not variables:
        return "No hubo lecturas estabilizadas en el periodo, así que no hay cifras que reportar."
    parrafos = []
    partes = []
    for v in variables.values():
        partes.append(
            f"{v['nombre'].lower()} promedió {_fmt(v['promedio'], v['unidad'])} "
            f"(mínimo {_fmt(v['minimo'], v['unidad'])}, máximo {_fmt(v['maximo'], v['unidad'])})"
        )
    parrafos.append("Durante el periodo, " + "; ".join(partes) + ".")
    total = alertas.get("total", 0)
    if total:
        por_variable = alertas.get("por_variable", {})
        principal = max(por_variable, key=por_variable.get) if por_variable else None
        por_nivel = alertas.get("por_nivel", {})
        detalle = ", ".join(f"{n} {NIVEL.get(k, k.lower())}" for k, n in por_nivel.items())
        texto = f"Se registraron {total} alertas ({detalle})."
        if principal and principal in variables:
            pico = variables[principal]
            texto += (
                f" La mayoría fue de {pico['nombre'].lower()}, con su valor más alto de "
                f"{_fmt(pico['maximo'], pico['unidad'])}; conviene revisar las condiciones "
                "del área en esos horarios."
            )
        pendientes = alertas.get("por_estado", {}).get("PENDIENTE", 0)
        if pendientes:
            texto += (
                " Queda 1 sin atender." if pendientes == 1 else f" Quedan {pendientes} sin atender."
            )
        parrafos.append(texto)
    else:
        parrafos.append(
            "No hubo alertas: todas las lecturas se mantuvieron dentro de los umbrales."
        )
    return "\n\n".join(parrafos)


PROVEEDORES = {"local": redaccion_local}


def redactar(cifras, largo="normal"):
    """Devuelve el texto del reporte a partir de las cifras ya calculadas.

    ``largo`` es ``breve``, ``normal`` o ``detallado`` y solo ajusta la instrucción; el
    modelo y su contexto no cambian.
    """
    if largo not in INSTRUCCIONES_LARGO:
        raise ValueError(f"Largo de análisis desconocido: {largo}")
    proveedor = PROVEEDORES.get(settings.IA_PROVEEDOR)
    if proveedor is None:
        raise IANoDisponible("El servicio de inteligencia artificial no está configurado.")
    instrucciones = INSTRUCCIONES + INSTRUCCIONES_LARGO[largo]
    try:
        return proveedor(instrucciones, json.dumps(cifras, ensure_ascii=False))
    except Exception as error:
        raise IANoDisponible("El servicio de inteligencia artificial no respondió.") from error
