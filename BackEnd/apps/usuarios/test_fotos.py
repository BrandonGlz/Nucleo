import io
import tempfile
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.usuarios import fotos
from common.testing import Escenario, PruebaBase, cliente_de


def imagen(formato="PNG", tamano=(400, 300), modo="RGB", nombre=None):
    salida = io.BytesIO()
    Image.new(modo, tamano, (200, 40, 40)).save(salida, format=formato)
    extension = {"JPEG": "jpg"}.get(formato, formato.lower())
    return SimpleUploadedFile(
        nombre or f"foto.{extension}", salida.getvalue(), content_type=f"image/{extension}"
    )


class FotoDePerfilTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.carpeta = tempfile.TemporaryDirectory()
        self.medios = override_settings(MEDIA_ROOT=self.carpeta.name)
        self.medios.enable()
        self.cliente = cliente_de(self.e.operador)

    def tearDown(self):
        self.medios.disable()
        self.carpeta.cleanup()

    def subir(self, archivo, cliente=None):
        return (cliente or self.cliente).post(
            "/api/v1/auth/foto/", {"foto": archivo}, format="multipart"
        )

    def archivos(self):
        return sorted((Path(self.carpeta.name) / "fotos").glob("*"))

    def test_sube_una_foto_valida_y_la_deja_en_webp_256(self):
        r = self.subir(imagen("JPEG", (800, 400)))
        self.assertEqual(r.status_code, 200, r.content)
        url = r.json()["foto_url"]
        self.assertRegex(url, r"^/api/v1/fotos/[0-9a-f]{32}\.webp$")
        self.e.operador.refresh_from_db()
        ruta = Path(self.carpeta.name) / self.e.operador.foto
        with Image.open(ruta) as guardada:
            self.assertEqual(guardada.format, "WEBP")
            self.assertEqual(guardada.size, (256, 256))
        # Se entrega por la API a otra sesión válida, con caché larga.
        foto = cliente_de(self.e.admin).get(url)
        self.assertEqual(foto.status_code, 200)
        self.assertEqual(foto["Content-Type"], "image/webp")
        self.assertIn("immutable", foto["Cache-Control"])
        # Y aparece en /auth/yo/ y en el listado de usuarios.
        self.assertEqual(self.cliente.get("/api/v1/auth/yo/").json()["foto_url"], url)
        lista = cliente_de(self.e.admin).get("/api/v1/usuarios/").json()["results"]
        self.assertEqual(next(u for u in lista if u["num"] == self.e.operador.num)["foto_url"], url)

    def test_acepta_png_con_transparencia_y_webp(self):
        self.assertEqual(self.subir(imagen("PNG", modo="RGBA")).status_code, 200)
        self.assertEqual(self.subir(imagen("WEBP")).status_code, 200)

    def test_sin_sesion_no_se_ve_ni_se_sube(self):
        url = self.subir(imagen()).json()["foto_url"]
        self.assertEqual(APIClient().get(url).status_code, 401)
        self.assertEqual(self.subir(imagen(), cliente=APIClient()).status_code, 401)

    def test_rechaza_un_archivo_que_no_es_imagen(self):
        falso = SimpleUploadedFile("foto.png", b"esto no es una imagen", content_type="image/png")
        r = self.subir(falso)
        self.assertEqual(r.status_code, 400)
        self.assertIn("foto", r.json())
        self.assertEqual(self.archivos(), [])

    def test_rechaza_formatos_no_permitidos_aunque_la_extension_diga_otra_cosa(self):
        r = self.subir(imagen("GIF", nombre="foto.jpg"))
        self.assertEqual(r.status_code, 400)

    def test_rechaza_una_foto_de_mas_de_5_mb(self):
        grande = SimpleUploadedFile(
            "grande.jpg", b"\xff\xd8" + b"0" * (fotos.TAMANO_MAXIMO + 1), content_type="image/jpeg"
        )
        r = self.subir(grande)
        self.assertEqual(r.status_code, 400)
        self.assertIn("5 MB", r.json()["foto"][0])

    def test_rechaza_imagenes_con_demasiados_pixeles(self):
        fotos.PIXELES_MAXIMOS, antes = 100, fotos.PIXELES_MAXIMOS
        try:
            self.assertEqual(self.subir(imagen(tamano=(20, 20))).status_code, 400)
        finally:
            fotos.PIXELES_MAXIMOS = antes

    def test_reemplazar_borra_la_foto_anterior(self):
        primera = self.subir(imagen()).json()["foto_url"]
        segunda = self.subir(imagen("JPEG")).json()["foto_url"]
        self.assertNotEqual(primera, segunda)
        self.assertEqual([p.name for p in self.archivos()], [segunda.rsplit("/", 1)[1]])
        self.assertEqual(self.cliente.get(primera).status_code, 404)

    def test_quitar_la_foto(self):
        self.subir(imagen())
        r = self.cliente.delete("/api/v1/auth/foto/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()["foto_url"])
        self.assertEqual(self.archivos(), [])
        self.e.operador.refresh_from_db()
        self.assertIsNone(self.e.operador.foto)
        # Quitarla sin tener foto no falla.
        self.assertEqual(self.cliente.delete("/api/v1/auth/foto/").status_code, 200)

    def test_cada_quien_solo_cambia_la_suya(self):
        # La ruta no recibe usuario: un administrador que sube una foto cambia la suya.
        self.subir(imagen(), cliente=cliente_de(self.e.admin))
        self.e.operador.refresh_from_db()
        self.e.admin.refresh_from_db()
        self.assertIsNone(self.e.operador.foto)
        self.assertTrue(self.e.admin.foto)
        # Ni la gestión de usuarios ni la consola permiten escribir la foto de otro.
        r = cliente_de(self.e.admin).patch(
            f"/api/v1/usuarios/{self.e.operador.num}/",
            {"foto": "fotos/" + "0" * 32 + ".webp", "foto_url": "/x"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.e.operador.refresh_from_db()
        self.assertIsNone(self.e.operador.foto)

    def test_nombres_no_validos_dan_404(self):
        self.assertEqual(self.cliente.get("/api/v1/fotos/..%2Fsecreto.webp").status_code, 404)
        self.assertEqual(self.cliente.get("/api/v1/fotos/" + "a" * 32 + ".webp").status_code, 404)
