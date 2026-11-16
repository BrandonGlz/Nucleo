import re

from django.core import mail
from django.db import connection
from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from apps.usuarios.models import SegundoFactor, Usuario
from common import roles, totp
from common.testing import CLAVE, Escenario, PruebaBase, ajustar_politica, cliente_de


def activar_2fa(usuario):
    """Activa la verificación en dos pasos y devuelve ``(secreto, codigos_recuperacion)``."""
    cliente = cliente_de(usuario)
    secreto = cliente.post("/api/v1/auth/2fa/configurar/").data["secreto"]
    codigo = totp.codigo(secreto, totp.paso_actual())
    r = cliente.post("/api/v1/auth/2fa/activar/", {"codigo": codigo}, format="json")
    assert r.status_code == 200, r.content
    return secreto, r.data["codigos_recuperacion"]


class SegundoFactorTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = APIClient()

    def login(self, usuario, **extra):
        return self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": usuario.correo, "password": CLAVE, **extra},
            format="json",
        )

    def test_configurar_devuelve_qr_y_el_secreto_queda_cifrado(self):
        r = cliente_de(self.e.analista).post("/api/v1/auth/2fa/configurar/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["qr_svg"].startswith("<svg"))
        self.assertIn("otpauth://totp/", r.data["uri"])
        with connection.cursor() as cursor:
            cursor.execute("select secreto from segundo_factor")
            guardado = cursor.fetchone()[0]
        self.assertNotIn(r.data["secreto"], guardado)
        self.assertTrue(guardado.startswith("fernet:"))

    def test_activar_exige_un_codigo_valido(self):
        cliente = cliente_de(self.e.analista)
        cliente.post("/api/v1/auth/2fa/configurar/")
        r = cliente.post("/api/v1/auth/2fa/activar/", {"codigo": "000000"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(SegundoFactor.objects.get().activo)

    def test_login_pide_codigo_y_no_acepta_el_mismo_dos_veces(self):
        secreto, _ = activar_2fa(self.e.analista)
        r = self.login(self.e.analista)
        self.assertEqual(r.status_code, 401)
        self.assertTrue(r.data["requiere_codigo"])
        self.assertNotIn("token", r.data)

        # El código con el que se activó ya se usó: se pide el del siguiente paso.
        siguiente = totp.codigo(secreto, totp.paso_actual() + 1)
        r = self.login(self.e.analista, codigo=siguiente)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("token", r.data)
        r = self.login(self.e.analista, codigo=siguiente)
        self.assertEqual(r.status_code, 401)

    def test_codigo_de_recuperacion_sirve_una_sola_vez(self):
        _, codigos = activar_2fa(self.e.analista)
        self.assertEqual(len(codigos), 10)
        self.assertEqual(self.login(self.e.analista, codigo=codigos[0]).status_code, 200)
        self.assertEqual(self.login(self.e.analista, codigo=codigos[0]).status_code, 401)
        self.assertEqual(len(SegundoFactor.objects.get().codigos_recuperacion), 9)

    def test_desactivar_pide_contrasena_y_codigo(self):
        _, codigos = activar_2fa(self.e.analista)
        cliente = cliente_de(self.e.analista)
        r = cliente.post(
            "/api/v1/auth/2fa/desactivar/",
            {"password": "otra", "codigo": codigos[0]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        r = cliente.post(
            "/api/v1/auth/2fa/desactivar/",
            {"password": CLAVE, "codigo": codigos[1]},
            format="json",
        )
        self.assertEqual(r.status_code, 204)
        self.assertFalse(SegundoFactor.objects.exists())

    def test_rol_obligatorio_sin_configurar_solo_usa_rutas_de_auth(self):
        ajustar_politica(roles_2fa_obligatorio=[roles.ADMIN])
        r = self.login(self.e.admin)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["configurar_segundo_factor"])
        cliente = cliente_de(self.e.admin)
        r = cliente.get("/api/v1/dispositivos/")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(r.data["segundo_factor_pendiente"])
        self.assertEqual(cliente.get("/api/v1/auth/yo/").status_code, 200)

        activar_2fa(self.e.admin)
        self.assertEqual(cliente.get("/api/v1/dispositivos/").status_code, 200)
        r = cliente.post(
            "/api/v1/auth/2fa/desactivar/", {"password": CLAVE, "codigo": "1"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_los_demas_roles_no_quedan_bloqueados(self):
        self.assertEqual(cliente_de(self.e.admin).get("/api/v1/dispositivos/").status_code, 200)


class RecuperarPasswordTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = APIClient()

    def pedir(self, correo):
        return self.cliente.post("/api/v1/auth/recuperar/", {"correo": correo}, format="json")

    def enlace(self):
        cuerpo = mail.outbox[-1].body
        uid = re.search(r"uid=([\w-]+)", cuerpo).group(1)
        token = re.search(r"token=([\w-]+)", cuerpo).group(1)
        return uid, token

    def test_responde_igual_si_el_correo_no_existe(self):
        self.assertEqual(self.pedir("nadie@prueba.local").status_code, 204)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.pedir(self.e.analista.correo).status_code, 204)
        self.assertEqual(len(mail.outbox), 1)

    def test_el_enlace_cambia_la_contrasena_una_sola_vez(self):
        self.pedir(self.e.analista.correo)
        uid, token = self.enlace()
        datos = {"uid": uid, "token": token, "password_nueva": "Otra-Clave-Segura-2026"}
        r = self.cliente.post("/api/v1/auth/restablecer/", datos, format="json")
        self.assertEqual(r.status_code, 204, r.content)
        usuario = Usuario.objects.get(pk=self.e.analista.pk)
        self.assertTrue(usuario.check_password("Otra-Clave-Segura-2026"))
        r = self.cliente.post("/api/v1/auth/restablecer/", datos, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertTrue(
            RegistroAuditoria.objects.filter(
                accion=RegistroAuditoria.Accion.RECUPERAR, usuario=usuario
            ).exists()
        )

    def test_rechaza_contrasena_debil(self):
        self.pedir(self.e.analista.correo)
        uid, token = self.enlace()
        r = self.cliente.post(
            "/api/v1/auth/restablecer/",
            {"uid": uid, "token": token, "password_nueva": "123"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("password_nueva", r.data)


class TelefonoCifradoTests(PruebaBase):
    def test_el_telefono_se_guarda_cifrado_y_se_lee_en_claro(self):
        e = Escenario()
        e.analista.telefono = "6641234567"
        e.analista.save()
        with connection.cursor() as cursor:
            cursor.execute("select telefono from usuario where num = %s", [e.analista.pk])
            guardado = cursor.fetchone()[0]
        self.assertTrue(guardado.startswith("fernet:"))
        self.assertEqual(Usuario.objects.get(pk=e.analista.pk).telefono, "6641234567")

    def test_un_valor_viejo_sin_cifrar_se_sigue_leyendo(self):
        e = Escenario()
        with connection.cursor() as cursor:
            cursor.execute(
                "update usuario set telefono = '6640000000' where num = %s", [e.admin.pk]
            )
        self.assertEqual(Usuario.objects.get(pk=e.admin.pk).telefono, "6640000000")

    def test_la_api_limita_el_telefono_a_15_caracteres(self):
        e = Escenario()
        r = cliente_de(e.admin).patch(
            f"/api/v1/usuarios/{e.analista.pk}/", {"telefono": "1" * 16}, format="json"
        )
        self.assertEqual(r.status_code, 400)


class SesionWebCookieTests(PruebaBase):
    """La web recibe la sesión en una cookie HttpOnly y nunca ve el token."""

    WEB = {"HTTP_X_NUCLEO_CLIENTE": "web"}

    def setUp(self):
        self.e = Escenario()
        self.cliente = APIClient()

    def _entrar(self):
        return self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.admin.correo, "password": CLAVE},
            format="json",
            **self.WEB,
        )

    def test_login_web_pone_cookie_httponly_sin_token_en_el_cuerpo(self):
        r = self._entrar()
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("token", r.json())
        cookie = r.cookies["nucleo_sesion"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 200)

    def test_la_app_movil_sigue_recibiendo_el_token(self):
        r = self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.admin.correo, "password": CLAVE},
            format="json",
        )
        self.assertIn("token", r.json())
        self.assertNotIn("nucleo_sesion", r.cookies)

    def test_escribir_con_cookie_exige_el_encabezado_de_la_web(self):
        self._entrar()
        sin = self.cliente.post("/api/v1/areas/", {"nombre": "Nueva"}, format="json")
        self.assertEqual(sin.status_code, 403)
        con = self.cliente.post("/api/v1/areas/", {"nombre": "Nueva"}, format="json", **self.WEB)
        self.assertEqual(con.status_code, 201)

    def test_cookie_vieja_no_bloquea_las_rutas_publicas(self):
        self.cliente.cookies["nucleo_sesion"] = "inventada"
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 401)
        r = self.cliente.post(
            "/api/v1/auth/recuperar/", {"correo": "nadie@ejemplo.mx"}, format="json", **self.WEB
        )
        self.assertEqual(r.status_code, 204)

    def test_cerrar_sesion_borra_la_cookie_y_el_token(self):
        self._entrar()
        r = self.cliente.post("/api/v1/auth/logout/", {}, format="json", **self.WEB)
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r.cookies["nucleo_sesion"].value, "")
        self.cliente.cookies["nucleo_sesion"] = r.cookies["nucleo_sesion"].value
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 401)


class MisSesionesTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_lista_solo_las_propias_y_marca_la_actual(self):
        from common.autenticacion import crear_sesion

        crear_sesion(self.e.operador)
        crear_sesion(self.e.supervisor)
        r = cliente_de(self.e.operador).get("/api/v1/auth/sesiones/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        self.assertEqual(sum(1 for s in r.data if s["actual"]), 1)

    def test_cierra_otra_sesion_pero_no_la_actual(self):
        from apps.usuarios.models import Sesion
        from common.autenticacion import crear_sesion

        otra, _ = crear_sesion(self.e.operador)
        cliente = cliente_de(self.e.operador)
        actual = next(s for s in cliente.get("/api/v1/auth/sesiones/").data if s["actual"])
        self.assertEqual(cliente.delete(f"/api/v1/auth/sesiones/{actual['num']}/").status_code, 400)
        self.assertEqual(cliente.delete(f"/api/v1/auth/sesiones/{otra.num}/").status_code, 204)
        self.assertFalse(Sesion.objects.filter(pk=otra.num).exists())

    def test_no_cierra_sesiones_ajenas(self):
        from common.autenticacion import crear_sesion

        ajena, _ = crear_sesion(self.e.supervisor)
        r = cliente_de(self.e.operador).delete(f"/api/v1/auth/sesiones/{ajena.num}/")
        self.assertEqual(r.status_code, 404)
