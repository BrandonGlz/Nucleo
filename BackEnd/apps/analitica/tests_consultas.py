"""Pruebas de las agregaciones SQL y de la igualdad con los reportes."""

from datetime import datetime, timedelta

from django.test import override_settings
from django.utils import timezone

from apps.alertas.models import Alerta
from apps.analitica import consultas, filtros
from apps.mediciones.models import Lectura
from apps.reportes import servicios
from common.testing import Escenario, PruebaBase


class AgregacionesTests(PruebaBase):
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

    def _lectura(self, variable, valor, minutos, estabilizada=True):
        sensor = self.e.ccs811 if variable == "AIRE" else self.e.dht22
        return Lectura.objects.create(
            sensor_num=sensor.pk,
            variable_codigo=variable,
            valor=valor,
            fecha_hora=self.inicio + timedelta(minutes=minutos),
            estabilizada=estabilizada,
        )

    def _alerta(self, minutos, estado, atencion=None, nivel="ADVERTENCIA"):
        fecha = self.inicio + timedelta(minutes=minutos)
        return Alerta.objects.create(
            umbral=self.e.umbral_temp,
            lectura_num=1,
            lectura_fecha_hora=fecha,
            lectura_valor=30,
            nivel=nivel,
            tipo=Alerta.Tipo.POR_ENCIMA,
            estado=estado,
            fecha_hora=fecha,
            fecha_atencion=atencion,
            atendida_por=self.e.supervisor if atencion else None,
        )

    def test_resumen_y_serie(self):
        self.assertEqual(
            consultas.resumen(self.consulta, "TEMP"),
            {"lecturas": 4, "promedio": 20.0, "minimo": 10.0, "maximo": 26.0},
        )
        series = consultas.serie(self.consulta, "TEMP")
        self.assertEqual(len(series), 1)
        self.assertEqual(series[0]["nombre"], "Total")
        self.assertEqual(
            [
                (datetime.fromisoformat(punto["x"]), punto["y"])
                for punto in series[0]["puntos"]
            ],
            [
                (self.inicio, 23.0),
                (self.inicio + timedelta(minutes=15), 10.0),
                (self.inicio + timedelta(minutes=30), 24.0),
            ],
        )

    def test_resumen_por_variable_y_matriz(self):
        resumen = consultas.resumen_por_variable(self.consulta)
        self.assertEqual(resumen["TEMP"]["lecturas"], 4)
        self.assertEqual(resumen["HUM"]["promedio"], 55.0)

        matriz = consultas.matriz(self.consulta, "area", "promedio")
        fila = next(f for f in matriz["filas"] if f["id"] == self.e.area.num)
        self.assertEqual(fila["etiqueta"], self.e.area.nombre)
        celdas = {celda["variable"]: celda["valor"] for celda in fila["celdas"]}
        self.assertEqual(celdas["TEMP"], 20.0)
        self.assertEqual(celdas["HUM"], 55.0)
        self.assertIsNone(celdas["AIRE"])

    def test_cumplimiento_igual_a_reportes(self):
        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        esperado = cifras["cumplimiento"]["TEMP"]
        filas = consultas.cumplimiento_agrupado(self.consulta, "TEMP", "variable")
        self.assertEqual(len(filas), 1)
        self.assertEqual(
            {
                "dentro_pct": filas[0]["dentro_pct"],
                "fuera_min": filas[0]["fuera_min"],
                "lecturas": filas[0]["lecturas"],
            },
            esperado,
        )
        total = consultas.cumplimiento_total(self.consulta, "TEMP")
        self.assertEqual(total, esperado)

    def test_conteo_de_rangos(self):
        filas = consultas.conteo_rangos(self.consulta, "TEMP", "dispositivo")
        conteo = {(fila["nivel"], fila["total"]) for fila in filas}
        self.assertEqual(conteo, {("DENTRO", 2), ("ADVERTENCIA", 1), ("PELIGRO", 1)})

    def test_histograma(self):
        datos = consultas.histograma(self.consulta, "TEMP")
        self.assertEqual(datos["total"], 4)
        self.assertEqual(len(datos["cubetas"]), 10)
        self.assertEqual(sum(cubeta["valor"] for cubeta in datos["cubetas"]), 4)

    def test_dispersion(self):
        datos = consultas.dispersion(self.consulta, "TEMP", "HUM")
        self.assertEqual(len(datos["puntos"]), 1)
        punto = datos["puntos"][0]
        self.assertEqual((punto["x"], punto["y"]), (20.0, 55.0))
        self.assertEqual(punto["dimension"], "dispositivo")
        self.assertEqual(punto["dimension_valor"], self.e.dispositivo.num)

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_mapa_de_calor_en_la_zona_del_servidor(self):
        datos = consultas.mapa_calor(self.consulta, "TEMP")
        dia = timezone.localtime(self.inicio).weekday()
        hora = timezone.localtime(self.inicio).hour
        self.assertEqual(datos["valores"][dia][hora], 20.0)
        # El mapa se arma con la hora local: la lectura de las 00:00 UTC cae a las 17:00
        # del día anterior en Tijuana.
        self.assertIsNone(datos["valores"][dia][0])

    def test_alertas_tiempo_y_disponibilidad_igual_a_reportes(self):
        self._alerta(40, Alerta.Estado.ATENDIDA, atencion=self.inicio + timedelta(minutes=50))
        self._alerta(50, Alerta.Estado.DESCARTADA, atencion=self.inicio + timedelta(minutes=55))
        self._alerta(60, Alerta.Estado.PENDIENTE)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        self.assertEqual(
            consultas.alertas_conteo(self.consulta, "estado"),
            {estado: total for estado, total in cifras["alertas"]["por_estado"].items()},
        )
        atencion = consultas.gestion_atencion(self.consulta)
        self.assertEqual(
            atencion["tiempo_medio_min"],
            cifras["gestion_alertas"]["tiempo_medio_min"],
        )
        self.assertEqual(atencion["total"], cifras["gestion_alertas"]["total"])

        disponibilidad = consultas.disponibilidad_por_entidad(
            self.consulta, "dispositivo"
        )[0]
        codigo = self.e.dispositivo.codigo_mqtt
        self.assertEqual(disponibilidad["valor"], cifras["disponibilidad"][codigo]["pct"])
        self.assertEqual(
            disponibilidad["recibidas"],
            cifras["disponibilidad"][codigo]["recibidas"],
        )

        resumen = consultas.disponibilidad_resumen(self.consulta)
        self.assertEqual(
            resumen["pct"],
            cifras["disponibilidad"][codigo]["pct"],
        )
        self.assertEqual(
            resumen["recibidas"],
            cifras["disponibilidad"][codigo]["recibidas"],
        )

    def test_valores_por_entidad_y_ranking(self):
        valores = consultas.valores_por_entidad(
            self.consulta, "cumplimiento", "TEMP", "area"
        )
        self.assertEqual(valores[0]["valor"], 50.0)
        self.assertEqual(valores[0]["dimension"], "area")

        valores = consultas.valores_por_entidad(
            self.consulta, "lecturas", "TEMP", "dispositivo"
        )
        self.assertEqual(valores[0]["valor"], 4)
        self.assertEqual(valores[0]["dimension_valor"], self.e.dispositivo.num)

    def test_variable_todas_en_metricas_que_la_admiten(self):
        valores = consultas.valores_por_entidad(
            self.consulta, "promedio", None, "variable"
        )
        por_variable = {fila["dimension_valor"]: fila["valor"] for fila in valores}
        self.assertEqual(por_variable["TEMP"], 20.0)
        self.assertEqual(por_variable["HUM"], 55.0)
