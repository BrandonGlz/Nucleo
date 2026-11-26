"""Pruebas del logo y el color de la organización en los reportes."""

import io
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.organizaciones import logos
from apps.organizaciones.serializers import contraste_con_blanco
from apps.reportes import pdf
from apps.reportes.formatos import CONF_OPERATIVO
from common.testing import Escenario, PruebaBase, cliente_de


def imagen(formato="PNG", tamano=(400, 300), modo="RGB", nombre=None):
    salida = io.BytesIO()
    Image.new(modo, tamano, (40, 90, 180)).save(salida, format=formato)
    extension = {"JPEG": "jpg"}.get(formato, formato.lower())
    return SimpleUploadedFile(
        nombre or f"logo.{extension}", salida.getvalue(), content_type=f"image/{extension}"
    )


class LogoDeOrganizacionTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.carpeta = tempfile.TemporaryDirectory()
        self.medios = override_settings(MEDIA_ROOT=self.carpeta.name)
        self.medios.enable()
        self.admin = cliente_de(self.e.admin)

    def tearDown(self):
        self.medios.disable()
        self.carpeta.cleanup()

    def subir(self, archivo, cliente=None):
        return (cliente or self.admin).post(
            f"/api/v1/organizaciones/{self.e.organizacion.num}/logo/",
            {"logo": archivo},
            format="multipart",
        )

    def archivos(self):
        return sorted((Path(self.carpeta.name) / "logos").glob("*"))

    def test_sube_un_logo_valido_sin_recortar_y_lo_sirve_con_sesion(self):
        r = self.subir(imagen("JPEG", (1200, 400)))
        self.assertEqual(r.status_code, 200, r.content)
        url = r.json()["logo_url"]
        self.assertRegex(url, r"^/api/v1/logos/[0-9a-f]{32}\.png$")
        self.e.organizacion.refresh_from_db()
        ruta = Path(self.carpeta.name) / self.e.organizacion.logo
        with Image.open(ruta) as guardada:
            self.assertEqual(guardada.format, "PNG")
            # 1200×400 conserva la proporción 3:1 dentro de 600×200.
            self.assertEqual(guardada.size, (600, 200))
        # Se entrega solo a una sesión válida.
        self.assertEqual(APIClient().get(url).status_code, 401)
        entrega = cliente_de(self.e.supervisor).get(url)
        self.assertEqual(entrega.status_code, 200)
        self.assertEqual(entrega["Content-Type"], "image/png")
        self.assertIn("immutable", entrega["Cache-Control"])
        # La ruta aparece en la organización, sin exponer el nombre interno.
        cuerpo = self.admin.get(f"/api/v1/organizaciones/{self.e.organizacion.num}/").json()
        self.assertEqual(cuerpo["logo_url"], url)
        self.assertNotIn("logo", cuerpo)

    def test_rechaza_un_archivo_que_no_es_imagen(self):
        falso = SimpleUploadedFile("logo.png", b"esto no es una imagen", content_type="image/png")
        r = self.subir(falso)
        self.assertEqual(r.status_code, 400)
        self.assertIn("logo", r.json())
        self.assertEqual(self.archivos(), [])

    def test_rechaza_formatos_no_permitidos_y_logos_de_mas_de_2_mb(self):
        self.assertEqual(self.subir(imagen("GIF", nombre="logo.png")).status_code, 400)
        grande = SimpleUploadedFile(
            "grande.png", b"\x89PNG" + b"0" * (logos.TAMANO_MAXIMO + 1), content_type="image/png"
        )
        r = self.subir(grande)
        self.assertEqual(r.status_code, 400)
        self.assertIn("2 MB", r.json()["logo"][0])

    def test_solo_el_administrador_cambia_el_logo(self):
        for usuario in (self.e.supervisor, self.e.analista, self.e.operador, self.e.plataforma):
            with self.subTest(rol=usuario.rol_id):
                r = self.subir(imagen(), cliente=cliente_de(usuario))
                self.assertEqual(r.status_code, 403)
        self.e.organizacion.refresh_from_db()
        self.assertIsNone(self.e.organizacion.logo)

    def test_reemplazar_borra_el_logo_anterior_y_quitarlo_lo_elimina(self):
        primero = self.subir(imagen()).json()["logo_url"]
        segundo = self.subir(imagen("WEBP")).json()["logo_url"]
        self.assertNotEqual(primero, segundo)
        self.assertEqual([p.name for p in self.archivos()], [segundo.rsplit("/", 1)[1]])
        self.assertEqual(cliente_de(self.e.admin).get(primero).status_code, 404)

        r = self.admin.delete(f"/api/v1/organizaciones/{self.e.organizacion.num}/logo/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["logo_url"])
        self.assertEqual(self.archivos(), [])
        # Quitarlo sin tener logo no falla.
        self.assertEqual(
            self.admin.delete(
                f"/api/v1/organizaciones/{self.e.organizacion.num}/logo/"
            ).status_code,
            200,
        )

    def test_nombres_no_validos_dan_404(self):
        self.assertEqual(self.admin.get("/api/v1/logos/..%2Fsecreto.png").status_code, 404)
        self.assertEqual(self.admin.get("/api/v1/logos/" + "a" * 32 + ".png").status_code, 404)


class ColorDeReportesTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.admin = cliente_de(self.e.admin)
        self.url = f"/api/v1/organizaciones/{self.e.organizacion.num}/"

    def test_acepta_un_color_con_contraste_y_lo_normaliza(self):
        r = self.admin.patch(self.url, {"color_reporte": "#0f7a45"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["color_reporte"], "#0F7A45")
        self.e.organizacion.refresh_from_db()
        self.assertEqual(self.e.organizacion.color_reporte, "#0F7A45")

    def test_rechaza_formatos_invalidos(self):
        for color in ("rojo", "#12345", "123456", "#GGGGGG", 123):
            with self.subTest(color=color):
                r = self.admin.patch(self.url, {"color_reporte": color}, format="json")
                self.assertEqual(r.status_code, 400)
                self.assertIn("color_reporte", r.json())

    def test_rechaza_colores_sin_contraste_contra_blanco(self):
        self.assertLess(contraste_con_blanco("#FFFF00"), 3)
        r = self.admin.patch(self.url, {"color_reporte": "#FFFF00"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("no se leería", r.json()["color_reporte"][0])

    def test_el_verde_de_nucleo_se_puede_restablecer_con_null(self):
        self.admin.patch(self.url, {"color_reporte": "#0F7A45"}, format="json")
        r = self.admin.patch(self.url, {"color_reporte": None}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()["color_reporte"])

    def test_solo_el_administrador_cambia_el_color(self):
        for usuario in (self.e.supervisor, self.e.operador, self.e.plataforma):
            with self.subTest(rol=usuario.rol_id):
                r = cliente_de(usuario).patch(self.url, {"color_reporte": "#0F7A45"}, format="json")
                self.assertEqual(r.status_code, 403)
        self.e.organizacion.refresh_from_db()
        self.assertIsNone(self.e.organizacion.color_reporte)

    def test_no_permite_cambiar_el_logo_por_patch(self):
        r = self.admin.patch(self.url, {"logo": "logos/" + "0" * 32 + ".png"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.e.organizacion.refresh_from_db()
        self.assertIsNone(self.e.organizacion.logo)

    def test_un_logo_dañado_no_rompe_el_pdf(self):
        with tempfile.TemporaryDirectory() as carpeta, override_settings(MEDIA_ROOT=carpeta):
            logos._carpeta().mkdir(parents=True)
            (logos._carpeta() / ("0" * 32 + ".png")).write_bytes(b"no es un png")
            self.e.organizacion.logo = f"logos/{'0' * 32}.png"
            self.e.organizacion.save(update_fields=["logo"])
            ahora = timezone.now()
            reporte = SimpleNamespace(
                num=9,
                organizacion=self.e.organizacion,
                area=None,
                area_id=None,
                periodo_inicio=ahora,
                periodo_fin=ahora,
                fecha_generacion=ahora,
                origen="MANUAL",
                cifras={},
                contenido="",
                formato_version=SimpleNamespace(conf=CONF_OPERATIVO),
                formato_version_id=1,
            )
            with mock.patch.object(pdf, "_dibujar_logo", wraps=pdf._dibujar_logo):
                datos = pdf.construir(reporte)
        self.assertTrue(datos.startswith(b"%PDF"))
