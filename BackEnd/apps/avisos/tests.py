import tempfile
from datetime import timedelta
from io import StringIO
from unittest import mock

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone

from apps.avisos import servicios
from apps.avisos.models import Aviso
from apps.dispositivos.services import marcar_sin_conexion
from apps.mediciones import services as ingesta
from apps.reportes import ia
from apps.reportes.models import ProgramacionReporte
from common import roles
from common.autenticacion import crear_sesion
from common.testing import Escenario, PruebaBase, PruebaTransaccional, cliente_de

Tipo, Nivel = Aviso.Tipo, Aviso.Nivel


def de(usuario, **filtros):
    return list(Aviso.objects.filter(usuario=usuario, **filtros).order_by("num"))


class ModeloYServicioTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_crea_uno_por_usuario_sin_duplicar(self):
        creados = servicios.crear_avisos(
            [self.e.admin, self.e.admin.pk, self.e.supervisor],
            Tipo.DISPOSITIVO,
            Nivel.ADVERTENCIA,
            "Nodo sin conexión",
            "Detalle",
            "/dispositivos/1",
        )
        self.assertEqual(len(creados), 2)
        aviso = de(self.e.admin)[0]
        self.assertIsNone(aviso.leido_en)
        self.assertFalse(aviso.leido)
        self.assertIsNotNone(aviso.fecha_hora)

    def test_no_repite_el_mismo_aviso_sin_leer_en_30_minutos(self):
        def crear():
            return servicios.crear_avisos(
                [self.e.admin], Tipo.USUARIO, Nivel.INFO, "Alta", "", "/usuarios"
            )

        self.assertEqual(len(crear()), 1)
        self.assertEqual(crear(), [])
        # Otra ruta o tipo sí es otro aviso.
        self.assertEqual(
            len(servicios.crear_avisos([self.e.admin], Tipo.USUARIO, Nivel.INFO, "Alta", "", "/")),
            1,
        )
        # Leído, se vuelve a avisar.
        Aviso.objects.filter(usuario=self.e.admin).update(leido_en=timezone.now())
        self.assertEqual(len(crear()), 1)
        # Sin leer pero de hace más de 30 minutos, también.
        Aviso.objects.filter(usuario=self.e.admin).update(
            fecha_hora=timezone.now() - timedelta(minutes=31)
        )
        self.assertEqual(len(crear()), 1)

    def test_recorta_los_textos(self):
        aviso = servicios.crear_avisos(
            [self.e.admin], Tipo.NICO, Nivel.INFO, "t" * 200, "d" * 400, "/agente"
        )[0]
        aviso.refresh_from_db()
        self.assertEqual((len(aviso.titulo), len(aviso.detalle)), (120, 300))

    def test_la_base_rechaza_tipo_nivel_o_ruta_invalidos(self):
        for campos in ({"tipo": "OTRO"}, {"nivel": "OK"}, {"ruta": "http://x"}):
            datos = {"usuario": self.e.admin, "tipo": "NICO", "nivel": "INFO", "titulo": "x"}
            datos.update(campos)
            with self.assertRaises(IntegrityError), transaction.atomic():
                Aviso.objects.create(**datos)


class ApiTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = cliente_de(self.e.admin)
        crear = servicios.crear_avisos
        self.a1 = crear([self.e.admin], Tipo.DISPOSITIVO, Nivel.ADVERTENCIA, "Uno", "", "/")[0]
        self.a2 = crear([self.e.admin], Tipo.REPORTE, Nivel.INFO, "Dos", "", "/reportes")[0]
        self.a3 = crear([self.e.admin], Tipo.REPORTE, Nivel.INFO, "Tres", "", "/reportes")[0]
        self.ajeno = crear([self.e.supervisor], Tipo.USUARIO, Nivel.INFO, "Ajeno", "", "/")[0]

    def test_lista_solo_los_propios_paginada(self):
        cuerpo = self.cliente.get("/api/v1/avisos/").json()
        self.assertEqual(cuerpo["count"], 3)
        nums = [a["num"] for a in cuerpo["results"]]
        self.assertNotIn(self.ajeno.num, nums)
        self.assertEqual(
            set(cuerpo["results"][0]),
            {"num", "tipo", "nivel", "titulo", "detalle", "ruta", "fecha_hora", "leido"},
        )

    def test_filtros_por_tipo_y_no_leidos(self):
        cuerpo = self.cliente.get("/api/v1/avisos/?tipo=reporte").json()
        self.assertEqual({a["num"] for a in cuerpo["results"]}, {self.a2.num, self.a3.num})
        self.a2.leido_en = timezone.now()
        self.a2.save()
        cuerpo = self.cliente.get("/api/v1/avisos/?no_leidos=1").json()
        self.assertEqual({a["num"] for a in cuerpo["results"]}, {self.a1.num, self.a3.num})

    def test_conteo_y_marcar_algunos_o_todos(self):
        self.assertEqual(self.cliente.get("/api/v1/avisos/conteo/").json(), {"no_leidos": 3})
        r = self.cliente.post(
            "/api/v1/avisos/marcar-leidos/",
            {"nums": [self.a1.num, self.ajeno.num]},
            format="json",
        )
        self.assertEqual(r.json(), {"marcados": 1})
        self.ajeno.refresh_from_db()
        self.assertIsNone(self.ajeno.leido_en)  # no se marcan los de otro usuario
        self.assertEqual(self.cliente.get("/api/v1/avisos/conteo/").json(), {"no_leidos": 2})
        r = self.cliente.post("/api/v1/avisos/marcar-leidos/", {"nums": []}, format="json")
        self.assertEqual(r.json(), {"marcados": 2})
        r = self.cliente.post("/api/v1/avisos/marcar-leidos/", {}, format="json")
        self.assertEqual(r.json(), {"marcados": 0})
        lista = self.cliente.get("/api/v1/avisos/").json()["results"]
        self.assertTrue(all(a["leido"] for a in lista))

    def test_sin_sesion_no_entra(self):
        from rest_framework.test import APIClient

        self.assertEqual(APIClient().get("/api/v1/avisos/").status_code, 401)


class DispositivoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro_admin = self.e.usuario(roles.ADMIN, "admin-2", area=None)
        self.super_otra_area = self.e.usuario(roles.SUPERVISOR, "super-2", area=self.e.otra_area)
        self.e.dispositivo.estado_dispositivo_id = roles.DISPOSITIVO_EN_LINEA
        self.e.dispositivo.ultima_conexion = timezone.now() - timedelta(hours=1)
        self.e.dispositivo.save()
        self.ruta = f"/dispositivos/{self.e.dispositivo.pk}"

    def test_sin_conexion_avisa_a_sus_responsables(self):
        self.assertEqual(len(marcar_sin_conexion()), 1)
        avisados = set(
            Aviso.objects.filter(tipo=Tipo.DISPOSITIVO, ruta=self.ruta).values_list(
                "usuario_id", flat=True
            )
        )
        self.assertEqual(
            avisados,
            {self.e.admin.pk, self.otro_admin.pk, self.e.supervisor.pk, self.e.operador.pk},
        )
        aviso = de(self.e.operador)[0]
        self.assertEqual(aviso.nivel, Nivel.ADVERTENCIA)
        self.assertIn("sin conexión", aviso.titulo)

    def test_reconectado_y_bateria_baja(self):
        marcar_sin_conexion()
        ingesta.procesar_mensaje(
            {
                "dispositivo": self.e.dispositivo.codigo_mqtt,
                "bateria": 5,
                "lecturas": [{"sensor": "DHT22", "variable": "TEMP", "valor": 22}],
            }
        )
        titulos = [(a.nivel, a.titulo) for a in de(self.e.admin)]
        self.assertIn((Nivel.INFO, f"{self.e.dispositivo.nombre} volvió a conectarse"), titulos)
        self.assertIn((Nivel.ADVERTENCIA, f"Batería baja en {self.e.dispositivo.nombre}"), titulos)

    def test_un_usuario_inactivo_no_recibe(self):
        self.e.supervisor.estado_usuario_id = roles.USUARIO_INACTIVO
        self.e.supervisor.save()
        marcar_sin_conexion()
        self.assertEqual(de(self.e.supervisor), [])

    def test_un_fallo_no_interrumpe_la_deteccion(self):
        with mock.patch.object(servicios, "crear_avisos", side_effect=RuntimeError("caído")):
            self.assertEqual(len(marcar_sin_conexion()), 1)


class UsuarioTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro_admin = self.e.usuario(roles.ADMIN, "admin-2", area=None)
        self.cliente = cliente_de(self.e.admin)

    def test_alta_avisa_a_los_demas_administradores(self):
        r = self.cliente.post(
            "/api/v1/usuarios/",
            {
                "nombre": "Nueva",
                "primer_apellido": "Persona",
                "correo": "nueva@prueba.local",
                "rol": roles.ANALISTA,
                "area": self.e.area.pk,
                "password": "Clave-de-prueba-2026",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(de(self.e.admin), [])  # quien hizo la acción no
        aviso = de(self.otro_admin)[0]
        self.assertEqual((aviso.tipo, aviso.ruta), (Tipo.USUARIO, "/usuarios"))
        self.assertIn("Nueva Persona", aviso.titulo)

    def test_cambio_de_rol_avisa_a_admins_y_al_usuario(self):
        r = self.cliente.patch(
            f"/api/v1/usuarios/{self.e.analista.pk}/",
            {"rol": roles.SUPERVISOR, "area": self.e.otra_area.pk},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        aviso = de(self.otro_admin)[0]
        self.assertIn("Cambio de usuario", aviso.titulo)
        self.assertIn("Supervisor", aviso.detalle)
        propio = de(self.e.analista)[0]
        self.assertEqual((propio.nivel, propio.ruta), (Nivel.INFO, "/perfil"))
        self.assertIn(self.e.otra_area.nombre, propio.detalle)

    def test_editar_otro_dato_no_avisa(self):
        self.cliente.patch(
            f"/api/v1/usuarios/{self.e.analista.pk}/", {"nombre": "Otro"}, format="json"
        )
        self.assertFalse(Aviso.objects.exists())

    def test_baja_avisa_a_los_administradores(self):
        r = self.cliente.delete(f"/api/v1/usuarios/{self.e.operador.pk}/")
        self.assertEqual(r.status_code, 204)
        aviso = de(self.otro_admin)[0]
        self.assertEqual(aviso.nivel, Nivel.ADVERTENCIA)
        self.assertIn("Baja de usuario", aviso.titulo)
        self.assertEqual(de(self.e.operador), [])


class ReporteTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.carpeta = tempfile.TemporaryDirectory()
        self.addCleanup(self.carpeta.cleanup)
        ajustes = override_settings(IA_PROVEEDOR="prueba", MEDIA_ROOT=self.carpeta.name)
        ajustes.enable()
        self.addCleanup(ajustes.disable)
        ia.PROVEEDORES["prueba"] = lambda instrucciones, cifras: "Todo normal."
        self.addCleanup(ia.PROVEEDORES.pop, "prueba")

    def test_reporte_manual_avisa_a_quien_lo_pidio(self):
        ahora = timezone.now()
        r = cliente_de(self.e.analista).post(
            "/api/v1/reportes/",
            {
                "periodo_inicio": (ahora - timedelta(days=1)).isoformat(),
                "periodo_fin": ahora.isoformat(),
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        aviso = de(self.e.analista)[0]
        self.assertEqual((aviso.tipo, aviso.ruta), (Tipo.REPORTE, "/reportes"))
        self.assertIn("listo", aviso.titulo)
        self.assertEqual(Aviso.objects.count(), 1)

    def test_programado_avisa_a_destinatarios_y_a_quien_lo_programo(self):
        ProgramacionReporte.objects.create(
            organizacion=self.e.organizacion,
            creada_por=self.e.analista,
            frecuencia="DIARIA",
            destinatarios=[self.e.supervisor.pk, self.e.operador.pk],
            proxima_ejecucion=timezone.now() - timedelta(hours=1),
        )
        call_command("generar_reportes_programados", stdout=StringIO())
        avisados = set(Aviso.objects.values_list("usuario_id", flat=True))
        self.assertEqual(avisados, {self.e.supervisor.pk, self.e.operador.pk, self.e.analista.pk})
        self.assertTrue(all("programado" in a.titulo for a in Aviso.objects.all()))


class NicoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        # Un operador sin acceso al agente y un analista de otra área no reciben.
        self.analista_otra = self.e.usuario(roles.ANALISTA, "analista-2", area=self.e.otra_area)

    def test_agente_sin_conexion_y_de_vuelta(self):
        from apps.nico import avisos as avisos_nico
        from apps.reportes import carga, puente

        estado = {"activo": True}
        cola = mock.Mock()
        cola.activo.side_effect = lambda codigo: estado["activo"]
        with (
            override_settings(
                IA_PUENTE_CLAVE="clave",
                IA_PUENTE_DISPOSITIVOS=[self.e.dispositivo.codigo_mqtt],
                NUCLEO_AGENTE_RAM_ALTA_MB=1000,
            ),
            mock.patch.object(puente, "cola", return_value=cola),
            mock.patch.object(carga, "memoria_disponible_mb", return_value=4000),
        ):
            avisos_nico.vigilar()  # primera revisión: solo anota el estado
            self.assertFalse(Aviso.objects.exists())
            estado["activo"] = False
            avisos_nico.vigilar()
            avisados = set(Aviso.objects.values_list("usuario_id", flat=True))
            self.assertEqual(avisados, {self.e.admin.pk, self.e.supervisor.pk, self.e.analista.pk})
            aviso = de(self.e.admin)[0]
            self.assertEqual(
                (aviso.tipo, aviso.nivel, aviso.ruta), ("NICO", "ADVERTENCIA", "/agente")
            )
            # Con acceso al agente, el operador también recibe.
            self.e.operador.acceso_agente = True
            self.e.operador.save()
            estado["activo"] = True
            avisos_nico.vigilar()
            self.assertEqual(de(self.e.operador)[0].nivel, Nivel.INFO)
        self.assertEqual(de(self.analista_otra), [])
        self.assertEqual(de(self.e.plataforma), [])


class CanalEnVivoTests(PruebaTransaccional):
    def setUp(self):
        self.e = Escenario()

    async def conectar(self, usuario):
        from config.asgi import application

        clave = await sync_to_async(lambda: crear_sesion(usuario)[1])()
        canal = WebsocketCommunicator(application, f"/ws/panel/?token={clave}")
        conectado, _ = await canal.connect()
        self.assertTrue(conectado)
        self.assertEqual((await canal.receive_json_from())["tipo"], "conectado")
        return canal

    async def test_el_aviso_llega_solo_a_su_destinatario(self):
        propio = await self.conectar(self.e.analista)
        ajeno = await self.conectar(self.e.admin)
        await sync_to_async(servicios.crear_avisos)(
            [self.e.analista], Tipo.REPORTE, Nivel.INFO, "Reporte 1 listo", "", "/reportes"
        )
        evento = await propio.receive_json_from()
        self.assertEqual(evento["tipo"], "aviso.nuevo")
        self.assertEqual(evento["aviso"]["titulo"], "Reporte 1 listo")
        self.assertEqual(evento["aviso"]["ruta"], "/reportes")
        self.assertFalse(evento["aviso"]["leido"])
        self.assertTrue(await ajeno.receive_nothing(timeout=0.3))
        await propio.disconnect()
        await ajeno.disconnect()


class SembrarDemoTests(PruebaBase):
    @override_settings(DEBUG=True, IA_PROVEEDOR="")
    def test_la_demo_deja_avisos_en_la_campana(self):
        call_command("sembrar_demo", dias=3, stdout=StringIO())
        tipos = set(Aviso.objects.values_list("tipo", flat=True))
        self.assertTrue({Tipo.DISPOSITIVO, Tipo.USUARIO, Tipo.NICO} <= tipos, tipos)
        self.assertTrue(Aviso.objects.filter(leido_en__isnull=True).exists())
