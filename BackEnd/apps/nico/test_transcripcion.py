from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from common.testing import Escenario, PruebaBase, cliente_de

URL = "/api/v1/nico/transcribir/"


class TranscribirTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def audio(self, contenido=b"audio-falso"):
        return {"audio": SimpleUploadedFile("dictado.webm", contenido, content_type="audio/webm")}

    @mock.patch("apps.nico.transcripcion.transcribir", return_value="¿Cómo estuvo la temperatura?")
    def test_devuelve_el_texto(self, _):
        r = cliente_de(self.e.analista).post(URL, self.audio(), format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["texto"], "¿Cómo estuvo la temperatura?")

    @mock.patch("apps.nico.transcripcion.transcribir", return_value="hola")
    def test_permisos(self, _):
        self.assertEqual(APIClient().post(URL, self.audio(), format="multipart").status_code, 401)
        # El operador sin acceso al agente no dicta; el superusuario sí (consola de Nico AI).
        self.assertEqual(
            cliente_de(self.e.operador).post(URL, self.audio(), format="multipart").status_code, 403
        )
        self.assertEqual(
            cliente_de(self.e.plataforma).post(URL, self.audio(), format="multipart").status_code,
            200,
        )

    def test_rechaza_sin_audio_y_errores_del_modelo(self):
        cliente = cliente_de(self.e.analista)
        self.assertEqual(cliente.post(URL, {}, format="multipart").status_code, 400)
        with mock.patch("apps.nico.transcripcion.transcribir", side_effect=RuntimeError):
            self.assertEqual(cliente.post(URL, self.audio(), format="multipart").status_code, 503)


class VozTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    @mock.patch("apps.nico.voz.sintetizar_mp3", return_value=b"ID3audio")
    def test_devuelve_mp3(self, _):
        r = cliente_de(self.e.analista).post(
            "/api/v1/nico/voz/",
            {"texto": "Hola, soy Nico."},
            format="json",
            HTTP_ACCEPT="audio/mpeg",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "audio/mpeg")
        self.assertEqual(r.content, b"ID3audio")

    def test_permisos_y_largo(self):
        self.assertEqual(
            APIClient().post("/api/v1/nico/voz/", {"texto": "x"}, format="json").status_code, 401
        )
        cliente = cliente_de(self.e.analista)
        self.assertEqual(
            cliente.post("/api/v1/nico/voz/", {"texto": "x" * 700}, format="json").status_code, 400
        )
