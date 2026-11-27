"""Pruebas de periodos, alcance y filtro cruzado de Analítica."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.test import override_settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.analitica import filtros
from apps.dispositivos.models import Dispositivo, Sensor
from common.testing import Escenario, PruebaBase

TZ = ZoneInfo("America/Tijuana")


class PeriodosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_hoy_usa_la_medianoche_local_y_el_dia_completo(self):
        ahora = datetime(2026, 11, 26, 10, 30, tzinfo=TZ)
        consulta = filtros.resolver_filtros(self.e.admin, {"periodo": "hoy"}, ahora=ahora)

        self.assertEqual(
            timezone.localtime(consulta.inicio),
            datetime(2026, 11, 26, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.fin),
            datetime(2026, 11, 27, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.previo_inicio),
            datetime(2026, 11, 25, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.previo_fin),
            datetime(2026, 11, 26, 0, 0, tzinfo=TZ),
        )

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_los_periodos_moviles_y_su_anterior(self):
        ahora = datetime(2026, 11, 26, 10, 30, tzinfo=TZ)
        for periodo, dias in (("7d", 7), ("30d", 30), ("90d", 90)):
            with self.subTest(periodo=periodo):
                consulta = filtros.resolver_filtros(
                    self.e.admin, {"periodo": periodo}, ahora=ahora
                )
                self.assertEqual(consulta.fin, ahora)
                self.assertEqual(consulta.inicio, ahora - timedelta(days=dias))
                self.assertEqual(
                    consulta.previo_fin - consulta.previo_inicio,
                    consulta.fin - consulta.inicio,
                )
                self.assertEqual(consulta.previo_fin, consulta.inicio)

        consulta = filtros.resolver_filtros(self.e.admin, {"periodo": "24h"}, ahora=ahora)
        self.assertEqual(consulta.inicio, ahora - timedelta(hours=24))
        self.assertEqual(consulta.fin, ahora)

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_mes_es_del_primero_al_ahora(self):
        ahora = datetime(2026, 11, 26, 10, 30, tzinfo=TZ)
        consulta = filtros.resolver_filtros(self.e.admin, {"periodo": "mes"}, ahora=ahora)

        self.assertEqual(
            timezone.localtime(consulta.inicio),
            datetime(2026, 11, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(consulta.fin, ahora)
        self.assertEqual(
            timezone.localtime(consulta.previo_inicio),
            datetime(2026, 10, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.previo_fin),
            datetime(2026, 10, 26, 10, 30, tzinfo=TZ),
        )

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_mes_anterior_es_el_mes_completo(self):
        ahora = datetime(2026, 11, 26, 10, 30, tzinfo=TZ)
        consulta = filtros.resolver_filtros(
            self.e.admin, {"periodo": "mes_anterior"}, ahora=ahora
        )

        self.assertEqual(
            timezone.localtime(consulta.inicio),
            datetime(2026, 10, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.fin),
            datetime(2026, 11, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.previo_inicio),
            datetime(2026, 9, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.previo_fin),
            datetime(2026, 10, 1, 0, 0, tzinfo=TZ),
        )

    @override_settings(TIME_ZONE="America/Tijuana")
    def test_personalizado_usa_fin_exclusivo_y_su_anterior(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {"periodo": "personalizado", "desde": "2026-11-01", "hasta": "2026-11-10"},
        )

        self.assertEqual(
            timezone.localtime(consulta.inicio),
            datetime(2026, 11, 1, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(
            timezone.localtime(consulta.fin),
            datetime(2026, 11, 11, 0, 0, tzinfo=TZ),
        )
        self.assertEqual(consulta.fin - consulta.inicio, timedelta(days=10))
        self.assertEqual(consulta.previo_fin, consulta.inicio)
        self.assertEqual(consulta.previo_inicio, consulta.inicio - timedelta(days=10))

    def test_personalizado_valida_fechas_y_duracion(self):
        casos = [
            ({"periodo": "personalizado"}, "desde"),
            ({"periodo": "personalizado", "desde": "2026-11-10"}, "hasta"),
            (
                {"periodo": "personalizado", "desde": "2026-11-10", "hasta": "2026-11-01"},
                "posterior",
            ),
            (
                {
                    "periodo": "personalizado",
                    "desde": "2024-01-01",
                    "hasta": "2025-01-02",
                },
                "366",
            ),
        ]
        for datos, esperado in casos:
            with self.subTest(datos=datos):
                with self.assertRaises(ValidationError) as contexto:
                    filtros.resolver_filtros(self.e.admin, datos)
                self.assertIn(esperado, str(contexto.exception).lower())

    def test_intervalo_automatico(self):
        base = timezone.now()
        casos = [
            (timedelta(days=2), "15m"),
            (timedelta(days=2, seconds=1), "1h"),
            (timedelta(days=14), "1h"),
            (timedelta(days=14, seconds=1), "1d"),
            (timedelta(days=92), "1d"),
            (timedelta(days=92, seconds=1), "1sem"),
        ]
        for duracion, esperado in casos:
            with self.subTest(duracion=duracion):
                self.assertEqual(filtros.intervalo_para(base, base + duracion), esperado)


class AlcanceTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Dispositivo.objects.create(
            area=self.e.otra_area,
            nombre="Nodo de la otra área",
            codigo_mqtt="NUC-OTRA",
            registrado_por=self.e.admin,
        )
        self.sensor_otro = Sensor.objects.create(dispositivo=self.otro, modelo="DHT22")

    def test_el_admin_ve_toda_la_organizacion(self):
        consulta = filtros.resolver_filtros(self.e.admin, {})

        self.assertEqual(
            {area.num for area in consulta.areas},
            {self.e.area.num, self.e.otra_area.num},
        )
        self.assertEqual(
            {dispositivo.num for dispositivo in consulta.dispositivos},
            {self.e.dispositivo.num, self.otro.num},
        )
        self.assertEqual(
            {sensor.num for sensor in consulta.sensores},
            {self.e.dht22.num, self.e.ccs811.num, self.sensor_otro.num},
        )

    def test_el_supervisor_solo_ve_su_area(self):
        consulta = filtros.resolver_filtros(self.e.supervisor, {})

        self.assertEqual([area.num for area in consulta.areas], [self.e.area.num])
        self.assertEqual(
            [dispositivo.num for dispositivo in consulta.dispositivos],
            [self.e.dispositivo.num],
        )

    def test_rechaza_areas_y_dispositivos_ajenos(self):
        with self.assertRaises(PermissionDenied):
            filtros.resolver_filtros(self.e.supervisor, {"areas": [self.e.otra_area.num]})
        with self.assertRaises(PermissionDenied):
            filtros.resolver_filtros(self.e.supervisor, {"dispositivos": [self.otro.num]})
        with self.assertRaises(PermissionDenied):
            filtros.resolver_filtros(self.e.analista, {"areas": [self.e.otra_area.num]})

    def test_un_dispositivo_visible_fuera_de_las_areas_pedidas_es_error(self):
        with self.assertRaises(ValidationError) as contexto:
            filtros.resolver_filtros(
                self.e.admin,
                {"areas": [self.e.otra_area.num], "dispositivos": [self.e.dispositivo.num]},
            )
        self.assertIn("áreas pedidas", str(contexto.exception))

    def test_los_filtros_acotan_el_alcance(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {"areas": [self.e.otra_area.num], "dispositivos": [self.otro.num]},
        )

        self.assertEqual([area.num for area in consulta.areas], [self.e.otra_area.num])
        self.assertEqual(
            [dispositivo.num for dispositivo in consulta.dispositivos],
            [self.otro.num],
        )
        self.assertEqual(
            [sensor.num for sensor in consulta.sensores],
            [self.sensor_otro.num],
        )

    def test_las_areas_y_dispositivos_vacios_son_todos_los_visibles(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {"areas": [], "dispositivos": []},
        )
        self.assertEqual(len(consulta.areas), 2)
        self.assertEqual(len(consulta.dispositivos), 2)


class VariableYCruzadoTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_variable_efectiva(self):
        consulta = filtros.resolver_filtros(self.e.admin, {"variable": ""})
        tarjeta = {"opciones": {"variable": "filtro"}}
        self.assertEqual(consulta.variable_efectiva(tarjeta), "TEMP")

        consulta = filtros.resolver_filtros(self.e.admin, {"variable": "HUM"})
        self.assertEqual(consulta.variable_efectiva(tarjeta), "HUM")
        fija = {"opciones": {"variable": "TEMP"}}
        self.assertEqual(consulta.variable_efectiva(fija), "TEMP")

    def test_variable_del_filtro_cruzado(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {"variable": "TEMP"},
            {"dimension": "variable", "valor": "hum", "origen": "t1"},
        )
        tarjeta = {"id": "t2", "opciones": {"variable": "filtro"}}
        hija = consulta.para_tarjeta(tarjeta)
        self.assertEqual(hija.variable, "HUM")
        self.assertEqual(hija.variable_efectiva(tarjeta), "HUM")

        origen = {"id": "t1", "opciones": {"variable": "filtro"}}
        self.assertEqual(consulta.para_tarjeta(origen).variable, "TEMP")

    def test_cruzado_por_area_y_dispositivo(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {},
            {"dimension": "area", "valor": str(self.e.area.num), "origen": "t1"},
        )
        tarjeta = {"id": "t2"}
        hija = consulta.para_tarjeta(tarjeta)
        self.assertEqual([area.num for area in hija.areas], [self.e.area.num])
        self.assertEqual([d.num for d in hija.dispositivos], [self.e.dispositivo.num])

        consulta = filtros.resolver_filtros(
            self.e.admin,
            {},
            {"dimension": "dispositivo", "valor": self.e.dispositivo.num},
        )
        hija = consulta.para_tarjeta(tarjeta)
        self.assertEqual([d.num for d in hija.dispositivos], [self.e.dispositivo.num])

    def test_cruzado_por_estado_y_nivel(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {},
            {"dimension": "estado", "valor": "pendiente"},
        )
        hija = consulta.para_tarjeta({"id": "t2"})
        self.assertEqual(hija.estado, "PENDIENTE")
        self.assertIsNone(hija.nivel)

        consulta = filtros.resolver_filtros(
            self.e.admin,
            {},
            {"dimension": "nivel", "valor": "peligro"},
        )
        hija = consulta.para_tarjeta({"id": "t2"})
        self.assertEqual(hija.nivel, "PELIGRO")

    def test_cruzado_invalido_o_ajeno(self):
        casos = [
            ({"dimension": "hora", "valor": 1}, "dimensión"),
            ({"dimension": "variable", "valor": "OTRA"}, "variable"),
            ({"dimension": "nivel", "valor": "ALTO"}, "nivel"),
            ({"dimension": "estado", "valor": "OTRO"}, "estado"),
            ({"dimension": "area", "valor": self.e.otra_area.num}, "alcance"),
        ]
        for cruzado, esperado in casos:
            with self.subTest(cruzado=cruzado):
                with self.assertRaises((ValidationError, PermissionDenied)) as contexto:
                    filtros.resolver_filtros(self.e.supervisor, {}, cruzado)
                self.assertIn(esperado, str(contexto.exception).lower())

    def test_filtros_desconocidos(self):
        with self.assertRaises(ValidationError):
            filtros.resolver_filtros(self.e.admin, {"inventado": 1})
        with self.assertRaises(ValidationError):
            filtros.resolver_filtros(
                self.e.admin,
                {},
                {"dimension": "area", "valor": self.e.area.num, "otro": 1},
            )

    def test_las_alertas_se_acotan_por_estado_y_nivel(self):
        consulta = filtros.resolver_filtros(
            self.e.admin,
            {},
            {"dimension": "estado", "valor": "PENDIENTE"},
        )
        self.assertEqual(consulta.para_tarjeta({"id": "t2"}).estado, "PENDIENTE")
