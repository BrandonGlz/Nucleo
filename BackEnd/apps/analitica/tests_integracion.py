"""Pruebas de integración del motor de consultas de Analítica."""

import json
from datetime import datetime, timedelta
from unittest import mock

from django.test import override_settings
from django.utils import timezone

from apps.analitica import catalogo, filtros, hallazgos, tarjetas
from apps.dispositivos.models import Dispositivo, Sensor
from apps.mediciones.models import Lectura
from apps.nico import configuracion
from common.testing import Escenario, PruebaBase, cliente_de


class VariacionYCruzadoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.inicio = timezone.make_aware(datetime(2026, 11, 2, 0, 0))
        self.fin = self.inicio + timedelta(hours=2)
        self.previo_inicio = self.inicio - timedelta(hours=2)
        self._lectura("TEMP", 20, self.inicio + timedelta(minutes=10))
        self._lectura("TEMP", 10, self.previo_inicio + timedelta(minutes=10))
        self._lectura("HUM", 60, self.inicio + timedelta(minutes=10))
        self._lectura("HUM", 40, self.previo_inicio + timedelta(minutes=10))

    def _lectura(self, variable, valor, fecha):
        sensor = self.e.ccs811 if variable == "AIRE" else self.e.dht22
        Lectura.objects.create(
            sensor_num=sensor.pk,
            variable_codigo=variable,
            valor=valor,
            fecha_hora=fecha,
            estabilizada=True,
        )

    def _consulta(self, filtros_datos=None, cruzado=None):
        datos = {
            "periodo": "personalizado",
            "desde": self.inicio.isoformat(),
            "hasta": self.fin.isoformat(),
        }
        datos.update(filtros_datos or {})
        return filtros.resolver_filtros(self.e.admin, datos, cruzado)

    def _kpi(self, indicador="promedio", variable="filtro"):
        return catalogo.validar_tarjeta(
            {
                "id": "t1",
                "tipo": "kpi",
                "titulo": indicador,
                "opciones": {
                    "indicador": indicador,
                    "variable": variable,
                    "nivel": "",
                    "comparar": True,
                    "sparkline": False,
                },
            }
        )

    def test_periodo_anterior_y_variacion(self):
        datos = tarjetas.calcular(self._kpi(), self._consulta())
        self.assertEqual(datos["valor"], 20.0)
        self.assertEqual(datos["previo"], 10.0)
        self.assertEqual(datos["variacion"]["abs"], 10.0)
        self.assertEqual(datos["variacion"]["pct"], 100.0)
        self.assertEqual(datos["variacion"]["sentido"], "sube")

    def test_variable_filtro_y_variable_fija(self):
        filtro = self._consulta({"variable": "HUM"})
        self.assertEqual(tarjetas.calcular(self._kpi(), filtro)["valor"], 60.0)
        fija = tarjetas.calcular(self._kpi(variable="TEMP"), filtro)
        self.assertEqual(fija["valor"], 20.0)

    def test_filtro_cruzado_en_una_tarjeta_con_datos(self):
        consulta = self._consulta(
            {},
            {"dimension": "variable", "valor": "HUM", "origen": "origen"},
        )
        no_origen = tarjetas.calcular(self._kpi(), consulta)
        self.assertEqual(no_origen["valor"], 60.0)
        origen = tarjetas.calcular({**self._kpi(), "id": "origen"}, consulta)
        self.assertEqual(origen["valor"], 20.0)

    def test_el_periodo_anterior_de_la_tendencia_se_alinea(self):
        tarjeta = catalogo.validar_tarjeta(
            {
                "id": "t1",
                "tipo": "tendencia",
                "titulo": "Temperatura",
                "opciones": {
                    "variable": "TEMP",
                    "estadistico": "promedio",
                    "agrupar": "total",
                    "estilo": "linea",
                    "comparar": True,
                    "umbrales": False,
                },
            }
        )
        datos = tarjetas.calcular(tarjeta, self._consulta())
        self.assertEqual(len(datos["previo"]), 1)
        self.assertEqual(datos["previo"][0]["x"], datos["series"][0]["puntos"][0]["x"])
        self.assertEqual(datos["previo"][0]["y"], 10.0)


class AlcanceAPITests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Dispositivo.objects.create(
            area=self.e.otra_area,
            nombre="Nodo ajeno",
            codigo_mqtt="NUC-AJENO",
            registrado_por=self.e.admin,
        )
        Sensor.objects.create(dispositivo=self.otro, modelo="DHT22")
        self.supervisor = cliente_de(self.e.supervisor)
        self.analista = cliente_de(self.e.analista)
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

    def _post(self, cliente, filtros_datos=None, cruzado=None):
        return cliente.post(
            "/api/v1/analitica/consulta/",
            {
                "tarjetas": [self.tarjeta],
                "filtros": filtros_datos or {"periodo": "7d"},
                "cruzado": cruzado,
            },
            format="json",
        )

    def test_el_supervisor_no_puede_pedir_un_area_ajena(self):
        r = self._post(self.supervisor, {"periodo": "7d", "areas": [self.e.otra_area.num]})
        self.assertEqual(r.status_code, 403, r.content)

    def test_el_supervisor_no_puede_pedir_un_dispositivo_ajeno(self):
        r = self._post(
            self.supervisor,
            {"periodo": "7d", "dispositivos": [self.otro.num]},
        )
        self.assertEqual(r.status_code, 403, r.content)

    def test_el_analista_no_puede_pedir_otra_area(self):
        r = self._post(self.analista, {"periodo": "7d", "areas": [self.e.otra_area.num]})
        self.assertEqual(r.status_code, 403, r.content)

    def test_el_cruzado_ajeno_tambien_es_403(self):
        r = self._post(
            self.supervisor,
            {"periodo": "7d"},
            {"dimension": "area", "valor": self.e.otra_area.num},
        )
        self.assertEqual(r.status_code, 403, r.content)


class IAHallazgosTests(PruebaBase):
    @override_settings(
        IA_OLLAMA_URL="http://127.0.0.1:11434",
        IA_MODELO_LOCAL="modelo-de-prueba",
    )
    def test_peticion_a_ollama_usa_el_mismo_modelo_y_contexto(self):
        respuesta = mock.MagicMock()
        respuesta.__enter__.return_value.read.return_value = json.dumps(
            {"message": {"content": '{"hallazgos": ["Uno", "Dos", "Tres"]}'}}
        ).encode()
        with mock.patch("urllib.request.urlopen", return_value=respuesta) as urlopen:
            hallazgos._consultar_ia({"tarjetas": [{"valor": 1}]})
        peticion = urlopen.call_args.args[0]
        cuerpo = json.loads(peticion.data)
        self.assertEqual(cuerpo["model"], "modelo-de-prueba")
        self.assertEqual(cuerpo["options"]["num_ctx"], configuracion.contexto())
        self.assertEqual(cuerpo["format"], "json")
        self.assertFalse(cuerpo["think"])
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 60)
