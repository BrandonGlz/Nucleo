from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.dispositivos.models import Dispositivo
from apps.dispositivos.services import marcar_sin_conexion
from common import roles
from common.testing import Escenario, PruebaBase, cliente_de


class RestriccionesTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_intervalo_de_muestreo_entre_5_y_120(self):
        for invalido in (4, 121):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(
                    intervalo_muestreo_seg=invalido
                )

    def test_bateria_entre_0_y_100(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(nivel_bateria=101)

    def test_codigo_mqtt_unico(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Dispositivo.objects.create(
                area=self.e.area,
                nombre="Copia",
                codigo_mqtt=self.e.dispositivo.codigo_mqtt,
                registrado_por=self.e.admin,
            )

    def test_valores_por_defecto_de_la_base(self):
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.intervalo_muestreo_seg, 60)
        self.assertIsNotNone(self.e.dispositivo.fecha_alta)


class AccesoADispositivosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Escenario("b")

    def ids(self, usuario):
        r = cliente_de(usuario).get("/api/v1/dispositivos/")
        self.assertEqual(r.status_code, 200)
        return {d["num"] for d in r.json()["results"]}

    def test_aislamiento_por_organizacion(self):
        self.assertEqual(self.ids(self.e.admin), {self.e.dispositivo.pk})
        self.assertEqual(self.ids(self.otro.admin), {self.otro.dispositivo.pk})
        r = cliente_de(self.e.admin).get(f"/api/v1/dispositivos/{self.otro.dispositivo.pk}/")
        self.assertEqual(r.status_code, 404)

    def test_operador_solo_ve_su_dispositivo(self):
        otro_operador = self.e.usuario(roles.OPERADOR, "oper2")
        self.assertEqual(self.ids(self.e.operador), {self.e.dispositivo.pk})
        self.assertEqual(self.ids(otro_operador), set())

    def test_solo_el_administrador_da_de_alta_dispositivos(self):
        datos = {"area": self.e.area.pk, "nombre": "Nuevo", "codigo_mqtt": "NUC-NEW"}
        self.assertEqual(
            cliente_de(self.e.supervisor).post("/api/v1/dispositivos/", datos).status_code, 403
        )
        r = cliente_de(self.e.admin).post("/api/v1/dispositivos/", datos)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["registrado_por"], self.e.admin.pk)

    def test_supervisor_solo_ajusta_el_intervalo(self):
        cliente = cliente_de(self.e.supervisor)
        url = f"/api/v1/dispositivos/{self.e.dispositivo.pk}/"
        self.assertEqual(cliente.patch(url, {"nombre": "Otro"}).status_code, 400)
        r = cliente.patch(url, {"intervalo_muestreo_seg": 60})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(cliente.patch(url, {"intervalo_muestreo_seg": 200}).status_code, 400)

    def test_la_baja_conserva_el_dispositivo(self):
        r = cliente_de(self.e.admin).delete(f"/api/v1/dispositivos/{self.e.dispositivo.pk}/")
        self.assertEqual(r.status_code, 204)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_BAJA)


class SinConexionTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def configurar(self, segundos_sin_datos, estado=roles.DISPOSITIVO_EN_LINEA):
        Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(
            estado_dispositivo_id=estado,
            ultima_conexion=timezone.now() - timedelta(seconds=segundos_sin_datos),
        )

    def test_marca_el_dispositivo_que_dejo_de_enviar(self):
        self.configurar(200)  # intervalo 30 s x factor 3 = 90 s
        self.assertEqual(len(marcar_sin_conexion()), 1)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_SIN_CONEXION)

    def test_no_marca_al_que_envio_hace_poco(self):
        self.configurar(20)
        self.assertEqual(marcar_sin_conexion(), [])

    def test_respeta_mantenimiento(self):
        self.configurar(500, estado=roles.DISPOSITIVO_MANTENIMIENTO)
        self.assertEqual(marcar_sin_conexion(), [])


class CambioDeAreaTests(PruebaBase):
    def test_mover_de_area_quita_al_operador_de_otra_area(self):
        e = Escenario()
        r = cliente_de(e.admin).patch(
            f"/api/v1/dispositivos/{e.dispositivo.pk}/", {"area": e.otra_area.pk}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["operador"])

    def test_page_size_pide_mas_registros(self):
        e = Escenario()
        for i in range(3):
            e.usuario("OPER", f"extra-{i}")
        r = cliente_de(e.admin).get("/api/v1/usuarios/", {"page_size": 2})
        self.assertEqual(len(r.json()["results"]), 2)
        self.assertIsNotNone(r.json()["next"])


class FirmwareOTATests(PruebaBase):
    """Publicación del firmware y su descarga por el ESP con la clave del puente."""

    def setUp(self):
        import tempfile
        from pathlib import Path

        self.e = Escenario()
        self.codigo = self.e.dispositivo.codigo_mqtt
        self.dir = Path(tempfile.mkdtemp())
        self.origen = self.dir / "origen"
        (self.origen / "nucleo").mkdir(parents=True)
        (self.origen / "config.py").write_text('FIRMWARE_VERSION = "1.2.0"\n')
        (self.origen / "main.py").write_text("print('hola')\n")
        (self.origen / "nucleo" / "aplicacion.py").write_text("x = 1\n")
        (self.origen / "secrets.py").write_text("CLAVE = 'no'\n")
        (self.origen / "boot.py").write_text("import gc\n")
        self.ajustes = self.settings(
            NUCLEO_FIRMWARE_DIR=str(self.dir / "publicado"),
            NUCLEO_FIRMWARE_DISPOSITIVOS=[self.codigo],
            IA_PUENTE_CLAVE="k",
        )
        self.ajustes.enable()
        self.addCleanup(self.ajustes.disable)

    def _get(self, url, clave="k", **params):
        from rest_framework.test import APIClient

        return APIClient().get(
            url, {"dispositivo": self.codigo, **params}, HTTP_X_PUENTE_CLAVE=clave
        )

    def test_publica_sin_secretos_y_firma_el_manifiesto(self):
        import hashlib
        import hmac

        from apps.dispositivos import firmware

        manifiesto = firmware.publicar(self.origen)
        rutas = [a["ruta"] for a in manifiesto["archivos"]]
        self.assertEqual(rutas, ["main.py", "config.py", "nucleo/aplicacion.py"])
        r = self._get("/api/v1/puente/firmware/", version="1.0.0")
        self.assertEqual(r.status_code, 200)
        datos = r.json()
        esperado = hmac.new(
            b"k", firmware.canonico("1.2.0", datos["archivos"]), hashlib.sha256
        ).hexdigest()
        self.assertEqual(datos["firma"], esperado)
        # Con la misma versión no hay nada que hacer.
        self.assertEqual(self._get("/api/v1/puente/firmware/", version="1.2.0").status_code, 204)

    def test_descarga_archivos_y_bloquea_rutas_ajenas(self):
        from apps.dispositivos import firmware

        firmware.publicar(self.origen)
        r = self._get("/api/v1/puente/firmware/archivo/", version="1.2.0", ruta="main.py")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), b"print('hola')\n")
        for ruta in ("secrets.py", "../config.py", "boot.py", "manifiesto.json"):
            r = self._get("/api/v1/puente/firmware/archivo/", version="1.2.0", ruta=ruta)
            self.assertEqual(r.status_code, 404, ruta)
        self.assertEqual(self._get("/api/v1/puente/firmware/", clave="mala").status_code, 403)

    def test_solo_los_dispositivos_autorizados_y_version_inmutable(self):
        from apps.dispositivos import firmware

        firmware.publicar(self.origen)
        with self.settings(NUCLEO_FIRMWARE_DISPOSITIVOS=[]):
            self.assertEqual(self._get("/api/v1/puente/firmware/").status_code, 204)
        (self.origen / "main.py").write_text("print('otro')\n")
        with self.assertRaises(firmware.FirmwareError):
            firmware.publicar(self.origen)

    def test_guarda_la_version_que_informa_y_la_compara_con_la_publicada(self):
        from apps.dispositivos import firmware

        url = f"/api/v1/dispositivos/{self.e.dispositivo.pk}/"
        # Sin firmware publicado: el detalle no tiene contra qué comparar.
        detalle = cliente_de(self.e.admin).get(url).json()
        self.assertIsNone(detalle["version_firmware"])
        self.assertIsNone(detalle["version_firmware_publicada"])

        firmware.publicar(self.origen)
        # Aunque no le toque la actualización, la versión que trae queda registrada.
        with self.settings(NUCLEO_FIRMWARE_DISPOSITIVOS=[]):
            r = self._get("/api/v1/puente/firmware/", version="1.1.3")
            self.assertEqual(r.status_code, 204)
        datos = cliente_de(self.e.admin).get(url).json()
        self.assertEqual(datos["version_firmware"], "1.1.3")
        self.assertIsNotNone(datos["version_reportada_en"])
        self.assertEqual(datos["version_firmware_publicada"], "1.2.0")

        # Una versión con caracteres raros no se guarda; la última válida se conserva.
        self._get("/api/v1/puente/firmware/", version="1.2.0; rm -rf")
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.version_firmware, "1.1.3")

        # Solo lectura desde la API de la organización.
        r = cliente_de(self.e.admin).patch(url, {"version_firmware": "9.9.9"})
        self.assertEqual(r.status_code, 200)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.version_firmware, "1.1.3")
