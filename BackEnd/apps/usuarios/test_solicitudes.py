import re

from django.core import mail
from rest_framework.test import APIClient

from apps.organizaciones.models import Organizacion
from apps.usuarios.models import SolicitudAcceso, Usuario
from common import roles
from common.testing import Escenario, PruebaBase, cliente_de

URL = "/api/v1/auth/solicitar-acceso/"


class SolicitudAccesoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otra = Escenario("b")
        self.anonimo = APIClient()

    def solicitar(self, **extra):
        datos = {
            "organizacion": self.e.organizacion.pk,
            "area": self.e.area.pk,
            "nombre": "Ana",
            "primer_apellido": "López",
            "segundo_apellido": "",
            "correo": "Ana.Lopez@ejemplo.com",
            **extra,
        }
        return self.anonimo.post(URL, datos, format="json")

    def test_lista_organizaciones_activas_con_areas(self):
        Organizacion.objects.filter(pk=self.otra.organizacion.pk).update(
            estado=Organizacion.Estado.SUSPENDIDA
        )
        r = self.anonimo.get(URL)
        self.assertEqual(r.status_code, 200)
        nombres = [o["nombre"] for o in r.json()]
        self.assertIn(self.e.organizacion.nombre, nombres)
        self.assertNotIn(self.otra.organizacion.nombre, nombres)
        org = next(o for o in r.json() if o["num"] == self.e.organizacion.pk)
        self.assertEqual(len(org["areas"]), 2)

    def test_avisa_a_los_administradores_de_la_organizacion(self):
        r = self.solicitar()
        self.assertEqual(r.status_code, 204, r.content)
        solicitud = SolicitudAcceso.objects.get()
        self.assertEqual(solicitud.correo, "ana.lopez@ejemplo.com")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.e.admin.correo])
        self.assertIn(f"/solicitudes/{solicitud.num}", mail.outbox[0].body)

    def test_no_revela_si_el_correo_ya_tiene_cuenta(self):
        r = self.solicitar(correo=self.e.analista.correo)
        self.assertEqual(r.status_code, 204)
        self.assertFalse(SolicitudAcceso.objects.exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_rechaza_area_de_otra_organizacion_y_bots(self):
        self.assertEqual(self.solicitar(area=self.otra.area.pk).status_code, 400)
        self.assertEqual(self.solicitar(sitio="http://spam").status_code, 204)
        self.assertFalse(SolicitudAcceso.objects.exists())

    def test_admin_aprueba_y_la_persona_recibe_su_bienvenida(self):
        self.solicitar()
        solicitud = SolicitudAcceso.objects.get()
        admin = cliente_de(self.e.admin)
        detalle = admin.get(f"/api/v1/solicitudes-acceso/{solicitud.num}/")
        self.assertEqual(detalle.status_code, 200)
        self.assertEqual(detalle.json()["area"], self.e.area.pk)
        r = admin.post(
            f"/api/v1/solicitudes-acceso/{solicitud.num}/aprobar/",
            {
                "area": self.e.otra_area.pk,
                "rol": roles.SUPERVISOR,
                "nombre": "Ana María",
                "primer_apellido": "López",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()["correo_enviado"])
        usuario = Usuario.objects.get(correo="ana.lopez@ejemplo.com")
        self.assertEqual(usuario.organizacion, self.e.organizacion)
        self.assertEqual(usuario.area, self.e.otra_area)
        self.assertEqual(usuario.rol_id, roles.SUPERVISOR)
        self.assertTrue(usuario.debe_cambiar_password)
        bienvenida = mail.outbox[-1]
        self.assertEqual(bienvenida.to, ["ana.lopez@ejemplo.com"])
        clave = re.search(r"Contraseña temporal: (\S+)", bienvenida.body).group(1)
        self.assertTrue(usuario.check_password(clave))
        # Entra con la temporal, la cambia y deja de ser temporal.
        login = self.anonimo.post(
            "/api/v1/auth/login/",
            {"correo": usuario.correo, "password": clave},
            format="json",
        )
        self.assertTrue(login.json()["usuario"]["debe_cambiar_password"])
        propio = cliente_de(usuario)
        r = propio.post(
            "/api/v1/auth/cambiar-password/",
            {"password_actual": clave, "password_nueva": "Clave-Nueva-Segura-2026"},
            format="json",
        )
        self.assertEqual(r.status_code, 204, r.content)
        usuario.refresh_from_db()
        self.assertFalse(usuario.debe_cambiar_password)
        # Ya atendida no se vuelve a aprobar.
        r = admin.post(
            f"/api/v1/solicitudes-acceso/{solicitud.num}/aprobar/",
            {"area": self.e.area.pk, "rol": roles.OPERADOR, "nombre": "X", "primer_apellido": "Y"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_se_puede_aprobar_como_administrador(self):
        self.solicitar()
        solicitud = SolicitudAcceso.objects.get()
        admin = cliente_de(self.e.admin)
        detalle = admin.get(f"/api/v1/solicitudes-acceso/{solicitud.num}/")
        self.assertIn(roles.ADMIN, [r["codigo"] for r in detalle.json()["roles"]])
        r = admin.post(
            f"/api/v1/solicitudes-acceso/{solicitud.num}/aprobar/",
            {
                "area": self.e.area.pk,
                "rol": roles.ADMIN,
                "nombre": "Ana",
                "primer_apellido": "López",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Usuario.objects.get(correo="ana.lopez@ejemplo.com").rol_id, roles.ADMIN)

    def test_solo_administradores_de_esa_organizacion(self):
        self.solicitar()
        num = SolicitudAcceso.objects.get().num
        url = f"/api/v1/solicitudes-acceso/{num}/"
        self.assertEqual(cliente_de(self.e.supervisor).get(url).status_code, 403)
        self.assertEqual(cliente_de(self.otra.admin).get(url).status_code, 404)
        self.assertEqual(APIClient().get(url).status_code, 401)
        self.assertEqual(cliente_de(self.e.plataforma).get(url).status_code, 200)

    def test_rechazar_avisa_a_la_persona(self):
        self.solicitar()
        solicitud = SolicitudAcceso.objects.get()
        r = cliente_de(self.e.admin).post(f"/api/v1/solicitudes-acceso/{solicitud.num}/rechazar/")
        self.assertEqual(r.status_code, 200)
        solicitud.refresh_from_db()
        self.assertEqual(solicitud.estado, SolicitudAcceso.Estado.RECHAZADA)
        self.assertEqual(mail.outbox[-1].to, ["ana.lopez@ejemplo.com"])
        self.assertFalse(Usuario.objects.filter(correo="ana.lopez@ejemplo.com").exists())


class ValidacionesCorreoYPasswordTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_correo_con_caracteres_especiales_se_rechaza(self):
        admin = cliente_de(self.e.admin)
        for malo in [
            "|@ut-tijuana.edu.mx",
            "ana lopez@ejemplo.com",
            "josé@ejemplo.com",
            "a..b@ejemplo.com",
            "a<b>@ejemplo.com",
        ]:
            r = admin.patch(
                f"/api/v1/usuarios/{self.e.operador.num}/", {"correo": malo}, format="json"
            )
            self.assertEqual(r.status_code, 400, malo)
            self.assertIn("solo puede llevar letras sin acento", r.json()["correo"][0])
        r = admin.patch(
            f"/api/v1/usuarios/{self.e.operador.num}/",
            {"correo": "ana.lopez-2+utt@ejemplo.com.mx"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)

    def test_password_comun_explica_que_es_insegura(self):
        propio = cliente_de(self.e.operador)
        self.e.operador.set_password("Actual-Segura-2026")
        self.e.operador.save()
        r = propio.post(
            "/api/v1/auth/cambiar-password/",
            {"password_actual": "Actual-Segura-2026", "password_nueva": "password123"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn(
            "La contraseña es insegura: es de las más usadas", r.json()["password_nueva"][0]
        )
        r = propio.post(
            "/api/v1/auth/cambiar-password/",
            {"password_actual": "Actual-Segura-2026", "password_nueva": "12345678901"},
            format="json",
        )
        self.assertTrue(any("solo números" in m for m in r.json()["password_nueva"]))
