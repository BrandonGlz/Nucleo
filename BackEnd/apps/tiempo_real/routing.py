from django.urls import path

from apps.tiempo_real.consumers import PanelConsumer

websocket_urlpatterns = [path("ws/panel/", PanelConsumer.as_asgi())]
