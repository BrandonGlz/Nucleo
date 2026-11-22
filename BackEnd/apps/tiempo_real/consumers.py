"""Conexión WebSocket de la web y la app móvil: alertas y estados en vivo."""

from urllib.parse import parse_qs, urlparse

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.http import parse_cookie

from apps.tiempo_real.eventos import AVISO_NUEVO, grupo_de, grupo_de_usuario
from common import roles
from common.autenticacion import token_de_cookie, usuario_de_token

CODIGO_NO_AUTORIZADO = 4401


def origen_permitido(scope):
    """El Origin del navegador es el mismo host que atiende el canal o uno de CORS."""
    cabeceras = dict(scope.get("headers") or [])
    origen = cabeceras.get(b"origin", b"").decode()
    if not origen:
        return False
    host = cabeceras.get(b"host", b"").decode()
    return urlparse(origen).netloc == host or origen in settings.CORS_ALLOWED_ORIGINS


class PanelConsumer(AsyncJsonWebsocketConsumer):
    """Se conecta con ``/ws/panel/?token=<token de la API>``.

    La conexión recibe solo los eventos de su organización que su rol puede ver: el
    operador, los de su dispositivo; el supervisor y el analista con área, los de su área;
    el administrador, todos. Además se une al grupo personal ``usuario.<num>``, por donde
    llegan sus avisos de la campana (``aviso.nuevo``). La caducidad del token se revisa al
    conectar.
    """

    async def connect(self):
        consulta = parse_qs(self.scope["query_string"].decode())
        clave = (consulta.get("token") or [""])[0]
        if not clave and origen_permitido(self.scope):
            # La web no conoce su token: llega en la cookie HttpOnly. Solo se acepta desde un
            # origen propio, para que otra página no abra el canal con la cookie del usuario.
            cabeceras = dict(self.scope.get("headers") or [])
            clave = token_de_cookie(parse_cookie(cabeceras.get(b"cookie", b"").decode()))
        usuario = await database_sync_to_async(usuario_de_token)(clave)
        if usuario is None or usuario.organizacion_id is None:
            await self.close(code=CODIGO_NO_AUTORIZADO)
            return
        self.usuario = usuario
        self.grupo = grupo_de(usuario.organizacion_id)
        self.grupo_personal = grupo_de_usuario(usuario.pk)
        await self.channel_layer.group_add(self.grupo, self.channel_name)
        await self.channel_layer.group_add(self.grupo_personal, self.channel_name)
        await self.accept()
        await self.send_json({"tipo": "conectado", "usuario": usuario.pk})

    async def disconnect(self, code):
        if hasattr(self, "grupo"):
            await self.channel_layer.group_discard(self.grupo, self.channel_name)
        if hasattr(self, "grupo_personal"):
            await self.channel_layer.group_discard(self.grupo_personal, self.channel_name)

    async def receive_json(self, contenido, **kwargs):
        if contenido.get("tipo") == "ping":
            await self.send_json({"tipo": "pong"})

    def _en_alcance(self, evento):
        usuario = self.usuario
        if usuario.rol_id == roles.OPERADOR:
            return evento["operador"] == usuario.pk
        if usuario.rol_id in (roles.SUPERVISOR, roles.ANALISTA) and usuario.area_id:
            return evento["area"] == usuario.area_id
        return True

    async def evento(self, evento):
        if self._en_alcance(evento):
            await self.send_json({"tipo": evento["tipo"], "datos": evento["datos"]})

    async def aviso_usuario(self, evento):
        # ``datos`` repite el aviso para los clientes que leen todos los eventos igual.
        await self.send_json(
            {"tipo": AVISO_NUEVO, "aviso": evento["datos"], "datos": evento["datos"]}
        )
