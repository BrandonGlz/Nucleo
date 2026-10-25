from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.usuarios.models import TelefonoPush, Usuario
from common import roles
from common.testing import CLAVE, Escenario, PruebaBase, cliente_de


class AutenticacionTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = APIClient()

    def test_login_devuelve_token_y_usuario(self):
        r = self.cliente.post(
            "/api/v1/auth/login/", {"correo": self.e.admin.correo, "password": CLAVE}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["token"])
        self.assertEqual(r.json()["usuario"]["rol"], roles.ADMIN)
        self.assertNotIn("password", r.json()["usuario"])
        self.e.admin.refresh_from_db()
        self.assertIsNotNone(self.e.admin.last_login)

    def test_login_con_clave_incorrecta(self):
        r = self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.admin.correo, "password": "mala"},
            format="json",
        )
        self.assertEqual(r.status_code, 401)

    def test_usuario_inactivo_no_inicia_sesion(self):
        self.e.operador.estado_usuario_id = roles.USUARIO_INACTIVO
        self.e.operador.save()
        r = self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.operador.correo, "password": CLAVE},
            format="json",
        )
        self.assertEqual(r.status_code, 401)

    def test_la_api_exige_autenticacion(self):
        self.assertEqual(self.cliente.get("/api/v1/dispositivos/").status_code, 401)

    def test_la_contrasena_se_guarda_cifrada(self):
        self.assertNotEqual(self.e.admin.password, CLAVE)
        self.assertTrue(self.e.admin.check_password(CLAVE))


class GestionDeUsuariosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Escenario("b")

    def datos(self, **extra):
        base = {
            "area": self.e.area.pk,
            "rol": roles.OPERADOR,
            "nombre": "Nuevo",
            "primer_apellido": "Operador",
            "correo": "nuevo@prueba.local",
            "password": "Otra-clave-segura-77",
        }
        return {**base, **extra}

    def test_administrador_crea_usuarios_en_su_organizacion(self):
        r = cliente_de(self.e.admin).post(
            "/api/v1/usuarios/", self.datos(rol=roles.ANALISTA), format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(
            Usuario.objects.get(correo="nuevo@prueba.local").organizacion, self.e.organizacion
        )

    def test_supervisor_solo_crea_operadores_de_su_area(self):
        cliente = cliente_de(self.e.supervisor)
        r = cliente.post("/api/v1/usuarios/", self.datos(rol=roles.ADMIN), format="json")
        self.assertEqual(r.status_code, 400)
        r = cliente.post("/api/v1/usuarios/", self.datos(area=self.e.otra_area.pk), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Usuario.objects.get(correo="nuevo@prueba.local").area, self.e.area)

    def test_operador_y_analista_no_gestionan_usuarios(self):
        self.assertEqual(cliente_de(self.e.operador).get("/api/v1/usuarios/").status_code, 403)
        self.assertEqual(cliente_de(self.e.analista).get("/api/v1/usuarios/").status_code, 403)

    def test_cada_organizacion_ve_solo_sus_usuarios(self):
        r = cliente_de(self.e.admin).get("/api/v1/usuarios/")
        correos = {u["correo"] for u in r.json()["results"]}
        self.assertIn(self.e.operador.correo, correos)
        self.assertNotIn(self.otro.operador.correo, correos)

    def test_la_baja_desactiva_la_cuenta(self):
        r = cliente_de(self.e.admin).delete(f"/api/v1/usuarios/{self.e.operador.pk}/")
        self.assertEqual(r.status_code, 204)
        self.e.operador.refresh_from_db()
        self.assertEqual(self.e.operador.estado_usuario_id, roles.USUARIO_INACTIVO)
        self.assertFalse(self.e.operador.is_active)

    def test_rechaza_contrasena_debil(self):
        r = cliente_de(self.e.admin).post(
            "/api/v1/usuarios/", self.datos(password="123"), format="json"
        )
        self.assertEqual(r.status_code, 400)


class TelefonosPushTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = APIClient()

    def login(self, **extra):
        return self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.operador.correo, "password": CLAVE, **extra},
            format="json",
        )

    def test_el_login_registra_el_telefono_y_el_cierre_lo_elimina(self):
        r = self.login(token_expo="ExponentPushToken[abc]", plataforma="ANDROID")
        self.assertEqual(r.status_code, 200, r.content)
        telefono = TelefonoPush.objects.get()
        self.assertEqual(telefono.usuario, self.e.operador)

        cliente = cliente_de(self.e.operador)
        r = cliente.post("/api/v1/auth/logout/", {"token_expo": "ExponentPushToken[abc]"})
        self.assertEqual(r.status_code, 204)
        self.assertFalse(TelefonoPush.objects.exists())

    def test_un_telefono_que_cambia_de_usuario_se_reasigna(self):
        datos = {"token_expo": "ExponentPushToken[abc]", "plataforma": "IOS"}
        self.login(**datos)
        self.cliente.post(
            "/api/v1/auth/login/",
            {"correo": self.e.supervisor.correo, "password": CLAVE, **datos},
            format="json",
        )
        self.assertEqual(TelefonoPush.objects.get().usuario, self.e.supervisor)

    def test_token_y_plataforma_van_juntos(self):
        self.assertEqual(self.login(token_expo="x").status_code, 400)
        self.assertEqual(self.login(token_expo="x", plataforma="WINDOWS").status_code, 400)
        self.assertFalse(TelefonoPush.objects.exists())

    def test_un_usuario_puede_tener_varios_telefonos(self):
        self.login(token_expo="ExponentPushToken[1]", plataforma="ANDROID")
        self.login(token_expo="ExponentPushToken[2]", plataforma="IOS")
        self.assertEqual(self.e.operador.telefonos_push.count(), 2)

    def test_la_baja_del_usuario_quita_sus_telefonos(self):
        self.login(token_expo="ExponentPushToken[1]", plataforma="ANDROID")
        cliente_de(self.e.admin).delete(f"/api/v1/usuarios/{self.e.operador.pk}/")
        self.assertFalse(TelefonoPush.objects.exists())

    def test_al_eliminar_al_usuario_se_eliminan_sus_telefonos(self):
        TelefonoPush.objects.create(
            usuario=self.e.operador, token_expo="ExponentPushToken[1]", plataforma="IOS"
        )
        self.e.operador.dispositivos_asignados.update(operador=None)
        self.e.operador.delete()
        self.assertFalse(TelefonoPush.objects.exists())

    def test_la_base_valida_la_plataforma(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            TelefonoPush.objects.create(
                usuario=self.e.operador, token_expo="ExponentPushToken[1]", plataforma="WINDOWS"
            )


class AdministradorDePlataformaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_es_el_unico_usuario_sin_organizacion(self):
        self.assertIsNone(self.e.plataforma.organizacion_id)
        self.assertEqual(self.e.plataforma.rol_id, roles.ADMIN_PLATAFORMA)
        self.assertTrue(self.e.plataforma.is_active)
        self.assertTrue(self.e.plataforma.is_staff)
        self.assertFalse(self.e.admin.is_staff)

    def test_la_base_exige_organizacion_a_todos_menos_al_administrador_de_plataforma(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Usuario.objects.filter(pk=self.e.admin.pk).update(organizacion=None)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Usuario.objects.filter(pk=self.e.plataforma.pk).update(organizacion=self.e.organizacion)

    def test_inicia_sesion_y_no_consulta_datos_de_las_organizaciones(self):
        r = APIClient().post(
            "/api/v1/auth/login/",
            {"correo": self.e.plataforma.correo, "password": CLAVE},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()["usuario"]["organizacion"])
        cliente = cliente_de(self.e.plataforma)
        for ruta in ("dispositivos", "lecturas", "alertas", "umbrales", "usuarios", "reportes"):
            self.assertEqual(cliente.get(f"/api/v1/{ruta}/").status_code, 403, ruta)

    def test_gestiona_organizaciones(self):
        cliente = cliente_de(self.e.plataforma)
        r = cliente.post("/api/v1/organizaciones/", {"nombre": "Farmacéutica Norte"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["estado"], "ACTIVA")
        num = r.json()["num"]
        self.assertEqual(len(cliente.get("/api/v1/organizaciones/").json()["results"]), 2)

        r = cliente.patch(f"/api/v1/organizaciones/{num}/", {"estado": "SUSPENDIDA"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            cliente.patch(
                f"/api/v1/organizaciones/{num}/", {"estado": "OTRA"}, format="json"
            ).status_code,
            400,
        )

    def test_crea_al_primer_administrador_una_sola_vez(self):
        cliente = cliente_de(self.e.plataforma)
        num = cliente.post(
            "/api/v1/organizaciones/", {"nombre": "Escuela Centro"}, format="json"
        ).json()["num"]
        url = f"/api/v1/organizaciones/{num}/primer-administrador/"
        datos = {
            "nombre": "Primera",
            "primer_apellido": "Admin",
            "correo": "primera@escuela.local",
            "password": "Otra-clave-segura-77",
        }
        r = cliente.post(url, datos, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["rol"], roles.ADMIN)
        self.assertEqual(r.json()["organizacion"], num)
        self.assertEqual(
            cliente.post(url, {**datos, "correo": "otra@escuela.local"}, format="json").status_code,
            409,
        )

    def test_una_organizacion_suspendida_no_inicia_sesion(self):
        cliente_de(self.e.plataforma).patch(
            f"/api/v1/organizaciones/{self.e.organizacion.pk}/",
            {"estado": "SUSPENDIDA"},
            format="json",
        )
        r = APIClient().post(
            "/api/v1/auth/login/",
            {"correo": self.e.admin.correo, "password": CLAVE},
            format="json",
        )
        self.assertEqual(r.status_code, 401)

    def test_el_administrador_de_una_organizacion_no_cambia_su_estado_ni_ve_otras(self):
        cliente = cliente_de(self.e.admin)
        url = f"/api/v1/organizaciones/{self.e.organizacion.pk}/"
        self.assertEqual(cliente.patch(url, {"ciudad": "Tecate"}, format="json").status_code, 200)
        self.assertEqual(cliente.patch(url, {"estado": "BAJA"}, format="json").status_code, 400)
        self.assertEqual(
            cliente.post("/api/v1/organizaciones/", {"nombre": "X"}, format="json").status_code, 403
        )
        self.assertEqual(len(cliente.get("/api/v1/organizaciones/").json()["results"]), 1)

    def test_los_demas_roles_solo_consultan_su_organizacion(self):
        cliente = cliente_de(self.e.operador)
        self.assertEqual(len(cliente.get("/api/v1/organizaciones/").json()["results"]), 1)
        r = cliente.patch(
            f"/api/v1/organizaciones/{self.e.organizacion.pk}/", {"ciudad": "X"}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_un_administrador_no_crea_ni_asciende_a_administrador_de_plataforma(self):
        cliente = cliente_de(self.e.admin)
        r = cliente.post(
            "/api/v1/usuarios/",
            {
                "rol": roles.ADMIN_PLATAFORMA,
                "nombre": "X",
                "primer_apellido": "Y",
                "correo": "x@prueba.local",
                "password": "Otra-clave-segura-77",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("rol", r.json())
        r = cliente.patch(
            f"/api/v1/usuarios/{self.e.operador.pk}/",
            {"rol": roles.ADMIN_PLATAFORMA},
            format="json",
        )
        self.assertEqual(r.status_code, 400)


class CaducidadDelTokenTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.cliente = cliente_de(self.e.operador)
        self.token = Token.objects.get(user=self.e.operador)

    def envejecer(self, **tiempo):
        Token.objects.filter(pk=self.token.pk).update(created=timezone.now() - timedelta(**tiempo))

    def test_un_token_con_uso_reciente_sirve_y_se_renueva(self):
        self.envejecer(days=6)
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 200)
        self.token.refresh_from_db()
        self.assertLess(timezone.now() - self.token.created, timedelta(minutes=1))

    def test_el_token_caduca_tras_siete_dias_sin_uso(self):
        self.envejecer(days=7, minutes=1)
        r = self.cliente.get("/api/v1/auth/yo/")
        self.assertEqual(r.status_code, 401)
        self.assertFalse(Token.objects.filter(pk=self.token.pk).exists())

    def test_el_dia_siete_exacto_todavia_sirve(self):
        self.envejecer(days=6, hours=23)
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 200)

    def test_iniciar_sesion_con_un_token_caducado_entrega_uno_nuevo(self):
        self.envejecer(days=30)
        r = APIClient().post(
            "/api/v1/auth/login/",
            {"correo": self.e.operador.correo, "password": CLAVE},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(r.json()["token"], self.token.key)
        self.assertEqual(Token.objects.filter(user=self.e.operador).count(), 1)

    def test_el_token_de_una_cuenta_inactiva_no_sirve(self):
        self.e.operador.estado_usuario_id = "INA"
        self.e.operador.save()
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").status_code, 401)
