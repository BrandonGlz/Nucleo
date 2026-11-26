"""Pruebas del anexo CSV y de su adjunto en el correo."""

from datetime import timedelta
from unittest import mock

from django.core import mail
from django.utils import timezone

from apps.mediciones.models import Lectura
from apps.reportes import formatos, servicios
from apps.reportes.models import FormatoReporte, Reporte, VersionFormato
from common.testing import Escenario, PruebaBase, cliente_de


class CsvReporteTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.ahora = timezone.now()
        self.inicio = self.ahora - timedelta(hours=1)
        self.reporte = Reporte.objects.create(
            organizacion=self.e.organizacion,
            area=self.e.area,
            origen="MANUAL",
            periodo_inicio=self.inicio,
            periodo_fin=self.ahora,
            cifras={},
            contenido="Prueba",
        )

    def _lecturas(self):
        return [
            Lectura.objects.create(
                sensor_num=self.e.dht22.pk,
                variable_codigo="TEMP",
                valor=24.5,
                fecha_hora=self.inicio + timedelta(minutes=1),
            ),
            Lectura.objects.create(
                sensor_num=self.e.ccs811.pk,
                variable_codigo="AIRE",
                valor=700,
                fecha_hora=self.inicio + timedelta(minutes=2),
                estabilizada=False,
            ),
        ]

    def test_csv_trae_columnas_y_filas_del_reporte(self):
        self._lecturas()
        respuesta = cliente_de(self.e.analista).get(
            f"/api/v1/reportes/{self.reporte.num}/csv/"
        )

        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta["Content-Type"], "text/csv; charset=utf-8")
        contenido = b"".join(respuesta.streaming_content).decode("utf-8")
        lineas = contenido.strip().splitlines()

        self.assertIn(
            "Fecha y hora local,Dispositivo,Área,Variable,Valor,Unidad,Estabilizada",
            lineas[0],
        )
        self.assertIn(self.e.dispositivo.nombre, lineas[1])
        self.assertIn("Temperatura", lineas[1])
        self.assertIn("24.50", lineas[1])
        self.assertIn("Sí", lineas[1])
        self.assertIn("Calidad del aire", lineas[2])
        self.assertIn("No", lineas[2])

    def _reporte_con_formato(self, adjuntar):
        formato = FormatoReporte.objects.create(
            organizacion=self.e.organizacion,
            nombre=f"CSV {'sí' if adjuntar else 'no'}",
        )
        version = VersionFormato.objects.create(
            formato=formato,
            numero=1,
            conf={**formatos.CONF_OPERATIVO, "hoja": {"adjuntar_csv": adjuntar}},
        )
        reporte = Reporte.objects.create(
            organizacion=self.e.organizacion,
            area=self.e.area,
            formato_version=version,
            origen="MANUAL",
            periodo_inicio=self.inicio,
            periodo_fin=self.ahora,
            cifras={},
            contenido="Prueba",
        )
        return reporte

    def test_csv_grande_se_comprime(self):
        with mock.patch(
            "apps.reportes.servicios.contenido_csv",
            return_value=b"x" * (5 * 1024 * 1024 + 1),
        ):
            nombre, contenido, tipo = servicios.adjunto_csv(self.reporte)

        self.assertTrue(nombre.endswith(".csv.zip"))
        self.assertEqual(tipo, "application/zip")
        self.assertTrue(contenido.startswith(b"PK"))

    def test_adjunta_el_csv_solo_si_el_formato_lo_pide(self):
        self._lecturas()
        primero = self._reporte_con_formato(True)
        with mock.patch("apps.reportes.servicios.pdf.construir", return_value=b"%PDF"):
            servicios.enviar_reporte(primero, [self.e.analista.pk])
        adjuntos = [nombre for nombre, _, _ in mail.outbox[0].attachments]
        self.assertIn(f"reporte-{primero.num}.csv", adjuntos)

        mail.outbox.clear()
        segundo = self._reporte_con_formato(False)
        with mock.patch("apps.reportes.servicios.pdf.construir", return_value=b"%PDF"):
            servicios.enviar_reporte(segundo, [self.e.analista.pk])
        adjuntos = [nombre for nombre, _, _ in mail.outbox[0].attachments]
        self.assertFalse(any(nombre.endswith(".csv") for nombre in adjuntos))
