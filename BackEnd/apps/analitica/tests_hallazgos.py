"""Pruebas de los hallazgos de Nico AI y de su respaldo local."""

from datetime import datetime, timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from apps.analitica import catalogo, hallazgos
from apps.mediciones.models import Lectura
from common.testing import Escenario, PruebaBase


class HallazgosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.inicio = timezone.make_aware(datetime(2026, 11, 2, 0, 0))
        self.fin = self.inicio + timedelta(hours=2)
        for minutos, valor in ((0, 20), (10, 26), (20, 10), (30, 24)):
            Lectura.objects.create(
                sensor_num=self.e.dht22.pk,
                variable_codigo="TEMP",
                valor=valor,
                fecha_hora=self.inicio + timedelta(minutes=minutos),
                estabilizada=True,
            )
        self.filtros = {
            "periodo": "personalizado",
            "desde": self.inicio.isoformat(),
            "hasta": self.fin.isoformat(),
        }
        self.tarjeta = catalogo.validar_tarjeta(
            {
                "id": "t1",
                "tipo": "kpi",
                "titulo": "Cumplimiento",
                "opciones": {
                    "indicador": "cumplimiento",
                    "variable": "TEMP",
                    "nivel": "",
                    "comparar": True,
                    "sparkline": False,
                },
                "meta": {"valor": 95, "sentido": "mayor", "tolerancia": 5},
            }
        )

    def _generar(self):
        return hallazgos.generar(self.e.admin, [self.tarjeta], self.filtros)

    @override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
    def test_sin_ia_usa_reglas_locales(self):
        respuesta = self._generar()
        self.assertEqual(respuesta["origen"], "local")
        self.assertGreaterEqual(len(respuesta["hallazgos"]), 3)
        self.assertLessEqual(len(respuesta["hallazgos"]), 5)
        for hallazgo in respuesta["hallazgos"]:
            self.assertLessEqual(len(hallazgo), 140)

    @override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
    def test_la_ia_devuelve_hallazgos_validos(self):
        candidatos = [
            "Cumplimiento de 50 % en el periodo.",
            "El valor 50 % está lejos de la meta de 95 %.",
            "La meta es 95 % para este indicador.",
        ]
        with mock.patch.object(hallazgos, "_consultar_ia", return_value=candidatos):
            respuesta = self._generar()
        self.assertEqual(respuesta["origen"], "ia")
        self.assertEqual(respuesta["hallazgos"], candidatos)

    @override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
    def test_la_ia_no_puede_inventar_cifras(self):
        candidatos = [
            "Cumplimiento de 99 % en el periodo.",
            "Un valor 1234 que no está en el resumen.",
            "Otra cifra 777.",
        ]
        with mock.patch.object(hallazgos, "_consultar_ia", return_value=candidatos):
            respuesta = self._generar()
        self.assertEqual(respuesta["origen"], "local")
        self.assertNotIn("99 %", " ".join(respuesta["hallazgos"]))
        self.assertNotIn("1234", " ".join(respuesta["hallazgos"]))

    @override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
    def test_los_hallazgos_se_cachean_diez_minutos(self):
        with mock.patch.object(
            hallazgos,
            "_consultar_ia",
            return_value=[
                "Cumplimiento de 50 %.",
                "La meta de 95 % sigue lejos.",
                "El periodo tiene datos de 50 %.",
            ],
        ) as ia:
            primera = self._generar()
            segunda = self._generar()
        self.assertEqual(primera, segunda)
        self.assertEqual(ia.call_count, 1)

    @override_settings(IA_OLLAMA_URL="http://127.0.0.1:9", IA_MODELO_LOCAL="prueba")
    def test_si_la_ia_falla_cae_a_locales(self):
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("60 s")):
            self.assertIsNone(hallazgos._consultar_ia({"tarjetas": []}))

    @override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
    def test_el_resumen_solo_tiene_cifras_calculadas(self):
        respuesta = self._generar()
        self.assertGreaterEqual(len(respuesta["hallazgos"]), 3)
        self.assertTrue(all(len(texto) <= 140 for texto in respuesta["hallazgos"]))
