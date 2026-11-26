"""Pruebas de los cálculos nuevos de la etapa 4."""

from datetime import timedelta

from django.utils import timezone

from apps.alertas.models import Alerta
from apps.mediciones.models import Lectura
from apps.reportes import servicios
from apps.umbrales.models import Umbral
from common.testing import Escenario, PruebaBase


class CalculosNuevosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.e.dispositivo.intervalo_muestreo_seg = 60
        self.inicio = timezone.now() - timedelta(hours=2)
        self.fin = self.inicio + timedelta(hours=1)
        self.e.dispositivo.fecha_alta = self.inicio - timedelta(days=1)
        self.e.dispositivo.save(
            update_fields=["intervalo_muestreo_seg", "fecha_alta"]
        )
        for usuario, nombre, apellido in (
            (self.e.supervisor, "Ana", "López"),
            (self.e.admin, "Luis", "Mora"),
        ):
            usuario.nombre = nombre
            usuario.primer_apellido = apellido
            usuario.save(update_fields=["nombre", "primer_apellido"])

    def _lectura(self, variable, valor, minutos, estabilizada=True, desde=None):
        sensor = self.e.ccs811 if variable == "AIRE" else self.e.dht22
        return Lectura.objects.create(
            sensor_num=sensor.pk,
            variable_codigo=variable,
            valor=valor,
            fecha_hora=(desde or self.inicio) + timedelta(minutes=minutos),
            estabilizada=estabilizada,
        )

    def _alerta(
        self,
        fecha,
        estado="PENDIENTE",
        atencion=None,
        atendida_por=None,
        observaciones=None,
        nivel="ADVERTENCIA",
    ):
        return Alerta.objects.create(
            umbral=self.e.umbral_temp,
            lectura_num=1,
            lectura_fecha_hora=fecha,
            lectura_valor=26,
            nivel=nivel,
            tipo=Alerta.Tipo.POR_ENCIMA,
            estado=estado,
            fecha_hora=fecha,
            fecha_atencion=atencion,
            atendida_por=atendida_por,
            observaciones=observaciones,
        )

    def test_cumplimiento_cuenta_lecturas_y_minutos_fuera(self):
        for minutos, valor in ((0, 20), (10, 24), (20, 30), (30, 10)):
            self._lectura("TEMP", valor, minutos)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )

        self.assertEqual(
            cifras["cumplimiento"]["TEMP"],
            {"dentro_pct": 50.0, "fuera_min": 2.0, "lecturas": 4},
        )

    def test_comparativo_resta_el_periodo_anterior(self):
        previo = self.inicio - timedelta(hours=1)
        self._lectura("TEMP", 10, 0, desde=previo)
        self._lectura("TEMP", 20, 30, desde=previo)
        self._lectura("TEMP", 20, 0)
        self._lectura("TEMP", 30, 30)
        self._alerta(self.inicio + timedelta(minutes=5))
        self._alerta(previo + timedelta(minutes=5), estado="ATENDIDA")
        self._alerta(previo + timedelta(minutes=20), estado="DESCARTADA")

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        temperatura = next(
            v for v in cifras["comparativo"]["variables"] if v["variable"] == "TEMP"
        )

        self.assertEqual(temperatura["promedio"], 25.0)
        self.assertEqual(temperatura["promedio_previo"], 15.0)
        self.assertEqual(temperatura["dif_promedio"], 10.0)
        self.assertEqual(temperatura["dif_promedio_pct"], 66.67)
        self.assertEqual(cifras["comparativo"]["alertas"]["total"], 1)
        self.assertEqual(cifras["comparativo"]["alertas"]["total_previo"], 2)
        self.assertEqual(cifras["comparativo"]["alertas"]["diferencia"], -1)
        self.assertEqual(cifras["comparativo"]["alertas"]["diferencia_pct"], -50.0)

    def test_comparativo_sin_datos_previos_es_nulo(self):
        self._lectura("TEMP", 20, 0)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )

        self.assertTrue(cifras["comparativo"]["sin_datos_previos"])
        self.assertIn("periodo_anterior", cifras["comparativo"])

    def test_gestion_alertas_y_observaciones(self):
        base = self.inicio + timedelta(minutes=10)
        self._alerta(
            base,
            estado="ATENDIDA",
            atencion=base + timedelta(minutes=10),
            atendida_por=self.e.supervisor,
            observaciones="Se revisó la puerta.",
        )
        self._alerta(
            base + timedelta(minutes=5),
            estado="DESCARTADA",
            atencion=base + timedelta(minutes=25),
            atendida_por=self.e.admin,
            nivel="PELIGRO",
        )
        self._alerta(base + timedelta(minutes=10))

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )

        self.assertEqual(cifras["gestion_alertas"]["estados"]["ATENDIDA"], 1)
        self.assertEqual(cifras["gestion_alertas"]["estados"]["DESCARTADA"], 1)
        self.assertEqual(cifras["gestion_alertas"]["estados"]["PENDIENTE"], 1)
        self.assertEqual(cifras["gestion_alertas"]["tiempo_medio_min"], 15.0)
        self.assertEqual(
            {r["usuario"]: r["total"] for r in cifras["gestion_alertas"]["responsables"]},
            {"Ana López": 1, "Luis Mora": 1},
        )
        self.assertEqual(len(cifras["observaciones"]), 1)
        self.assertEqual(cifras["observaciones"][0]["texto"], "Se revisó la puerta.")
        self.assertEqual(cifras["observaciones"][0]["usuario"], "Ana López")
        self.assertEqual(cifras["observaciones"][0]["variable_nombre"], "Temperatura")

    def _umbral(self, variable, minimo, maximo):
        Umbral.objects.create(
            dispositivo=self.e.dispositivo,
            variable_id=variable,
            configurado_por=self.e.admin,
            peligro_min=minimo,
            advertencia_min=minimo + 5,
            advertencia_max=maximo - 5,
            peligro_max=maximo,
        )

    def test_disponibilidad_y_huecos(self):
        self._umbral("HUM", 0, 100)
        self._umbral("AIRE", 0, 1000)
        for variable in ("TEMP", "HUM", "AIRE"):
            for minutos in (1, 31, 59):
                self._lectura(variable, 20, minutos)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        datos = cifras["disponibilidad"][self.e.dispositivo.codigo_mqtt]

        self.assertEqual(datos["recibidas"], 9)
        self.assertEqual(datos["esperadas"], 180.0)
        self.assertEqual(datos["pct"], 5.0)
        # Los saltos de 1 min (inicio→1 y 59→fin) son el espaciado normal, no huecos.
        self.assertEqual(len(datos["huecos"]), 2)
        self.assertEqual(datos["huecos"][0]["minutos"], 30.0)

    def test_disponibilidad_con_tres_variables_al_100(self):
        self._umbral("HUM", 0, 100)
        self._umbral("AIRE", 0, 1000)
        for variable in ("TEMP", "HUM", "AIRE"):
            for minuto in range(60):
                self._lectura(variable, 20, minuto)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        datos = cifras["disponibilidad"][self.e.dispositivo.codigo_mqtt]

        self.assertEqual(datos["variables"], 3)
        self.assertEqual(datos["recibidas"], 180)
        self.assertEqual(datos["esperadas"], 180.0)
        self.assertEqual(datos["pct"], 100.0)
        self.assertEqual(datos["huecos"], [])

    def test_disponibilidad_desde_el_registro_del_dispositivo(self):
        self.e.dispositivo.fecha_alta = self.inicio + timedelta(minutes=30)
        self.e.dispositivo.save(update_fields=["fecha_alta"])
        for minuto in range(30, 60):
            self._lectura("TEMP", 20, minuto)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        datos = cifras["disponibilidad"][self.e.dispositivo.codigo_mqtt]

        self.assertEqual(datos["esperadas"], 30.0)
        self.assertEqual(datos["pct"], 100.0)

    def test_incidentes_agrupa_salidas_continuas(self):
        for minutos, valor in ((0, 26), (1, 26.5), (2, 20), (3, 30), (4, 29), (5, 30)):
            self._lectura("TEMP", valor, minutos)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        incidentes = cifras["incidentes"]

        self.assertEqual(len(incidentes), 2)
        self.assertEqual(incidentes[0]["duracion_min"], 3.0)
        self.assertEqual(incidentes[0]["valor_pico"], 30.0)
        self.assertEqual(incidentes[0]["nivel"], "PELIGRO")
        self.assertEqual(incidentes[0]["variable_nombre"], "Temperatura")
        self.assertEqual(incidentes[1]["duracion_min"], 2.0)
        self.assertEqual(incidentes[1]["valor_pico"], 26.5)
        self.assertEqual(incidentes[1]["nivel"], "ADVERTENCIA")

    def test_los_dispositivos_llevan_nombre_y_area(self):
        self._lectura("TEMP", 20, 0)

        cifras = servicios.calcular_cifras(
            self.e.organizacion, self.e.area, self.inicio, self.fin
        )
        dispositivo = cifras["dispositivos"][self.e.dispositivo.codigo_mqtt]

        self.assertEqual(dispositivo["nombre"], self.e.dispositivo.nombre)
        self.assertEqual(dispositivo["area"], self.e.area.nombre)
