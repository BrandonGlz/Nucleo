from datetime import timedelta

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from apps.dispositivos import firmware
from apps.usuarios.models import SegundoFactor, Sesion, Usuario
from common import roles
from common.autenticacion import crear_sesion
from common.testing import CLAVE, Escenario, PruebaBase, ajustar_politica, cliente_de

Accion = RegistroAuditoria.Accion


class AccesoConsolaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_solo_el_administrador_de_plataforma_entra(self):
        for u in (self.e.admin, self.e.supervisor, self.e.analista, self.e.operador):
            for ruta in ("resumen/", "usuarios/", "sesiones/", "dispositivos/", "politicas/"):
                r = cliente_de(u).get(f"/api/v1/consola/{ruta}")
                self.assertEqual(r.status_code, 403, (u.rol_id, ruta))
        self.assertEqual(APIClient().get("/api/v1/consola/resumen/").status_code, 401)
        self.assertEqual(
            cliente_de(self.e.plataforma).get("/api/v1/consola/resumen/").status_code, 200
        )

    def test_resumen_trae_cifras_serie_y_alertas(self):
        r = cliente_de(self.e.plataforma).get("/api/v1/consola/resumen/")
        self.assertEqual(len(r.data["serie_accesos"]), 14)
        for clave in ("sesiones_activas", "usuarios", "accesos", "dispositivos", "alertas"):
            self.assertIn(clave, r.data)


class UsuariosConsolaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otra = Escenario("b")
        self.c = cliente_de(self.e.plataforma)

    def test_lista_todas_las_organizaciones_y_filtra(self):
        r = self.c.get("/api/v1/consola/usuarios/?page_size=100")
        orgs = {u["organizacion"]["num"] for u in r.data["results"] if u["organizacion"]}
        self.assertEqual(orgs, {self.e.organizacion.pk, self.otra.organizacion.pk})
        r = self.c.get(f"/api/v1/consola/usuarios/?organizacion={self.otra.organizacion.pk}")
        self.assertTrue(
            all(u["organizacion"]["num"] == self.otra.organizacion.pk for u in r.data["results"])
        )

    def test_crea_un_supervisor_en_cualquier_organizacion(self):
        r = self.c.post(
            "/api/v1/consola/usuarios/",
            {
                "organizacion": self.otra.organizacion.pk,
                "area": self.otra.area.pk,
                "rol": roles.SUPERVISOR,
                "nombre": "Nueva",
                "primer_apellido": "Persona",
                "correo": "nueva@prueba.local",
                "password": "Otra-clave-segura-77",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        u = Usuario.objects.get(correo="nueva@prueba.local")
        self.assertEqual(
            (u.rol_id, u.organizacion_id), (roles.SUPERVISOR, self.otra.organizacion.pk)
        )

    def test_valida_area_de_otra_organizacion_y_rol_de_plataforma(self):
        base = {
            "organizacion": self.e.organizacion.pk,
            "nombre": "X",
            "primer_apellido": "Y",
            "correo": "x@prueba.local",
            "password": "Otra-clave-segura-77",
        }
        r = self.c.post(
            "/api/v1/consola/usuarios/",
            {**base, "rol": roles.OPERADOR, "area": self.otra.area.pk},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("area", r.data)
        r = self.c.post(
            "/api/v1/consola/usuarios/", {**base, "rol": roles.ADMIN_PLATAFORMA}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_dar_de_baja_cierra_sus_sesiones(self):
        crear_sesion(self.e.analista)
        r = self.c.patch(
            f"/api/v1/consola/usuarios/{self.e.analista.pk}/",
            {"estado_usuario": roles.USUARIO_INACTIVO},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(Sesion.objects.filter(usuario=self.e.analista).exists())

    def test_desbloquear(self):
        self.e.analista.estado_usuario_id = roles.USUARIO_BLOQUEADO
        self.e.analista.save()
        r = self.c.patch(
            f"/api/v1/consola/usuarios/{self.e.analista.pk}/",
            {"estado_usuario": roles.USUARIO_ACTIVO},
            format="json",
        )
        self.assertEqual(r.data["estado_usuario"], roles.USUARIO_ACTIVO)

    def test_no_se_edita_a_si_mismo(self):
        r = self.c.patch(
            f"/api/v1/consola/usuarios/{self.e.plataforma.pk}/", {"nombre": "Otro"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_restablecer_envia_el_enlace(self):
        r = self.c.post(f"/api/v1/consola/usuarios/{self.e.analista.pk}/restablecer/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, [self.e.analista.correo])
        self.assertIn("/restablecer?uid=", mail.outbox[-1].body)

    def test_quitar_2fa_y_cerrar_sesiones(self):
        SegundoFactor.objects.create(usuario=self.e.analista, secreto="ABC", activo=True)
        crear_sesion(self.e.analista)
        r = self.c.post(f"/api/v1/consola/usuarios/{self.e.analista.pk}/quitar-2fa/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(SegundoFactor.objects.filter(usuario=self.e.analista).exists())
        crear_sesion(self.e.analista)
        crear_sesion(self.e.analista)
        r = self.c.post(f"/api/v1/consola/usuarios/{self.e.analista.pk}/cerrar-sesiones/")
        self.assertEqual(r.data["cerradas"], 2)
        self.assertTrue(
            RegistroAuditoria.objects.filter(descripcion__startswith="Cerró 2 sesiones").exists()
        )


class SesionesConsolaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.sesion_admin, _ = crear_sesion(self.e.plataforma)

    def cliente(self):
        _, clave = crear_sesion(self.e.plataforma)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {clave}")
        return c

    def test_lista_marca_la_actual_y_cierra_otra(self):
        objetivo, clave_objetivo = crear_sesion(self.e.analista)
        c = self.cliente()
        r = c.get("/api/v1/consola/sesiones/?page_size=100")
        self.assertEqual(sum(s["actual"] for s in r.data["results"]), 1)
        self.assertEqual(c.delete(f"/api/v1/consola/sesiones/{objetivo.pk}/").status_code, 204)
        otra = APIClient()
        otra.credentials(HTTP_AUTHORIZATION=f"Token {clave_objetivo}")
        self.assertEqual(otra.get("/api/v1/auth/yo/").status_code, 401)

    def test_no_cierra_la_sesion_actual(self):
        c = self.cliente()
        actual = next(
            s
            for s in c.get("/api/v1/consola/sesiones/?page_size=100").data["results"]
            if s["actual"]
        )
        self.assertEqual(c.delete(f"/api/v1/consola/sesiones/{actual['id']}/").status_code, 400)

    def test_no_lista_las_caducadas(self):
        vieja, _ = crear_sesion(self.e.analista)
        Sesion.objects.filter(pk=vieja.pk).update(ultimo_uso=timezone.now() - timedelta(days=30))
        ids = {
            s["id"]
            for s in self.cliente().get("/api/v1/consola/sesiones/?page_size=100").data["results"]
        }
        self.assertNotIn(vieja.pk, ids)

    def test_el_login_guarda_navegador_e_ip(self):
        APIClient().post(
            "/api/v1/auth/login/",
            {"correo": self.e.analista.correo, "password": CLAVE},
            format="json",
            HTTP_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/150.0 Safari/537",
            HTTP_X_NUCLEO_CLIENTE="web",
        )
        s = Sesion.objects.filter(usuario=self.e.analista).latest("creada")
        self.assertEqual((s.cliente, s.agente), ("web", "Chrome en Windows"))


class DispositivosConsolaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.c = cliente_de(self.e.plataforma)
        self.d = self.e.dispositivo

    def test_mantenimiento_baja_y_reactivar(self):
        url = f"/api/v1/consola/dispositivos/{self.d.pk}/"
        self.assertEqual(
            self.c.patch(url, {"estado": "MANT"}, format="json").data["estado"], "MANT"
        )
        self.assertEqual(
            self.c.patch(url, {"estado": "BAJA"}, format="json").data["estado"], "BAJA"
        )
        r = self.c.patch(url, {"estado": "ACTIVO"}, format="json")
        self.assertEqual(r.data["estado"], roles.DISPOSITIVO_SIN_CONEXION)
        self.assertEqual(self.c.patch(url, {"estado": "LINEA"}, format="json").status_code, 400)

    @override_settings(NUCLEO_FIRMWARE_DISPOSITIVOS=[])
    def test_ota_por_equipo_o_para_todos(self):
        self.assertFalse(firmware.autorizado(self.d.codigo_mqtt))
        self.c.patch(
            f"/api/v1/consola/dispositivos/{self.d.pk}/", {"recibe_ota": True}, format="json"
        )
        self.assertTrue(firmware.autorizado(self.d.codigo_mqtt))
        self.c.patch(
            f"/api/v1/consola/dispositivos/{self.d.pk}/", {"recibe_ota": False}, format="json"
        )
        ajustar_politica(ota_todos=True)
        self.assertTrue(firmware.autorizado(self.d.codigo_mqtt))
        self.assertTrue(self.c.get("/api/v1/consola/firmware/").data["ota_todos"])


class PoliticasConsolaTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.c = cliente_de(self.e.plataforma)

    def test_guarda_y_valida(self):
        r = self.c.patch(
            "/api/v1/consola/politicas/",
            {"dias_sesion": 3, "roles_2fa_obligatorio": ["ADMIN", "ADMIN"]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["roles_2fa_obligatorio"], ["ADMIN"])
        self.assertEqual(r.data["actualizado_por"], self.e.plataforma.get_full_name())
        r = self.c.patch("/api/v1/consola/politicas/", {"dias_sesion": 200}, format="json")
        self.assertEqual(r.status_code, 400)

    @override_settings(NUCLEO_CONFIAR_CF_CONNECTING_IP=True)
    def test_los_intentos_por_minuto_siguen_la_politica(self):
        self.c.patch("/api/v1/consola/politicas/", {"intentos_login_por_minuto": 3}, format="json")
        cliente = APIClient()
        codigos = [
            cliente.post(
                "/api/v1/auth/login/",
                {"correo": self.e.analista.correo, "password": "mala"},
                format="json",
                HTTP_CF_CONNECTING_IP="203.0.113.9",
            ).status_code
            for _ in range(4)
        ]
        self.assertEqual(codigos, [401, 401, 401, 429])

    def test_exigir_2fa_se_ve_en_el_resumen(self):
        ajustar_politica(roles_2fa_obligatorio=[roles.ADMIN])
        r = self.c.get("/api/v1/consola/resumen/")
        self.assertGreaterEqual(r.data["usuarios"]["sin_2fa_obligatorio"], 1)
        self.assertTrue(any(a["tipo"] == "sin_2fa" for a in r.data["alertas"]))


class AlertasSeguridadTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_intentos_fallidos_desde_una_ip(self):
        for _ in range(6):
            RegistroAuditoria.objects.create(
                accion=Accion.LOGIN_FALLIDO, usuario=self.e.analista, ip="198.51.100.7"
            )
        r = cliente_de(self.e.plataforma).get("/api/v1/consola/resumen/")
        tipos = {(a["tipo"], a["ip"]) for a in r.data["alertas"]}
        self.assertIn(("ip_fallidos", "198.51.100.7"), tipos)
        self.assertTrue(any(a["tipo"] == "cuenta_fallidos" for a in r.data["alertas"]))

    def test_acceso_desde_ip_nueva(self):
        viejo = RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.1"
        )
        RegistroAuditoria.objects.filter(pk=viejo.pk).update(
            fecha_hora=timezone.now() - timedelta(days=10)
        )
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.99"
        )
        r = cliente_de(self.e.plataforma).get("/api/v1/consola/resumen/")
        self.assertTrue(
            any(a["tipo"] == "ip_nueva" and a["ip"] == "192.0.2.99" for a in r.data["alertas"])
        )
