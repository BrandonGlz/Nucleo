"""IP real del cliente detrás de Cloudflare Tunnel y Caddy.

En producción todas las peticiones llegan a Daphne desde Caddy (``127.0.0.1``), así que
``REMOTE_ADDR`` es siempre la misma. ``cloudflared`` agrega ``CF-Connecting-IP`` con la IP del
visitante y Cloudflare pisa cualquier valor que mande el cliente; como Caddy solo escucha en
``127.0.0.1``, nadie llega a Daphne sin pasar por el túnel. Por eso, con
``NUCLEO_CONFIAR_CF_CONNECTING_IP`` activo, esa cabecera es confiable.
"""

import ipaddress

from django.conf import settings
from rest_framework.throttling import ScopedRateThrottle


def _ip_valida(valor):
    try:
        return str(ipaddress.ip_address((valor or "").strip()))
    except ValueError:
        return None


def ip_cliente(request):
    """IP del visitante: la de Cloudflare si se confía en ella, o ``REMOTE_ADDR``."""
    meta = getattr(request, "META", {})
    if settings.NUCLEO_CONFIAR_CF_CONNECTING_IP:
        ip = _ip_valida(meta.get("HTTP_CF_CONNECTING_IP"))
        if ip:
            return ip
    return _ip_valida(meta.get("REMOTE_ADDR"))


class LimitePorIP(ScopedRateThrottle):
    """Límite de peticiones por IP real. Sin esto, detrás del túnel todas las visitas
    compartirían la IP de Caddy y el límite del inicio de sesión sería global."""

    def get_ident(self, request):
        return ip_cliente(request) or super().get_ident(request)
