from datetime import timedelta

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.utils import timezone
from rest_framework.authtoken.models import Token

from apps.mediciones import services
from common import roles
from common.testing import Escenario, PruebaTransaccional, cliente_de


def mensaje(codigo, valor=22, **extra):
    return {
        "dispositivo": codigo,
        "lecturas": [{"sensor": "DHT22", "variable": "TEMP", "valor": valor}],
        **extra,
    }


class CanalEnVivoTests(PruebaTransaccional):
    def setUp(self):
        self.e = Escenario()
        self.e.dispositivo.estado_dispositivo_id = roles.DISPOSITIVO_EN_LINEA
        self.e.dispositivo.save()
        self.codigo = self.e.dispositivo.codigo_mqtt
        self.abiertos = []

    def token_de(self, usuario):
        cliente_de(usuario)  # crea el token
        return Token.objects.get(user=usuario).key

    async def conectar(self, usuario):
        from config.asgi import application

        clave = await sync_to_async(self.token_de)(usuario)
        canal = WebsocketCommunicator(application, f"/ws/panel/?token={clave}")
        conectado, _ = await canal.connect()
        if conectado:
            self.abiertos.append(canal)
            self.assertEqual((await canal.receive_json_from())["tipo"], "conectado")
        return canal, conectado

    async def cerrar_todo(self):
        for canal in self.abiertos:
            await canal.disconnect()

    def ingestar(self, datos):
        return services.procesar_mensaje(datos)

    async def test_sin_token_o_con_token_falso_se_rechaza(self):
        from config.asgi import application

        for ruta in ("/ws/panel/", "/ws/panel/?token=inventado"):
            canal = WebsocketCommunicator(application, ruta)
            conectado, codigo = await canal.connect()
            self.assertFalse(conectado)
            self.assertEqual(codigo, 4401)

    async def test_un_token_caducado_se_rechaza(self):
        clave = await sync_to_async(self.token_de)(self.e.operador)
        await sync_to_async(Token.objects.filter(key=clave).update)(
            created=timezone.now() - timedelta(days=8)
        )
        from config.asgi import application

        conectado, _ = await WebsocketCommunicator(
            application, f"/ws/panel/?token={clave}"
        ).connect()
        self.assertFalse(conectado)

    async def test_el_administrador_de_plataforma_no_se_conecta(self):
        _, conectado = await self.conectar(self.e.plataforma)
        self.assertFalse(conectado)

    async def test_responde_al_ping(self):
        canal, _ = await self.conectar(self.e.admin)
        await canal.send_json_to({"tipo": "ping"})
        self.assertEqual((await canal.receive_json_from())["tipo"], "pong")
        await self.cerrar_todo()

    async def test_una_alerta_nueva_llega_a_quien_la_puede_ver(self):
        admin, _ = await self.conectar(self.e.admin)
        analista, _ = await self.conectar(self.e.analista)
        operador, _ = await self.conectar(self.e.operador)
        await sync_to_async(self.ingestar)(mensaje(self.codigo, 29))
        for canal in (admin, analista, operador):
            evento = await canal.receive_json_from()
            self.assertEqual(evento["tipo"], "alerta.nueva")
            self.assertEqual(evento["datos"]["nivel"], "PELIGRO")
            self.assertEqual(evento["datos"]["variable"], "TEMP")
            self.assertEqual(evento["datos"]["valor"], "29.00")
            self.assertEqual(evento["datos"]["dispositivo"], self.e.dispositivo.pk)
        await self.cerrar_todo()

    async def test_no_llega_a_otra_organizacion_ni_a_otro_operador(self):
        otra = await sync_to_async(Escenario)("b")
        ajeno, _ = await self.conectar(otra.admin)
        ajeno_operador, _ = await self.conectar(otra.operador)
        await sync_to_async(self.ingestar)(mensaje(self.codigo, 29))
        self.assertTrue(await ajeno.receive_nothing(timeout=0.3))
        self.assertTrue(await ajeno_operador.receive_nothing(timeout=0.3))
        await self.cerrar_todo()

    async def test_el_operador_no_ve_los_eventos_de_otros_dispositivos(self):
        from apps.dispositivos.models import Dispositivo

        otro_operador = await sync_to_async(self.e.usuario)(roles.OPERADOR, "oper-2")
        otro = await sync_to_async(Dispositivo.objects.create)(
            area=self.e.area,
            estado_dispositivo_id=roles.DISPOSITIVO_EN_LINEA,
            operador=otro_operador,
            registrado_por=self.e.admin,
            nombre="Nodo 2",
            codigo_mqtt="NUC-002",
        )
        canal, _ = await self.conectar(otro_operador)
        await sync_to_async(self.ingestar)(mensaje(self.codigo, 29))
        self.assertTrue(await canal.receive_nothing(timeout=0.3))
        self.assertIsNotNone(otro.pk)
        await self.cerrar_todo()

    async def test_el_cambio_de_estado_del_dispositivo_se_publica(self):
        canal, _ = await self.conectar(self.e.supervisor)
        await sync_to_async(self.ingestar)(mensaje(self.codigo, aire_estabilizado=False))
        evento = await canal.receive_json_from()
        self.assertEqual(evento["tipo"], "dispositivo.estado")
        self.assertEqual(evento["datos"]["estado"], roles.DISPOSITIVO_CALENTANDO)
        # Otro mensaje en el mismo estado no repite el evento.
        await sync_to_async(self.ingestar)(mensaje(self.codigo, aire_estabilizado=False))
        self.assertTrue(await canal.receive_nothing(timeout=0.3))
        await self.cerrar_todo()

    async def test_atender_una_alerta_se_publica(self):
        await sync_to_async(self.ingestar)(mensaje(self.codigo, 29))
        canal, _ = await self.conectar(self.e.admin)
        from apps.alertas.models import Alerta

        alerta = await sync_to_async(Alerta.objects.get)()

        def atender():
            return cliente_de(self.e.supervisor).post(
                f"/api/v1/alertas/{alerta.pk}/atender/", {"observaciones": "ok"}
            )

        respuesta = await sync_to_async(atender)()
        self.assertEqual(respuesta.status_code, 200)
        evento = await canal.receive_json_from()
        self.assertEqual(evento["tipo"], "alerta.atendida")
        self.assertEqual(evento["datos"]["estado"], "ATENDIDA")
        await self.cerrar_todo()

    async def test_sin_conexion_se_publica(self):
        from apps.dispositivos.services import marcar_sin_conexion

        def preparar_y_marcar():
            self.e.dispositivo.ultima_conexion = timezone.now() - timedelta(hours=1)
            self.e.dispositivo.save()
            return marcar_sin_conexion()

        canal, _ = await self.conectar(self.e.admin)
        marcados = await sync_to_async(preparar_y_marcar)()
        self.assertEqual(len(marcados), 1)
        evento = await canal.receive_json_from()
        self.assertEqual(evento["datos"]["estado"], roles.DISPOSITIVO_SIN_CONEXION)
        await self.cerrar_todo()
