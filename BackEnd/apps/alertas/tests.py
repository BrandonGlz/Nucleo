from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.alertas.models import Alerta, Notificacion
from apps.usuarios.models import TelefonoPush
from common.testing import Escenario, PruebaBase, cliente_de


def crear_alerta(escenario, **extra):
    datos = {
        "umbral": escenario.umbral_temp,
        "lectura_num": 1,
        "lectura_fecha_hora": timezone.now(),
        "lectura_valor": 30,
        "nivel": Alerta.Nivel.PELIGRO,
        "tipo": Alerta.Tipo.POR_ENCIMA,
    }
    return Alerta.objects.create(**{**datos, **extra})


class AlertaApiTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.alerta = crear_alerta(self.e)

    def url(self, accion=""):
        return f"/api/v1/alertas/{self.alerta.pk}/{accion}"

    def test_listado_incluye_el_contexto_de_la_alerta(self):
        r = cliente_de(self.e.operador).get("/api/v1/alertas/", {"estado": "pendiente"})
        fila = r.json()["results"][0]
        self.assertEqual(fila["variable"], "TEMP")
        self.assertEqual(fila["lectura_valor"], "30.00")
        self.assertEqual(fila["nivel"], "PELIGRO")
        self.assertEqual(fila["advertencia_max"], "25.00")
        self.assertEqual(fila["peligro_max"], "28.00")

    def test_filtro_por_nivel(self):
        r = cliente_de(self.e.operador).get("/api/v1/alertas/", {"nivel": "advertencia"})
        self.assertEqual(r.json()["results"], [])

    def test_el_supervisor_atiende_la_alerta(self):
        r = cliente_de(self.e.supervisor).post(
            self.url("atender/"), {"observaciones": "Se abrió la ventana"}
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.alerta.refresh_from_db()
        self.assertEqual(self.alerta.estado, Alerta.Estado.ATENDIDA)
        self.assertEqual(self.alerta.atendida_por, self.e.supervisor)
        self.assertIsNotNone(self.alerta.fecha_atencion)

    def test_una_alerta_resuelta_no_se_vuelve_a_resolver(self):
        cliente = cliente_de(self.e.admin)
        self.assertEqual(cliente.post(self.url("descartar/")).status_code, 200)
        self.assertEqual(cliente.post(self.url("atender/")).status_code, 409)

    def test_operador_y_analista_no_atienden(self):
        for usuario in (self.e.operador, self.e.analista):
            self.assertEqual(cliente_de(usuario).post(self.url("atender/")).status_code, 403)

    def test_otra_organizacion_no_ve_la_alerta(self):
        otro = Escenario("b")
        self.assertEqual(cliente_de(otro.admin).get(self.url()).status_code, 404)

    def test_la_base_valida_tipo_y_estado(self):
        for campo, valor in (("tipo", "OTRO"), ("estado", "CERRADA"), ("nivel", "LEVE")):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Alerta.objects.filter(pk=self.alerta.pk).update(**{campo: valor})

    def test_solo_una_alerta_pendiente_por_umbral_y_nivel(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            crear_alerta(self.e, lectura_num=2)
        crear_alerta(self.e, lectura_num=3, nivel=Alerta.Nivel.ADVERTENCIA)
        Alerta.objects.filter(pk=self.alerta.pk).update(estado=Alerta.Estado.ATENDIDA)
        crear_alerta(self.e, lectura_num=4)

    def test_bandeja_de_notificaciones_propia(self):
        Notificacion.objects.create(
            alerta=self.alerta, usuario=self.e.supervisor, canal="CORREO", estado_envio="ENVIADA"
        )
        propio = cliente_de(self.e.supervisor).get("/api/v1/notificaciones/").json()["results"]
        ajeno = cliente_de(self.e.operador).get("/api/v1/notificaciones/").json()["results"]
        self.assertEqual(len(propio), 1)
        self.assertEqual(ajeno, [])

    def test_el_push_se_registra_con_su_telefono_y_solo_en_ese_canal(self):
        telefono = TelefonoPush.objects.create(
            usuario=self.e.operador, token_expo="ExponentPushToken[x]", plataforma="ANDROID"
        )
        Notificacion.objects.create(
            alerta=self.alerta,
            usuario=self.e.operador,
            telefono_push=telefono,
            canal="PUSH",
            estado_envio="ENVIADA",
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Notificacion.objects.create(
                alerta=self.alerta,
                usuario=self.e.operador,
                telefono_push=telefono,
                canal="CORREO",
                estado_envio="ENVIADA",
            )
        telefono.delete()
        self.assertIsNone(Notificacion.objects.get().telefono_push)


class PushExpoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.alerta = crear_alerta(self.e)
        self.telefono = TelefonoPush.objects.create(
            usuario=self.e.supervisor, token_expo="ExponentPushToken[abc]", plataforma="ANDROID"
        )

    def enviar(self, respuesta=None, error=None):
        from unittest import mock

        from apps.alertas import notificaciones

        alerta = Alerta.objects.select_related("umbral__variable", "umbral__dispositivo__area").get(
            pk=self.alerta.pk
        )
        with mock.patch.object(
            notificaciones, "_post_expo", side_effect=error, return_value=respuesta
        ) as post:
            return notificaciones.enviar_push(self.telefono, alerta), post

    def test_expo_acepta_el_mensaje(self):
        salio, post = self.enviar({"data": {"status": "ok", "id": "1"}})
        self.assertTrue(salio)
        carga = post.call_args.args[0]
        self.assertEqual(carga["to"], "ExponentPushToken[abc]")
        self.assertEqual(carga["priority"], "high")
        self.assertIn("Peligro", carga["title"])
        self.assertEqual(carga["data"], {"alerta": self.alerta.pk, "nivel": "PELIGRO"})

    def test_un_token_invalido_elimina_el_telefono(self):
        respuesta = {"data": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}
        salio, _ = self.enviar(respuesta)
        self.assertFalse(salio)
        self.assertFalse(TelefonoPush.objects.filter(pk=self.telefono.pk).exists())

    def test_otro_error_de_expo_conserva_el_telefono(self):
        salio, _ = self.enviar({"data": {"status": "error", "message": "x"}})
        self.assertFalse(salio)
        self.assertTrue(TelefonoPush.objects.filter(pk=self.telefono.pk).exists())

    def test_una_falla_de_red_no_lanza_excepciones(self):
        salio, _ = self.enviar(error=OSError("sin red"))
        self.assertFalse(salio)

    def test_con_el_canal_habilitado_se_avisa_a_cada_telefono(self):
        from unittest import mock

        from django.test import override_settings

        from apps.alertas import services

        with override_settings(NUCLEO_PUSH_HABILITADO=True):
            envios = services.destinatarios(self.e.dispositivo)
        canales = sorted((u.pk, c) for u, c, _ in envios)
        self.assertEqual(
            canales, sorted([(self.e.supervisor.pk, "CORREO"), (self.e.supervisor.pk, "PUSH")])
        )
        with mock.patch("apps.alertas.notificaciones._post_expo") as post:
            envios = services.destinatarios(self.e.dispositivo)
            self.assertEqual(post.call_count, 0)
        self.assertEqual([c for _, c, _ in envios], ["CORREO"])
