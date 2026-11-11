"""Protección del servidor para Nico AI.

El agente comparte la laptop (8 GB) con las bases de datos, Redis, MQTT y Ollama. Según la
memoria libre se limita cuántas peticiones puede hacer cada usuario por minuto y, si hace falta,
se apaga la IA (Ollama) y el agente responde solo con las reglas y las herramientas. Si las
lecturas no responden o se activó el modo mantenimiento, el agente lo dice en vez de fallar.

Niveles (umbrales en ``settings``):
- normal: memoria libre ≥ ``NUCLEO_AGENTE_RAM_ALTA_MB``; ``NUCLEO_AGENTE_LIMITE_NORMAL``
  peticiones por minuto.
- alta: por debajo; ``NUCLEO_AGENTE_LIMITE_ALTA`` por minuto y sin IA.
- critica: por debajo de ``NUCLEO_AGENTE_RAM_CRITICA_MB``; ``NUCLEO_AGENTE_LIMITE_CRITICA``
  y sin IA.
- mantenimiento: archivo ``NUCLEO_AGENTE_MANTENIMIENTO`` presente (``manage.py
  agente_mantenimiento on|off``) o TimescaleDB sin respuesta.
"""

import time
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import connections
from django.utils import timezone

_cache = {"t": 0.0, "mb": None}


def memoria_disponible_mb():
    """MemAvailable de Linux en MB (cacheada 5 s); None si no se puede leer."""
    ahora = time.monotonic()
    if ahora - _cache["t"] < 5:
        return _cache["mb"]
    mb = None
    try:
        with open("/proc/meminfo", encoding="ascii") as f:
            for linea in f:
                if linea.startswith("MemAvailable:"):
                    mb = int(linea.split()[1]) // 1024
                    break
    except OSError:
        mb = None
    _cache.update(t=ahora, mb=mb)
    return mb


def archivo_mantenimiento():
    return Path(settings.NUCLEO_AGENTE_MANTENIMIENTO)


def en_mantenimiento():
    return archivo_mantenimiento().exists()


def lecturas_disponibles():
    """True si TimescaleDB responde (sin ella el agente no tiene datos que dar)."""
    try:
        connections["iot"].ensure_connection()
        return True
    except Exception:  # noqa: BLE001 - cualquier fallo de conexión cuenta como caída
        return False


def nivel():
    if en_mantenimiento() or not lecturas_disponibles():
        return "mantenimiento"
    mb = memoria_disponible_mb()
    if mb is None or mb >= settings.NUCLEO_AGENTE_RAM_ALTA_MB:
        return "normal"
    if mb >= settings.NUCLEO_AGENTE_RAM_CRITICA_MB:
        return "alta"
    return "critica"


def ia_suspendida():
    """Con poca memoria la IA (Ollama) no se usa: el agente sigue con reglas y herramientas."""
    mb = memoria_disponible_mb()
    return mb is not None and mb < settings.NUCLEO_AGENTE_RAM_ALTA_MB


LIMITES = {
    "normal": "NUCLEO_AGENTE_LIMITE_NORMAL",
    "alta": "NUCLEO_AGENTE_LIMITE_ALTA",
    "critica": "NUCLEO_AGENTE_LIMITE_CRITICA",
}


def excede_limite(usuario, actual):
    """True si el usuario ya hizo en el último minuto las peticiones que permite ``actual``."""
    from apps.reportes.models import PreguntaAgente

    limite = getattr(settings, LIMITES[actual])
    recientes = PreguntaAgente.objects.filter(
        usuario=usuario, fecha__gte=timezone.now() - timedelta(minutes=1)
    ).values_list("datos", flat=True)
    # En Python: las precargas de sugerencias no cuentan (exclude() en JSON descarta las nulas).
    return sum(1 for d in recientes if not (d or {}).get("precarga")) >= limite
