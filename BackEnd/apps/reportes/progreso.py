"""Paso visible de un reporte que se está generando, compartido por los procesos."""

from django.conf import settings

_cliente = None
TTL = 30 * 60


def _redis():
    """Cliente perezoso; sin REDIS_URL no hay progreso compartido y no se escribe nada."""
    global _cliente
    if not settings.REDIS_URL:
        return None
    if _cliente is None:
        try:
            import redis

            _cliente = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2)
        except Exception:  # noqa: BLE001 - el progreso no debe romper el reporte
            return None
    return _cliente


def guardar_paso(reporte, paso):
    """Guarda 1..4 para ``reporte:paso:<num>``; cualquier fallo de Redis se ignora."""
    if not getattr(reporte, "num", None):
        return
    cliente = _redis()
    if cliente is None:
        return
    try:
        cliente.set(f"reporte:paso:{reporte.num}", int(paso), ex=TTL)
    except Exception:  # noqa: BLE001 - el reporte sigue aunque falle el progreso
        return


def leer_paso(reporte):
    """Devuelve el paso actual o ``None`` si no hay Redis o no hay dato."""
    if not getattr(reporte, "num", None):
        return None
    cliente = _redis()
    if cliente is None:
        return None
    try:
        valor = cliente.get(f"reporte:paso:{reporte.num}")
        return int(valor) if valor is not None else None
    except Exception:  # noqa: BLE001
        return None
