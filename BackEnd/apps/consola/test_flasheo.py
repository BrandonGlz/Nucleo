import ast
import base64
import tempfile
from pathlib import Path
from unittest import mock

from django.test import override_settings

from apps.auditoria.models import RegistroAuditoria
from apps.consola import flasheo
from apps.dispositivos.models import Dispositivo
from common.testing import Escenario, PruebaBase, cliente_de


class FlasheoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.c = cliente_de(self.e.plataforma)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.passwd = Path(self.tmp.name) / "passwd"
        self.passwd.write_text("nucleo_backend:$7$101$x$y\n")
        ajustes = override_settings(
            NUCLEO_MOSQUITTO_PASSWD=str(self.passwd),
            NUCLEO_MOSQUITTO_CONTENEDOR="",
            IA_PUENTE_CLAVE="llave-de-prueba",
        )
        ajustes.enable()
        self.addCleanup(ajustes.disable)
        self.disp = Dispositivo.objects.first()

    def test_solo_el_superusuario(self):
        for ruta in ("flasheo/", "flasheo/archivos/", "flasheo/micropython/ESP32/"):
            self.assertEqual(
                cliente_de(self.e.admin).get(f"/api/v1/consola/{ruta}").status_code, 403
            )
        r = cliente_de(self.e.admin).post(
            "/api/v1/consola/flasheo/configuracion/", {}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_inventario_y_archivos_del_repositorio(self):
        r = self.c.get("/api/v1/consola/flasheo/")
        self.assertEqual(r.status_code, 200)
        chips = {c["chip"]: c for c in r.data["micropython"]}
        self.assertEqual(chips["ESP32"]["direccion"], 0x1000)
        self.assertEqual(chips["ESP32-S3"]["direccion"], 0)
        self.assertNotIn("_S3", chips["ESP32"]["archivo"])
        self.assertTrue(r.data["version"])
        r = self.c.get("/api/v1/consola/flasheo/archivos/")
        rutas = {a["ruta"] for a in r.data["archivos"]}
        self.assertTrue({"boot.py", "main.py", "config.py", "nucleo/aplicacion.py"} <= rutas)
        self.assertNotIn("secrets.py", rutas)
        self.assertFalse(any("__pycache__" in x for x in rutas))
        main = next(a for a in r.data["archivos"] if a["ruta"] == "main.py")
        self.assertIn(b"ejecutar", base64.b64decode(main["contenido"]))

    def test_descarga_micropython(self):
        r = self.c.get("/api/v1/consola/flasheo/micropython/ESP32-S3/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/octet-stream")
        self.assertEqual(
            self.c.get("/api/v1/consola/flasheo/micropython/ESP8266/").status_code, 404
        )

    def test_configuracion_da_de_alta_en_mosquitto_y_arma_secrets(self):
        r = self.c.post(
            "/api/v1/consola/flasheo/configuracion/",
            {
                "dispositivo": self.disp.pk,
                "puente": True,
                "redes": [
                    {"ssid": "Oficina", "password": "wifi'1"},
                    {"ssid": "Hotspot", "password": ""},
                ],
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        texto = r.data["secrets"]
        ast.parse(texto)  # Python válido para MicroPython
        valores = {}
        exec(texto, valores)  # noqa: S102 - texto generado por la propia API
        self.assertEqual(valores["CODIGO_MQTT"], self.disp.codigo_mqtt)
        self.assertEqual(valores["WIFI_PASSWORD"], "wifi'1")
        self.assertEqual(valores["REDES"], [("Hotspot", "")])
        self.assertEqual(valores["MODO"], "puente")
        self.assertEqual(valores["PUENTE_CLAVE"], "llave-de-prueba")
        lineas = self.passwd.read_text().splitlines()
        self.assertEqual(len(lineas), 2)
        self.assertTrue(lineas[1].startswith(f"{self.disp.codigo_mqtt}:$7$101$"))
        self.disp.refresh_from_db()
        self.assertTrue(self.disp.puente_ia)
        self.assertTrue(
            RegistroAuditoria.objects.filter(
                recurso="dispositivo",
                recurso_num=str(self.disp.pk),
                descripcion__contains="firmware",
            ).exists()
        )
        # Otra carga reemplaza la contraseña, no duplica el usuario.
        self.c.post(
            "/api/v1/consola/flasheo/configuracion/",
            {"dispositivo": self.disp.pk, "redes": [{"ssid": "a", "password": "b"}]},
            format="json",
        )
        self.assertEqual(len(self.passwd.read_text().splitlines()), 2)

    def test_recarga_el_broker(self):
        with (
            override_settings(NUCLEO_MOSQUITTO_CONTENEDOR="nucleo_mosquitto"),
            mock.patch.object(flasheo.subprocess, "run") as correr,
        ):
            r = self.c.post(
                "/api/v1/consola/flasheo/configuracion/",
                {"dispositivo": self.disp.pk, "redes": [{"ssid": "a", "password": "b"}]},
                format="json",
            )
        self.assertEqual(r.data["aviso"], "")
        self.assertEqual(
            correr.call_args.args[0], ["docker", "kill", "-s", "HUP", "nucleo_mosquitto"]
        )

    def test_valida_datos(self):
        r = self.c.post(
            "/api/v1/consola/flasheo/configuracion/",
            {"dispositivo": 999999, "redes": [{"ssid": "a", "password": "b"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        r = self.c.post(
            "/api/v1/consola/flasheo/configuracion/",
            {"dispositivo": self.disp.pk, "redes": []},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
