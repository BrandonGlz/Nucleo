from decimal import Decimal

from django.db import IntegrityError, transaction

from apps.umbrales.models import Umbral
from common import roles
from common.testing import Escenario, PruebaBase, cliente_de


class UmbralTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def crear(self, **limites):
        datos = {"peligro_min": 20, "advertencia_min": 30, "advertencia_max": 60, "peligro_max": 70}
        return Umbral.objects.create(
            dispositivo=self.e.dispositivo,
            variable_id=roles.VARIABLE_HUMEDAD,
            configurado_por=self.e.admin,
            **{**datos, **limites},
        )

    def test_la_base_exige_el_orden_de_los_limites(self):
        invalidos = (
            {"advertencia_min": 60, "advertencia_max": 30},
            {"advertencia_min": 40, "advertencia_max": 40},  # advertencia mínima < máxima
            {"peligro_min": 35},  # peligro mínimo ≤ advertencia mínima
            {"peligro_max": 50},  # advertencia máxima ≤ peligro máximo
        )
        for limites in invalidos:
            with self.assertRaises(IntegrityError), transaction.atomic():
                self.crear(**limites)

    def test_el_peligro_puede_coincidir_con_la_advertencia(self):
        self.assertIsNotNone(self.crear(peligro_min=30, peligro_max=60).pk)

    def test_clasifica_normal_advertencia_y_peligro(self):
        umbral = self.e.umbral_temp  # advertencia 18–25, peligro 15–28
        casos = {
            18: None,
            25: None,
            22: None,
            25.5: ("ADVERTENCIA", "POR_ENCIMA"),
            28: ("ADVERTENCIA", "POR_ENCIMA"),
            28.5: ("PELIGRO", "POR_ENCIMA"),
            17: ("ADVERTENCIA", "POR_DEBAJO"),
            15: ("ADVERTENCIA", "POR_DEBAJO"),
            14.5: ("PELIGRO", "POR_DEBAJO"),
        }
        for valor, esperado in casos.items():
            self.assertEqual(umbral.clasificar(Decimal(str(valor))), esperado, valor)

    def test_un_umbral_por_variable_y_dispositivo(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Umbral.objects.create(
                dispositivo=self.e.dispositivo,
                variable_id=roles.VARIABLE_TEMPERATURA,
                configurado_por=self.e.admin,
                peligro_min=1,
                advertencia_min=2,
                advertencia_max=3,
                peligro_max=4,
            )

    def datos(self, **extra):
        base = {
            "dispositivo": self.e.dispositivo.pk,
            "variable": roles.VARIABLE_HUMEDAD,
            "peligro_min": "20",
            "advertencia_min": "30",
            "advertencia_max": "60",
            "peligro_max": "70",
        }
        return {**base, **extra}

    def test_supervisor_crea_umbrales_y_queda_registrado_quien_lo_hizo(self):
        r = cliente_de(self.e.supervisor).post("/api/v1/umbrales/", self.datos(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["configurado_por"], self.e.supervisor.pk)

    def test_la_api_valida_el_orden_de_los_limites(self):
        r = cliente_de(self.e.admin).post(
            "/api/v1/umbrales/", self.datos(advertencia_min="65"), format="json"
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("advertencia_min", r.json())

    def test_la_api_valida_los_limites_al_modificar(self):
        r = cliente_de(self.e.supervisor).patch(
            f"/api/v1/umbrales/{self.e.umbral_temp.pk}/",
            {"peligro_max": "20"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_rechaza_umbral_duplicado(self):
        r = cliente_de(self.e.admin).post(
            "/api/v1/umbrales/", self.datos(variable=roles.VARIABLE_TEMPERATURA), format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_operador_y_analista_no_modifican_umbrales(self):
        for usuario in (self.e.operador, self.e.analista):
            r = cliente_de(usuario).post("/api/v1/umbrales/", self.datos(), format="json")
            self.assertEqual(r.status_code, 403)

    def test_el_operador_consulta_los_umbrales_de_su_dispositivo(self):
        r = cliente_de(self.e.operador).get("/api/v1/umbrales/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["results"]), 1)

    def test_no_se_pueden_crear_umbrales_en_dispositivos_ajenos(self):
        otro = Escenario("b")
        r = cliente_de(self.e.admin).post(
            "/api/v1/umbrales/", self.datos(dispositivo=otro.dispositivo.pk), format="json"
        )
        self.assertEqual(r.status_code, 400)
