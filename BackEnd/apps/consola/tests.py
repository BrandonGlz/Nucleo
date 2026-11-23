from datetime import timedelta

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.auditoria.models import RegistroAuditoria
from apps.consola.models import AlertaSeguridad
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

    def test_resumen_trae_cifras_y_series_sin_lista_de_alertas(self):
        crear_sesion(self.e.analista)
        r = cliente_de(self.e.plataforma).get("/api/v1/consola/resumen/")
        self.assertEqual(len(r.data["serie_accesos"]), 14)
        self.assertEqual(len(r.data["accesos_por_hora"]), 24)
        for clave in ("sesiones_activas", "sesiones", "usuarios", "accesos", "dispositivos"):
            self.assertIn(clave, r.data)
        self.assertEqual(
            r.data["sesiones_activas"], r.data["sesiones"]["web"] + r.data["sesiones"]["app"]
        )
        self.assertEqual(r.data["alertas_seguridad"], {"nuevas": 0, "criticas": 0})
        self.assertNotIn("alertas", r.data)


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

    def test_exigir_2fa_se_ve_en_el_resumen_y_en_alertas(self):
        ajustar_politica(roles_2fa_obligatorio=[roles.ADMIN])
        r = self.c.get("/api/v1/consola/resumen/")
        self.assertGreaterEqual(r.data["usuarios"]["sin_2fa_obligatorio"], 1)
        r = self.c.get("/api/v1/consola/alertas/resumen/")
        self.assertGreaterEqual(r.data["sin_2fa"], 1)


class AlertasSeguridadTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.c = cliente_de(self.e.plataforma)

    def _fallidos(self, n, ip="198.51.100.7", usuario=None):
        for _ in range(n):
            RegistroAuditoria.objects.create(
                accion=Accion.LOGIN_FALLIDO, usuario=usuario or self.e.analista, ip=ip
            )

    def test_intentos_fallidos_abren_una_sola_alerta_por_caso(self):
        self._fallidos(6)
        ip = AlertaSeguridad.objects.get(tipo="ip_fallidos")
        self.assertEqual((ip.ip, ip.nivel, ip.eventos), ("198.51.100.7", "advertencia", 6))
        cuenta = AlertaSeguridad.objects.get(tipo="cuenta_fallidos")
        self.assertEqual(cuenta.usuario, self.e.analista)
        self._fallidos(5)
        # Sin duplicar: la misma alerta abierta sube a crítica y cuenta los eventos.
        ip.refresh_from_db()
        self.assertEqual((ip.nivel, ip.eventos), ("critico", 11))
        self.assertEqual(AlertaSeguridad.objects.filter(tipo="ip_fallidos").count(), 1)

    def test_pocos_intentos_no_abren_alerta(self):
        self._fallidos(2)
        self.assertFalse(AlertaSeguridad.objects.exists())

    def test_acceso_desde_ip_nueva(self):
        viejo = RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.1"
        )
        RegistroAuditoria.objects.filter(pk=viejo.pk).update(
            fecha_hora=timezone.now() - timedelta(days=10)
        )
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.1"
        )
        self.assertFalse(AlertaSeguridad.objects.exists())
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.99"
        )
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.99"
        )
        alerta = AlertaSeguridad.objects.get(tipo="ip_nueva")
        self.assertEqual(alerta.ip, "192.0.2.99")

    def test_ipv6_de_la_misma_red_no_es_ip_nueva(self):
        # Las direcciones temporales de IPv6 cambian la parte final sin cambiar de red (/64).
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN,
            usuario=self.e.analista,
            ip="2001:db8:6402:a07c:79d2:95ec:a994:157c",
        )
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN,
            usuario=self.e.analista,
            ip="2001:db8:6402:a07c:2a6e:f099:2f28:1020",
        )
        self.assertFalse(AlertaSeguridad.objects.exists())
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="2001:db8:290:881e:70c0:3436:fd72:3a67"
        )
        alerta = AlertaSeguridad.objects.get(tipo="ip_nueva")
        self.assertIn("2001:db8:290:881e::/64", alerta.detalle)

    def test_primer_acceso_no_es_ip_nueva(self):
        RegistroAuditoria.objects.create(
            accion=Accion.LOGIN, usuario=self.e.analista, ip="192.0.2.5"
        )
        self.assertFalse(AlertaSeguridad.objects.exists())

    def test_el_login_real_genera_la_alerta(self):
        cliente = APIClient()
        for _ in range(3):
            cliente.post(
                "/api/v1/auth/login/",
                {"correo": self.e.analista.correo, "password": "mala"},
                format="json",
            )
        self.assertTrue(AlertaSeguridad.objects.filter(tipo="cuenta_fallidos").exists())

    def test_el_titulo_conserva_acentos_y_enes_del_nombre(self):
        # El título copia el nombre tal cual está guardado: «m¿ Perez» en producción venía del
        # nombre de la cuenta, no de la alerta.
        u = self.e.analista
        u.nombre, u.primer_apellido, u.segundo_apellido = "María Íñiguez", "Pérez", "Núñez"
        u.save()
        self._fallidos(3, usuario=u)
        alerta = AlertaSeguridad.objects.get(tipo="cuenta_fallidos")
        esperado = "3 intentos fallidos en la cuenta de María Íñiguez Pérez Núñez"
        self.assertEqual(alerta.titulo, esperado)
        r = self.c.get("/api/v1/consola/alertas/", {"tipo": "cuenta_fallidos"})
        self.assertEqual(r.json()["results"][0]["titulo"], esperado)
        self.assertEqual(r.json()["results"][0]["usuario"]["nombre"], "María Íñiguez Pérez Núñez")

    def test_bloquear_abre_y_desbloquear_la_cierra(self):
        self.c.patch(
            f"/api/v1/consola/usuarios/{self.e.analista.pk}/",
            {"estado_usuario": roles.USUARIO_BLOQUEADO},
            format="json",
        )
        alerta = AlertaSeguridad.objects.get(tipo="cuenta_bloqueada")
        self.assertEqual(alerta.estado, "nueva")
        self.assertIn(self.e.plataforma.get_full_name(), alerta.detalle)
        self.c.patch(
            f"/api/v1/consola/usuarios/{self.e.analista.pk}/",
            {"estado_usuario": roles.USUARIO_ACTIVO},
            format="json",
        )
        alerta.refresh_from_db()
        self.assertEqual(alerta.estado, "revisada")

    def test_lista_filtra_y_revisa_o_descarta(self):
        self._fallidos(6)
        r = self.c.get("/api/v1/consola/alertas/?estado=nueva&tipo=ip_fallidos")
        self.assertEqual(r.data["count"], 1)
        num = r.data["results"][0]["num"]
        self.assertEqual(self.c.get("/api/v1/consola/alertas/?nivel=critico").data["count"], 0)
        r = self.c.post(f"/api/v1/consola/alertas/{num}/revisar/", {"nota": "Era yo"})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data["estado"], r.data["nota"]), ("revisada", "Era yo"))
        self.assertEqual(r.data["revisada_por"], self.e.plataforma.get_full_name())
        r = self.c.post(f"/api/v1/consola/alertas/{num}/descartar/")
        self.assertEqual(r.status_code, 400)
        otra = AlertaSeguridad.objects.get(tipo="cuenta_fallidos")
        r = self.c.post(f"/api/v1/consola/alertas/{otra.num}/descartar/")
        self.assertEqual(r.data["estado"], "descartada")
        r = self.c.get("/api/v1/consola/alertas/resumen/")
        self.assertEqual((r.data["nuevas"], r.data["criticas"]), (0, 0))
        self.assertEqual(r.data["ultimos_30_dias"], 2)

    def test_tras_revisarla_los_mismos_intentos_no_la_reabren(self):
        self._fallidos(6)
        alerta = AlertaSeguridad.objects.get(tipo="ip_fallidos")
        self.c.post(f"/api/v1/consola/alertas/{alerta.num}/revisar/")
        self._fallidos(1)
        self.assertEqual(AlertaSeguridad.objects.filter(tipo="ip_fallidos").count(), 1)
        self._fallidos(5)
        self.assertEqual(
            AlertaSeguridad.objects.filter(tipo="ip_fallidos", estado="nueva").count(), 1
        )

    def test_revisar_todas(self):
        self._fallidos(6)
        r = self.c.post("/api/v1/consola/alertas/revisar-todas/")
        self.assertEqual(r.data["revisadas"], 2)
        self.assertFalse(AlertaSeguridad.objects.filter(estado="nueva").exists())

    def _csv(self, **filtros):
        r = self.c.get("/api/v1/consola/alertas/exportar/", filtros)
        self.assertEqual(r.status_code, 200)
        texto = b"".join(r.streaming_content).decode("utf-8")
        return r, texto

    def test_exporta_csv_con_los_filtros_de_la_lista(self):
        self._fallidos(6)
        r, texto = self._csv()
        self.assertEqual(r["Content-Type"], "text/csv; charset=utf-8")
        self.assertEqual(
            r["Content-Disposition"],
            f'attachment; filename="alertas-seguridad-{timezone.localdate():%Y-%m-%d}.csv"',
        )
        self.assertTrue(texto.startswith("\ufeffalerta,tipo,nivel,estado,titulo,"))
        filas = texto.strip().splitlines()
        self.assertEqual(len(filas), 3)  # encabezado + ip_fallidos + cuenta_fallidos
        self.assertIn("198.51.100.7", texto)
        _, solo_ip = self._csv(tipo="ip_fallidos", estado="nueva")
        self.assertEqual(len(solo_ip.strip().splitlines()), 2)
        self.assertIn(",ip_fallidos,", solo_ip)
        _, ninguna = self._csv(nivel="critico")
        self.assertEqual(len(ninguna.strip().splitlines()), 1)
        _, busqueda = self._csv(q="misma IP")
        self.assertEqual(len(busqueda.strip().splitlines()), 2)
        self.assertEqual(
            RegistroAuditoria.objects.filter(
                accion=Accion.EXPORTAR, recurso="alertas_seguridad"
            ).count(),
            4,
        )

    def test_el_csv_no_deja_formulas(self):
        AlertaSeguridad.objects.create(
            tipo="ip_nueva",
            nivel="advertencia",
            clave="ip_nueva:x",
            titulo="Acceso desde una IP nueva",
            usuario_correo="=HYPERLINK(1)",
            ultimo_evento=timezone.now(),
        )
        _, texto = self._csv()
        self.assertIn(",'=HYPERLINK(1),", texto)
        self.assertNotIn(",=HYPERLINK", texto)

    def test_solo_el_superusuario(self):
        for ruta in ("alertas/", "alertas/resumen/", "alertas/exportar/", "notificaciones/"):
            r = cliente_de(self.e.admin).get(f"/api/v1/consola/{ruta}")
            self.assertEqual(r.status_code, 403, ruta)


class AvisosSeguridadTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.c = cliente_de(self.e.plataforma)

    def _fallidos(self, n):
        with self.captureOnCommitCallbacks(execute=True):
            for _ in range(n):
                RegistroAuditoria.objects.create(
                    accion=Accion.LOGIN_FALLIDO, usuario_correo="x@y.z", ip="203.0.113.50"
                )

    def test_avisa_en_la_campana_y_por_correo_a_las_criticas(self):
        self._fallidos(5)
        # Advertencia: campana sí, correo no (por omisión solo las críticas).
        self.assertEqual(len(mail.outbox), 0)
        r = self.c.get("/api/v1/consola/notificaciones/")
        self.assertEqual((r.data["count"], r.data["no_leidas"]), (1, 1))
        self.assertIsNone(r.data["results"][0]["correo_enviado"])
        self._fallidos(5)
        # Sube a crítica: nuevo aviso y correo.
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Crítico", mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, [self.e.plataforma.correo])
        r = self.c.get("/api/v1/consola/notificaciones/")
        self.assertEqual(r.data["count"], 2)
        self.assertTrue(r.data["results"][0]["correo_enviado"])
        # Más intentos sobre la misma alerta crítica no vuelven a avisar.
        self._fallidos(3)
        self.assertEqual(len(mail.outbox), 1)

    def test_preferencias_y_leer(self):
        r = self.c.get("/api/v1/consola/notificaciones/preferencias/")
        self.assertEqual(r.data["niveles_correo"], ["critico"])
        r = self.c.patch(
            "/api/v1/consola/notificaciones/preferencias/",
            {"niveles_correo": ["advertencia", "critico"], "niveles_consola": ["critico"]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self._fallidos(5)
        self.assertEqual(len(mail.outbox), 1)
        # La campana solo muestra las críticas.
        self.assertEqual(self.c.get("/api/v1/consola/notificaciones/").data["count"], 0)
        self.c.patch(
            "/api/v1/consola/notificaciones/preferencias/",
            {"niveles_consola": ["critico", "advertencia"]},
            format="json",
        )
        r = self.c.get("/api/v1/consola/notificaciones/")
        self.assertEqual(r.data["no_leidas"], 1)
        r = self.c.post("/api/v1/consola/notificaciones/leer/", {}, format="json")
        self.assertEqual(r.data["leidas"], 1)
        self.assertEqual(self.c.get("/api/v1/consola/notificaciones/").data["no_leidas"], 0)
        r = self.c.patch(
            "/api/v1/consola/notificaciones/preferencias/",
            {"niveles_correo": ["urgente"]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
