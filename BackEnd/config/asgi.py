"""Punto de entrada ASGI de Núcleo: HTTP (API) y WebSocket (canal en vivo)."""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

# Se inicializa Django antes de importar las rutas, que cargan modelos.
aplicacion_http = get_asgi_application()

from apps.tiempo_real.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": aplicacion_http,
        "websocket": URLRouter(websocket_urlpatterns),
    }
)
