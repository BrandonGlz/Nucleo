from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.dispositivos.models import Dispositivo
from apps.dispositivos.services import marcar_sin_conexion
from common import roles
from common.testing import Escenario, PruebaBase, cliente_de


class RestriccionesTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def test_intervalo_de_muestreo_entre_5_y_120(self):
        for invalido in (4, 121):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(
                    intervalo_muestreo_seg=invalido
                )

    def test_bateria_entre_0_y_100(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(nivel_bateria=101)

    def test_codigo_mqtt_unico(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Dispositivo.objects.create(
                area=self.e.area,
                nombre="Copia",
                codigo_mqtt=self.e.dispositivo.codigo_mqtt,
                registrado_por=self.e.admin,
            )

    def test_valores_por_defecto_de_la_base(self):
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.intervalo_muestreo_seg, 30)
        self.assertIsNotNone(self.e.dispositivo.fecha_alta)


class AccesoADispositivosTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()
        self.otro = Escenario("b")

    def ids(self, usuario):
        r = cliente_de(usuario).get("/api/v1/dispositivos/")
        self.assertEqual(r.status_code, 200)
        return {d["num"] for d in r.json()["results"]}

    def test_aislamiento_por_organizacion(self):
        self.assertEqual(self.ids(self.e.admin), {self.e.dispositivo.pk})
        self.assertEqual(self.ids(self.otro.admin), {self.otro.dispositivo.pk})
        r = cliente_de(self.e.admin).get(f"/api/v1/dispositivos/{self.otro.dispositivo.pk}/")
        self.assertEqual(r.status_code, 404)

    def test_operador_solo_ve_su_dispositivo(self):
        otro_operador = self.e.usuario(roles.OPERADOR, "oper2")
        self.assertEqual(self.ids(self.e.operador), {self.e.dispositivo.pk})
        self.assertEqual(self.ids(otro_operador), set())

    def test_solo_el_administrador_da_de_alta_dispositivos(self):
        datos = {"area": self.e.area.pk, "nombre": "Nuevo", "codigo_mqtt": "NUC-NEW"}
        self.assertEqual(
            cliente_de(self.e.supervisor).post("/api/v1/dispositivos/", datos).status_code, 403
        )
        r = cliente_de(self.e.admin).post("/api/v1/dispositivos/", datos)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["registrado_por"], self.e.admin.pk)

    def test_supervisor_solo_ajusta_el_intervalo(self):
        cliente = cliente_de(self.e.supervisor)
        url = f"/api/v1/dispositivos/{self.e.dispositivo.pk}/"
        self.assertEqual(cliente.patch(url, {"nombre": "Otro"}).status_code, 400)
        r = cliente.patch(url, {"intervalo_muestreo_seg": 60})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(cliente.patch(url, {"intervalo_muestreo_seg": 200}).status_code, 400)

    def test_la_baja_conserva_el_dispositivo(self):
        r = cliente_de(self.e.admin).delete(f"/api/v1/dispositivos/{self.e.dispositivo.pk}/")
        self.assertEqual(r.status_code, 204)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_BAJA)


class SinConexionTests(PruebaBase):
    def setUp(self):
        self.e = Escenario()

    def configurar(self, segundos_sin_datos, estado=roles.DISPOSITIVO_EN_LINEA):
        Dispositivo.objects.filter(pk=self.e.dispositivo.pk).update(
            estado_dispositivo_id=estado,
            ultima_conexion=timezone.now() - timedelta(seconds=segundos_sin_datos),
        )

    def test_marca_el_dispositivo_que_dejo_de_enviar(self):
        self.configurar(200)  # intervalo 30 s x factor 3 = 90 s
        self.assertEqual(len(marcar_sin_conexion()), 1)
        self.e.dispositivo.refresh_from_db()
        self.assertEqual(self.e.dispositivo.estado_dispositivo_id, roles.DISPOSITIVO_SIN_CONEXION)

    def test_no_marca_al_que_envio_hace_poco(self):
        self.configurar(20)
        self.assertEqual(marcar_sin_conexion(), [])

    def test_respeta_mantenimiento(self):
        self.configurar(500, estado=roles.DISPOSITIVO_MANTENIMIENTO)
        self.assertEqual(marcar_sin_conexion(), [])
