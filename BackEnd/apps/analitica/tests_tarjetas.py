"""Pruebas de los calculadores de cada tipo de tarjeta."""

from datetime import datetime, timedelta

from django.utils import timezone

from apps.alertas.models import Alerta
from apps.analitica import catalogo, filtros, tarjetas
from apps.mediciones.models import Lectura
from common.testing import Escenario, PruebaBase


class TarjetasTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.e.dispositivo.intervalo_muestreo_seg = 60
        self.inicio = timezone.make_aware(datetime(2026, 11, 2, 0, 0))
        self.fin = self.inicio + timedelta(hours=2)
        self.e.dispositivo.fecha_alta = self.inicio - timedelta(days=1)
        self.e.dispositivo.save(update_fields=["intervalo_muestreo_seg", "fecha_alta"])
        self.consulta = filtros.resolver_filtros(
            self.e.admin,
            {
                "periodo": "personalizado",
                "desde": self.inicio.isoformat(),
                "hasta": self.fin.isoformat(),
            },
        )
        for minutos, valor in ((0, 20), (10, 26), (20, 10), (30, 24)):
            self._lectura("TEMP", valor, minutos)
        for minutos, valor in ((0, 40), (10, 50), (20, 60), (30, 70)):
            self._lectura("HUM", valor, minutos)
        self._alerta(40, Alerta.Estado.ATENDIDA, atencion=self.inicio + timedelta(minutes=50))
        self._alerta(50, Alerta.Estado.DESCARTADA, atencion=self.inicio + timedelta(minutes=70))
        self._alerta(60, Alerta.Estado.PENDIENTE)

    def _lectura(self, variable, valor, minutos):
        sensor = self.e.ccs811 if variable == "AIRE" else self.e.dht22
        return Lectura.objects.create(
            sensor_num=sensor.pk,
            variable_codigo=variable,
            valor=valor,
            fecha_hora=self.inicio + timedelta(minutes=minutos),
            estabilizada=True,
        )

    def _alerta(self, minutos, estado, atencion=None):
        fecha = self.inicio + timedelta(minutes=minutos)
        return Alerta.objects.create(
            umbral=self.e.umbral_temp,
            lectura_num=1,
            lectura_fecha_hora=fecha,
            lectura_valor=30,
            nivel="ADVERTENCIA",
            tipo=Alerta.Tipo.POR_ENCIMA,
            estado=estado,
            fecha_hora=fecha,
            fecha_atencion=atencion,
            atendida_por=self.e.supervisor if atencion else None,
        )

    def _calcular(self, tipo, opciones=None, meta=None):
        datos = {
            "id": "t1",
            "tipo": tipo,
            "titulo": tipo,
            "opciones": opciones or {},
        }
        if meta is not None:
            datos["meta"] = meta
        tarjeta = catalogo.validar_tarjeta(datos)
        return tarjetas.calcular(tarjeta, self.consulta)

    def test_kpi_cumplimiento_con_meta_y_variacion(self):
        datos = self._calcular(
            "kpi",
            {
                "indicador": "cumplimiento",
                "variable": "TEMP",
                "nivel": "",
                "comparar": True,
                "sparkline": True,
            },
            {"valor": 95, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(datos["tipo"], "kpi")
        self.assertEqual(datos["valor"], 50.0)
        self.assertEqual(datos["unidad"], "%")
        self.assertEqual(datos["meta_estado"], "lejos")
        self.assertEqual(datos["meta"]["texto"], "Meta ≥ 95 %")
        self.assertIsNone(datos["sparkline"])

    def test_kpi_alertas_y_sin_comparacion(self):
        datos = self._calcular(
            "kpi",
            {
                "indicador": "alertas",
                "variable": "filtro",
                "nivel": "",
                "comparar": False,
                "sparkline": True,
            },
            {"valor": 10, "sentido": "menor", "tolerancia": 5},
        )
        self.assertEqual(datos["valor"], 3)
        self.assertEqual(datos["meta_estado"], "cumple")
        self.assertIsNone(datos["previo"])
        self.assertIsNone(datos["variacion"])
        self.assertEqual(sum(punto["y"] for punto in datos["sparkline"]), 3)

    def test_tendencia_y_umbrales(self):
        datos = self._calcular(
            "tendencia",
            {
                "variable": "TEMP",
                "estadistico": "promedio",
                "agrupar": "total",
                "estilo": "area",
                "comparar": True,
                "umbrales": True,
            },
        )
        self.assertEqual(datos["variable"], "TEMP")
        self.assertEqual(len(datos["series"]), 1)
        self.assertEqual(
            [punto["y"] for punto in datos["series"][0]["puntos"]],
            [23.0, 10.0, 24.0],
        )
        self.assertIsNotNone(datos["umbrales"])
        self.assertEqual(datos["umbrales"]["advertencia_max"], 25.0)

    def test_medidor_y_barras(self):
        medidor = self._calcular(
            "medidor",
            {"indicador": "cumplimiento", "variable": "TEMP"},
            {"valor": 95, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(medidor["valor"], 50.0)
        self.assertEqual(medidor["min"], 0)
        self.assertEqual(medidor["max"], 100)

        barras = self._calcular(
            "barras",
            {
                "metrica": "cumplimiento",
                "variable": "TEMP",
                "por": "area",
                "orientacion": "horizontal",
                "orden": "desc",
                "limite": 10,
            },
            {"valor": 95, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(len(barras["barras"]), 1)
        self.assertEqual(barras["barras"][0]["valor"], 50.0)
        self.assertEqual(barras["barras"][0]["dimension"], "area")
        self.assertIsNotNone(barras["meta"])

    def test_barras_apiladas_y_ranking(self):
        apiladas = self._calcular(
            "barras_apiladas",
            {"serie": "lecturas_rango", "por": "area", "porcentaje": True},
        )
        valores = {
            serie["nombre"]: serie["valores"][0] for serie in apiladas["series"]
        }
        self.assertEqual(valores, {"Dentro": 50.0, "Advertencia": 25.0, "Peligro": 25.0})
        self.assertTrue(apiladas["porcentaje"])

        ranking = self._calcular(
            "ranking",
            {
                "metrica": "alertas",
                "variable": "filtro",
                "por": "dispositivo",
                "sentido": "peores",
                "n": 5,
            },
        )
        self.assertEqual(len(ranking["filas"]), 1)
        self.assertEqual(ranking["filas"][0]["valor"], 3)
        self.assertEqual(ranking["filas"][0]["dimension_valor"], self.e.dispositivo.num)

    def test_matriz_dona_y_dispersion(self):
        matriz = self._calcular(
            "matriz", {"filas": "area", "valor": "cumplimiento"}
        )
        fila = next(f for f in matriz["filas"] if f["id"] == self.e.area.num)
        celdas = {celda["variable"]: celda for celda in fila["celdas"]}
        self.assertEqual(celdas["TEMP"]["valor"], 50.0)
        self.assertEqual(celdas["TEMP"]["nivel"], "lejos")
        self.assertTrue(matriz["semaforo"])

        dona = self._calcular("alertas_dona", {"por": "estado"})
        self.assertEqual(dona["total"], 3)
        self.assertEqual(
            {sector["dimension_valor"]: sector["valor"] for sector in dona["sectores"]},
            {"PENDIENTE": 1, "ATENDIDA": 1, "DESCARTADA": 1},
        )

        dispersion = self._calcular("dispersion", {"x": "TEMP", "y": "HUM"})
        self.assertEqual(len(dispersion["puntos"]), 1)
        self.assertEqual(dispersion["puntos"][0]["y"], 55.0)

    def test_mapa_calor_histograma_y_atencion(self):
        mapa = self._calcular(
            "mapa_calor",
            {"variable": "TEMP", "estadistico": "promedio", "alertas": False},
        )
        self.assertEqual(len(mapa["valores"]), 7)
        self.assertEqual(len(mapa["valores"][0]), 24)

        mapa_alertas = self._calcular(
            "mapa_calor",
            {"variable": "TEMP", "estadistico": "promedio", "alertas": True},
        )
        self.assertEqual(
            sum(valor for fila in mapa_alertas["valores"] for valor in fila),
            3,
        )

        histograma = self._calcular("histograma", {"variable": "TEMP"})
        self.assertEqual(histograma["total"], 4)
        self.assertEqual(len(histograma["cubetas"]), 10)

        atencion = self._calcular(
            "tiempo_atencion",
            {"por": "dispositivo"},
            {"valor": 30, "sentido": "menor", "tolerancia": 5},
        )
        self.assertEqual(atencion["total"], 3)
        self.assertEqual(atencion["atendidas"], 2)
        self.assertEqual(atencion["promedio"], 15)
        self.assertEqual(atencion["meta_estado"], "cumple")

    def test_disponibilidad_texto_y_hallazgos(self):
        disponibilidad = self._calcular(
            "disponibilidad",
            {"limite": 5, "orden": "asc"},
            {"valor": 98, "sentido": "mayor", "tolerancia": 5},
        )
        self.assertEqual(len(disponibilidad["filas"]), 1)
        self.assertAlmostEqual(disponibilidad["filas"][0]["valor"], 6.7, places=1)
        self.assertEqual(disponibilidad["meta_estado"], "lejos")

        texto = self._calcular("texto", {"nota": "Una nota"})
        self.assertEqual(texto["nota"], "Una nota")

        hallazgos = self._calcular("hallazgos")
        self.assertTrue(hallazgos["bajo_demanda"])

    def test_el_origen_del_filtro_cruzado_no_se_filtra(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {"variable": "TEMP"},
            {"dimension": "variable", "valor": "HUM", "origen": "t1"},
        )
        tarjeta = catalogo.validar_tarjeta(
            {
                "id": "t1",
                "tipo": "tendencia",
                "titulo": "Origen",
                "opciones": {
                    "variable": "filtro",
                    "estadistico": "promedio",
                    "agrupar": "total",
                    "estilo": "linea",
                    "comparar": False,
                    "umbrales": False,
                },
            }
        )
        datos = tarjetas.calcular(tarjeta, consulta)
        self.assertEqual(datos["variable"], "TEMP")
