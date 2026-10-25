"""Conexión WebSocket de la web y la app móvil: alertas y estados en vivo."""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.tiempo_real.eventos import grupo_de
from common import roles
from common.autenticacion import usuario_de_token

CODIGO_NO_AUTORIZADO = 4401


class PanelConsumer(AsyncJsonWebsocketConsumer):
    """Se conecta con ``/ws/panel/?token=<token de la API>``.

    La conexión recibe solo los eventos de su organización que su rol puede ver: el
    operador, los de su dispositivo; el supervisor y el analista con área, los de su área;
    el administrador, todos. La caducidad del token se revisa al conectar.
    """

    async def connect(self):
        consulta = parse_qs(self.scope["query_string"].decode())
        clave = (consulta.get("token") or [""])[0]
        usuario = await database_sync_to_async(usuario_de_token)(clave)
        if usuario is None or usuario.organizacion_id is None:
            await self.close(code=CODIGO_NO_AUTORIZADO)
            return
        self.usuario = usuario
        self.grupo = grupo_de(usuario.organizacion_id)
        await self.channel_layer.group_add(self.grupo, self.channel_name)
        await self.accept()
        await self.send_json({"tipo": "conectado", "usuario": usuario.pk})

    async def disconnect(self, code):
        if hasattr(self, "grupo"):
            await self.channel_layer.group_discard(self.grupo, self.channel_name)

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
