from django.core import mail
from django.core.management import call_command
from django.test import SimpleTestCase
from django.urls import reverse

from common.testing import Escenario, PruebaBase


class HealthCheckTests(SimpleTestCase):
    def test_health_returns_ok_without_authentication(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.json()["service"], "nucleo-backend")

    def test_health_only_accepts_get(self):
        response = self.client.post(reverse("health"), data={})

        self.assertEqual(response.status_code, 405)


class AvisarServidorTests(PruebaBase):
    def test_avisa_a_los_administradores_de_plataforma(self):
        e = Escenario()
        call_command("avisar_servidor", asunto="nucleo-mqtt falló", mensaje="detalle")
        self.assertEqual(mail.outbox[-1].to, [e.plataforma.correo])
        self.assertIn("nucleo-mqtt falló", mail.outbox[-1].subject)


class EsquemaOpenAPITests(PruebaBase):
    """El esquema y Swagger solo se ven con sesión; las rutas del ESP no aparecen."""

    def test_solo_con_sesion_y_sin_rutas_internas(self):
        from rest_framework.test import APIClient

        from common.testing import Escenario, cliente_de

        anonimo = APIClient()
        self.assertEqual(anonimo.get("/api/v1/esquema/").status_code, 401)
        self.assertEqual(anonimo.get("/api/v1/docs/").status_code, 401)
        cliente = cliente_de(Escenario().admin)
        r = cliente.get("/api/v1/esquema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")
        self.assertEqual(r.status_code, 200)
        rutas = r.json()["paths"]
        self.assertIn("/api/v1/lecturas/", rutas)
        self.assertFalse(any("/puente/" in ruta for ruta in rutas))
        self.assertEqual(cliente.get("/api/v1/docs/").status_code, 200)
