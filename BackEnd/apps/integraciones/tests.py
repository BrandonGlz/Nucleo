import hashlib
import hmac
import json
from unittest import mock

from rest_framework.test import APIClient

from apps.alertas.models import Alerta
from apps.integraciones import envio
from apps.integraciones.models import TokenAPI, Webhook
from common.testing import Escenario, PruebaBase, cliente_de

PUBLICA = [(2, 1, 6, "", ("93.184.216.34", 443))]
PRIVADA = [(2, 1, 6, "", ("127.0.0.1", 443))]


class TokenAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otra = Escenario("b")

    def crear(self):
        r = cliente_de(self.e.plataforma).post(
            f"/api/v1/integraciones/tokens/?organizacion={self.e.organizacion.pk}",
            {"nombre": "ERP"},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        return r.data

    def cliente_api(self, clave):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"ApiKey {clave}")
        return cliente

    def test_la_clave_se_muestra_una_vez_y_solo_se_guarda_su_hash(self):
        datos = self.crear()
        self.assertTrue(datos["clave"].startswith("nuc_"))
        token = TokenAPI.objects.get()
        self.assertEqual(token.clave_hash, hashlib.sha256(datos["clave"].encode()).hexdigest())
        r = cliente_de(self.e.plataforma).get(
            f"/api/v1/integraciones/tokens/?organizacion={self.e.organizacion.pk}"
        )
        self.assertNotIn("clave", r.data["results"][0])

    def test_consulta_solo_su_organizacion_y_no_escribe(self):
        cliente = self.cliente_api(self.crear()["clave"])
        r = cliente.get("/api/v1/dispositivos/")
        self.assertEqual(r.status_code, 200, r.content)
        nums = {d["num"] for d in r.data["results"]}
        self.assertEqual(nums, {self.e.dispositivo.pk})
        self.assertEqual(cliente.get("/api/v1/lecturas/").status_code, 200)
        self.assertEqual(cliente.get("/api/v1/alertas/").status_code, 200)
        r = cliente.patch(
            f"/api/v1/dispositivos/{self.e.dispositivo.pk}/", {"nombre": "x"}, format="json"
        )
        self.assertEqual(r.status_code, 403)
        # Las rutas que no aceptan tokens de API los ignoran.
        self.assertEqual(cliente.get("/api/v1/usuarios/").status_code, 401)

    def test_revocado_deja_de_servir(self):
        datos = self.crear()
        cliente_de(self.e.plataforma).delete(
            f"/api/v1/integraciones/tokens/{datos['num']}/?organizacion={self.e.organizacion.pk}"
        )
        r = self.cliente_api(datos["clave"]).get("/api/v1/dispositivos/")
        self.assertEqual(r.status_code, 401)

    def test_clave_falsa(self):
        datos = self.crear()
        falsa = datos["clave"][:-3] + "abc"
        self.assertEqual(self.cliente_api(falsa).get("/api/v1/dispositivos/").status_code, 401)

    def test_solo_el_administrador_de_plataforma_los_gestiona(self):
        r = cliente_de(self.e.supervisor).get("/api/v1/integraciones/tokens/")
        self.assertEqual(r.status_code, 403)


@mock.patch("apps.integraciones.envio.socket.getaddrinfo", return_value=PUBLICA)
class WebhookTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def crear(self, **extra):
        datos = {
            "nombre": "Sistema externo",
            "url": "https://ejemplo.com/nucleo",
            "eventos": ["alerta.nueva", "alerta.atendida"],
            **extra,
        }
        return cliente_de(self.e.plataforma).post(
            f"/api/v1/integraciones/webhooks/?organizacion={self.e.organizacion.pk}",
            datos,
            format="json",
        )

    def test_crea_con_secreto_cifrado_visible_una_vez(self, _dns):
        r = self.crear()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.data["secreto"].startswith("whsec_"))
        self.assertEqual(Webhook.objects.get().secreto, r.data["secreto"])
        r = cliente_de(self.e.plataforma).get(
            f"/api/v1/integraciones/webhooks/?organizacion={self.e.organizacion.pk}"
        )
        self.assertNotIn("secreto", r.data["results"][0])

    def test_rechaza_http_y_redes_internas(self, dns):
        self.assertEqual(self.crear(url="http://ejemplo.com/x").status_code, 400)
        dns.return_value = PRIVADA
        self.assertEqual(self.crear().status_code, 400)

    def test_firma_la_entrega(self, _dns):
        secreto = self.crear().data["secreto"]
        webhook = Webhook.objects.get()
        with mock.patch("apps.integraciones.envio._post", return_value=200) as post:
            self.assertTrue(envio.entregar(webhook, "prueba", {"a": 1}, esperas=(0,)))
        url, cuerpo, encabezados = post.call_args.args
        esperada = hmac.new(
            secreto.encode(), f"{encabezados['X-Nucleo-Fecha']}.".encode() + cuerpo, hashlib.sha256
        ).hexdigest()
        self.assertEqual(encabezados["X-Nucleo-Firma"], f"sha256={esperada}")
        self.assertEqual(json.loads(cuerpo)["evento"], "prueba")
        webhook.refresh_from_db()
        self.assertEqual(webhook.ultimo_estado, "HTTP 200")

    def test_se_pausa_tras_fallos_seguidos(self, _dns):
        self.crear()
        webhook = Webhook.objects.get()
        Webhook.objects.update(fallos_consecutivos=envio.FALLOS_PARA_PAUSAR - 1)
        webhook.refresh_from_db()
        with mock.patch("apps.integraciones.envio._post", return_value=500):
            self.assertFalse(envio.entregar(webhook, "prueba", {}, esperas=(0,)))
        webhook.refresh_from_db()
        self.assertFalse(webhook.activo)

    def test_avisa_al_atender_una_alerta(self, _dns):
        self.crear()
        alerta = Alerta.objects.create(
            umbral=self.e.umbral_temp,
            lectura_num=1,
            lectura_fecha_hora="2026-11-15T10:00:00Z",
            lectura_valor=30,
            nivel="PELIGRO",
            tipo="POR_ENCIMA",
        )
        with mock.patch("apps.integraciones.envio._en_hilo") as en_hilo:
            with self.captureOnCommitCallbacks(execute=True):
                r = cliente_de(self.e.admin).post(
                    f"/api/v1/alertas/{alerta.pk}/atender/", {"observaciones": "Se ventiló"}
                )
        self.assertEqual(r.status_code, 200, r.content)
        _webhooks, evento, datos = en_hilo.call_args.args
        self.assertEqual(evento, "alerta.atendida")
        self.assertEqual(datos["alerta"], alerta.pk)
