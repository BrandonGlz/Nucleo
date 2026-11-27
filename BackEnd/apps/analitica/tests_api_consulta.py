"""Pruebas de las rutas de consulta, CSV y hallazgos de Analítica."""

from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from apps.analitica import tarjetas
from apps.mediciones.models import Lectura
from common.testing import Escenario, PruebaBase, cliente_de


class ConsultaAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.fin = timezone.now()
        self.inicio = self.fin - timedelta(hours=2)
        for minutos, valor in ((0, 20), (30, 24)):
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
        self.tarjeta = {
            "id": "t1",
            "tipo": "kpi",
            "titulo": "Lecturas",
            "opciones": {
                "indicador": "lecturas",
                "variable": "TEMP",
                "nivel": "",
                "comparar": False,
                "sparkline": True,
            },
        }
        self.admin = cliente_de(self.e.admin)

    def _post(self, datos, cliente=None):
        return (cliente or self.admin).post(
            "/api/v1/analitica/consulta/",
            datos,
            format="json",
        )

    def test_devuelve_las_tarjetas_y_el_periodo(self):
        r = self._post({"tarjetas": [self.tarjeta], "filtros": self.filtros})
        self.assertEqual(r.status_code, 200, r.content)
        cuerpo = r.json()
        self.assertIn("generado", cuerpo)
        self.assertIn("periodo", cuerpo)
        self.assertIn("previo", cuerpo)
        self.assertEqual(cuerpo["intervalo"], "15m")
        self.assertEqual(cuerpo["tarjetas"]["t1"]["valor"], 2)
        self.assertEqual(cuerpo["tarjetas"]["t1"]["tipo"], "kpi")

    def test_analista_consulta_y_operador_no(self):
        for usuario, esperado in (
            (self.e.analista, 200),
            (self.e.supervisor, 200),
            (self.e.operador, 403),
            (self.e.plataforma, 403),
        ):
            with self.subTest(usuario=usuario.rol_id):
                r = self._post(
                    {"tarjetas": [self.tarjeta], "filtros": self.filtros},
                    cliente_de(usuario),
                )
                self.assertEqual(r.status_code, esperado, r.content)

    def test_limite_de_doce_tarjetas(self):
        tarjetas_12 = [{**self.tarjeta, "id": f"t{indice}"} for indice in range(12)]
        self.assertEqual(
            self._post({"tarjetas": tarjetas_12, "filtros": self.filtros}).status_code,
            200,
        )
        tarjetas_13 = [{**self.tarjeta, "id": f"t{indice}"} for indice in range(13)]
        r = self._post({"tarjetas": tarjetas_13, "filtros": self.filtros})
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("12", str(r.json()))

    def test_valida_las_tarjetas(self):
        r = self._post(
            {
                "tarjetas": [{**self.tarjeta, "opciones": {"indicador": "inventado"}}],
                "filtros": self.filtros,
            }
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn("indicador", str(r.json()))

        r = self._post({"filtros": self.filtros})
        self.assertEqual(r.status_code, 400, r.content)

    def test_una_tarjeta_con_error_no_tumba_las_demas(self):
        segunda = {**self.tarjeta, "id": "t2"}
        original = tarjetas.calcular
        with mock.patch.object(
            tarjetas,
            "calcular",
            side_effect=lambda tarjeta, consulta: (_ for _ in ()).throw(
                RuntimeError("falla")
            )
            if tarjeta["id"] == "t1"
            else original(tarjeta, consulta),
        ):
            r = self._post(
                {"tarjetas": [self.tarjeta, segunda], "filtros": self.filtros}
            )
        self.assertEqual(r.status_code, 200, r.content)
        cuerpo = r.json()["tarjetas"]
        self.assertIn("error", cuerpo["t1"])
        self.assertEqual(cuerpo["t2"]["valor"], 2)

    def test_cache_de_sesenta_segundos(self):
        cache.clear()
        with mock.patch.object(tarjetas, "calcular", wraps=tarjetas.calcular) as calcular:
            primera = self._post({"tarjetas": [self.tarjeta], "filtros": self.filtros})
            segunda = self._post({"tarjetas": [self.tarjeta], "filtros": self.filtros})
        self.assertEqual(primera.status_code, 200)
        self.assertEqual(segunda.status_code, 200)
        self.assertEqual(primera.json(), segunda.json())
        self.assertEqual(calcular.call_count, 1)


class CSVAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.fin = timezone.now()
        self.inicio = self.fin - timedelta(hours=1)
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=20,
            fecha_hora=self.inicio,
        )
        self.filtros = {
            "periodo": "personalizado",
            "desde": self.inicio.isoformat(),
            "hasta": self.fin.isoformat(),
        }
        self.admin = cliente_de(self.e.admin)

    def _csv(self, tarjeta, filtros=None):
        return self.admin.post(
            "/api/v1/analitica/consulta/csv/",
            {"tarjeta": tarjeta, "filtros": filtros or self.filtros},
            format="json",
        )

    def test_csv_con_encabezados_y_nombre(self):
        r = self._csv(
            {
                "id": "t1",
                "tipo": "kpi",
                "titulo": "Lecturas",
                "opciones": {
                    "indicador": "lecturas",
                    "variable": "TEMP",
                    "nivel": "",
                    "comparar": False,
                    "sparkline": False,
                },
            }
        )
        self.assertEqual(r.status_code, 200, r.content if hasattr(r, "content") else b"")
        self.assertIn("text/csv", r["Content-Type"])
        self.assertIn("analitica_lecturas_", r["Content-Disposition"])
        contenido = b"".join(r.streaming_content).decode("utf-8-sig")
        self.assertIn("Métrica", contenido)
        self.assertIn("Lecturas", contenido)

    def test_csv_neutraliza_formulas(self):
        r = self._csv(
            {
                "id": "t1",
                "tipo": "texto",
                "titulo": "=SUM(A1)",
                "opciones": {"nota": "=1+1"},
            }
        )
        self.assertEqual(r.status_code, 200, r.content if hasattr(r, "content") else b"")
        contenido = b"".join(r.streaming_content).decode("utf-8-sig")
        self.assertIn("'=1+1", contenido)

    def test_csv_de_hallazgos_no_existe(self):
        r = self._csv({"id": "t1", "tipo": "hallazgos", "titulo": "Hallazgos"})
        self.assertEqual(r.status_code, 400, r.content)


@override_settings(IA_OLLAMA_URL="", IA_MODELO_LOCAL="")
class HallazgosAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.fin = timezone.now()
        self.inicio = self.fin - timedelta(hours=2)
        Lectura.objects.create(
            sensor_num=self.e.dht22.pk,
            variable_codigo="TEMP",
            valor=20,
            fecha_hora=self.inicio,
        )
        self.admin = cliente_de(self.e.admin)
        self.tarjeta = {
            "id": "t1",
            "tipo": "kpi",
            "titulo": "Lecturas",
            "opciones": {
                "indicador": "lecturas",
                "variable": "TEMP",
                "nivel": "",
                "comparar": False,
                "sparkline": False,
            },
        }

    def test_hallazgos_locales(self):
        r = self.admin.post(
            "/api/v1/analitica/hallazgos/",
            {
                "tarjetas": [self.tarjeta],
                "filtros": {
                    "periodo": "personalizado",
                    "desde": self.inicio.isoformat(),
                    "hasta": self.fin.isoformat(),
                },
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        cuerpo = r.json()
        self.assertIn(cuerpo["origen"], ("local", "ia"))
        self.assertGreaterEqual(len(cuerpo["hallazgos"]), 1)
        self.assertLessEqual(len(cuerpo["hallazgos"]), 5)
