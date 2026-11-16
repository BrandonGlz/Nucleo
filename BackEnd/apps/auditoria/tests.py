from django.test import override_settings
from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from common.testing import CLAVE, Escenario, PruebaBase, cliente_de

Accion = RegistroAuditoria.Accion


class BitacoraTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otra = Escenario("b")

    def test_registra_quien_cambia_un_umbral_con_antes_y_despues(self):
        r = cliente_de(self.e.admin).patch(
            f"/api/v1/umbrales/{self.e.umbral_temp.pk}/", {"advertencia_max": 26}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        registro = RegistroAuditoria.objects.get(accion=Accion.MODIFICAR, recurso="umbral")
        self.assertEqual(registro.usuario, self.e.admin)
        self.assertEqual(registro.organizacion, self.e.organizacion)
        self.assertEqual(registro.cambios["advertencia_max"]["despues"], "26.00")

    def test_no_copia_la_contrasena(self):
        cliente_de(self.e.admin).patch(
            f"/api/v1/usuarios/{self.e.analista.pk}/",
            {"password": "Nueva-Clave-Segura-2026"},
            format="json",
        )
        registro = RegistroAuditoria.objects.get(accion=Accion.MODIFICAR, recurso="usuario")
        self.assertEqual(registro.cambios, {"password": "(cambiado)"})

    def test_los_cambios_sin_persona_no_se_registran(self):
        self.e.umbral_temp.advertencia_max = 27
        self.e.umbral_temp.save()
        self.assertFalse(RegistroAuditoria.objects.filter(recurso="umbral").exists())

    def test_login_correcto_y_fallido(self):
        cliente = APIClient()
        cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.analista.correo, "password": CLAVE},
            format="json",
            HTTP_CF_CONNECTING_IP="203.0.113.7",
        )
        cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.analista.correo, "password": "mala"},
            format="json",
        )
        self.assertTrue(
            RegistroAuditoria.objects.filter(accion=Accion.LOGIN, usuario=self.e.analista).exists()
        )
        fallido = RegistroAuditoria.objects.get(accion=Accion.LOGIN_FALLIDO)
        self.assertEqual(fallido.usuario, self.e.analista)
        self.assertEqual(fallido.organizacion, self.e.organizacion)

    @override_settings(NUCLEO_CONFIAR_CF_CONNECTING_IP=True)
    def test_guarda_la_ip_real_detras_de_cloudflare(self):
        APIClient().post(
            "/api/v1/auth/login/",
            {"correo": self.e.analista.correo, "password": CLAVE},
            format="json",
            HTTP_CF_CONNECTING_IP="203.0.113.7",
        )
        self.assertEqual(RegistroAuditoria.objects.get(accion=Accion.LOGIN).ip, "203.0.113.7")

    def test_solo_el_administrador_de_plataforma_la_ve_y_filtra_por_organizacion(self):
        cliente_de(self.e.admin).patch(
            f"/api/v1/umbrales/{self.e.umbral_temp.pk}/", {"advertencia_max": 26}, format="json"
        )
        # Se mudó a la consola de administración: el administrador de la empresa ya no la ve.
        self.assertEqual(cliente_de(self.e.admin).get("/api/v1/auditoria/").status_code, 403)
        plataforma = cliente_de(self.e.plataforma)
        r = plataforma.get(
            f"/api/v1/auditoria/?recurso=umbral&organizacion={self.e.organizacion.pk}"
        )
        self.assertEqual(r.data["count"], 1)
        r = plataforma.get(
            f"/api/v1/auditoria/?recurso=umbral&organizacion={self.otra.organizacion.pk}"
        )
        self.assertEqual(r.data["count"], 0)

    def test_solo_administradores(self):
        self.assertEqual(cliente_de(self.e.supervisor).get("/api/v1/auditoria/").status_code, 403)
        self.assertEqual(cliente_de(self.e.analista).get("/api/v1/auditoria/").status_code, 403)


class LimiteLoginTests(PruebaBase):
    @override_settings(NUCLEO_CONFIAR_CF_CONNECTING_IP=True)
    def test_el_limite_de_intentos_es_por_ip_real(self):
        e = Escenario()
        cliente = APIClient()
        for _ in range(10):
            cliente.post(
                "/api/v1/auth/login/",
                {"correo": e.analista.correo, "password": "mala"},
                format="json",
                HTTP_CF_CONNECTING_IP="203.0.113.1",
            )
        r = cliente.post(
            "/api/v1/auth/login/",
            {"correo": e.analista.correo, "password": "mala"},
            format="json",
            HTTP_CF_CONNECTING_IP="203.0.113.1",
        )
        self.assertEqual(r.status_code, 429)
        # Otra persona (otra IP) detrás del mismo túnel sí puede entrar.
        r = cliente.post(
            "/api/v1/auth/login/",
            {"correo": e.analista.correo, "password": CLAVE},
            format="json",
            HTTP_CF_CONNECTING_IP="203.0.113.2",
        )
        self.assertEqual(r.status_code, 200)
